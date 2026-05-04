import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { clearProviderConnection, getProviderConnection, upsertProviderConnection } from './repository.js'
import {
  clearProviderRuntimeSession,
  createProviderRuntimeSession,
  getProviderRuntimeSession,
  updateProviderRuntimeSession,
} from './session-store.js'
import {
  decodeJwtPayload,
  normalizeString,
  OPENAI_CODEX_BASE_URL,
  type ConnectableProvider,
  type ProviderConnectionSource,
} from './shared.js'

const PROVIDER: ConnectableProvider = 'openai-codex'
const DEFAULT_DEVICE_CODE_URL = 'https://auth.openai.com/codex/device'
const ACTIVE_OPENAI_FLOWS_KEY = Symbol.for('huobao-drama.activeOpenAICodexFlows')

type OpenAICodexStartMode = 'local' | 'login' | 'code'

type StoredCodexAuthFile = {
  auth_mode?: string
  tokens?: {
    access_token?: string
    refresh_token?: string
    id_token?: string
    account_id?: string
  }
  last_refresh?: string | number
}

type OpenAIFlowState = {
  process: ChildProcessWithoutNullStreams
  stdoutBuffer: string
  stderrBuffer: string
  poller: NodeJS.Timeout | null
  cancelled: boolean
  completed: boolean
  codexHomeOverride?: string
  mode: 'login' | 'code'
}

function getActiveFlows() {
  const root = globalThis as typeof globalThis & {
    [ACTIVE_OPENAI_FLOWS_KEY]?: Map<string, OpenAIFlowState>
  }

  if (!root[ACTIVE_OPENAI_FLOWS_KEY]) {
    root[ACTIVE_OPENAI_FLOWS_KEY] = new Map()
  }

  return root[ACTIVE_OPENAI_FLOWS_KEY]!
}

function flowKey() {
  return PROVIDER
}

function resolveCodexBinary() {
  return process.env.CODEX_BIN?.trim() || 'codex'
}

function resolveInstalledCommand(command: string) {
  if (process.platform === 'win32') {
    const result = spawnSync('where.exe', [command], {
      encoding: 'utf8',
      env: process.env,
    })

    if (result.status === 0) {
      const candidates = result.stdout
        .trim()
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)

      return (
        candidates.find(candidate => candidate.toLowerCase().endsWith('.exe'))
        || candidates.find(candidate => candidate.toLowerCase().endsWith('.cmd'))
        || candidates.find(candidate => candidate.toLowerCase().endsWith('.bat'))
        || candidates[0]
      )
    }

    return undefined
  }

  const result = spawnSync('sh', ['-lc', `command -v ${command}`], {
    encoding: 'utf8',
    env: process.env,
  })
  return result.status === 0 ? normalizeString(result.stdout) : undefined
}

function requiresShellForSpawn(command: string) {
  if (process.platform !== 'win32') return false
  const normalized = command.toLowerCase()
  return normalized.endsWith('.cmd') || normalized.endsWith('.bat')
}

export function assertCodexBinaryAvailable() {
  const resolved = resolveInstalledCommand(resolveCodexBinary())
  if (resolved) return resolved
  throw new Error('Codex CLI nao foi encontrado. Instale o `codex` ou configure CODEX_BIN com o caminho correto.')
}

function resolveCodexHomeDirectory(codexHomeOverride?: string) {
  return (
    codexHomeOverride?.trim()
    || process.env.CODEX_HOME?.trim()
    || process.env.USERPROFILE?.trim()
    || process.env.HOME?.trim()
    || os.homedir()
  )
}

function getCodexAuthFileCandidates(codexHomeOverride?: string) {
  const root = resolveCodexHomeDirectory(codexHomeOverride)
  const explicitCodexHome = Boolean(codexHomeOverride?.trim() || process.env.CODEX_HOME?.trim())

  return explicitCodexHome
    ? [path.join(root, 'auth.json'), path.join(root, '.codex', 'auth.json')]
    : [path.join(root, '.codex', 'auth.json'), path.join(root, 'auth.json')]
}

function resolveExistingCodexAuthFilePath(codexHomeOverride?: string) {
  for (const candidate of getCodexAuthFileCandidates(codexHomeOverride)) {
    if (fs.existsSync(candidate)) return candidate
  }
  return undefined
}

function readCodexAuthFile(codexHomeOverride?: string): StoredCodexAuthFile | null {
  try {
    const authFilePath = resolveExistingCodexAuthFilePath(codexHomeOverride)
    if (!authFilePath) return null
    return JSON.parse(fs.readFileSync(authFilePath, 'utf8')) as StoredCodexAuthFile
  } catch {
    return null
  }
}

export function getCodexAuthFileSignature(codexHomeOverride?: string) {
  try {
    const authFilePath = resolveExistingCodexAuthFilePath(codexHomeOverride)
    if (!authFilePath) return undefined
    const stats = fs.statSync(authFilePath)
    return `${stats.size}:${Math.floor(stats.mtimeMs)}`
  } catch {
    return undefined
  }
}

export function hasLocalOpenAICodexLogin(codexHomeOverride?: string) {
  const authFile = readCodexAuthFile(codexHomeOverride)
  return authFile?.auth_mode === 'chatgpt' && Boolean(authFile.tokens?.access_token)
}

function createIsolatedCodexHomeDirectory() {
  const tempRoot = path.join(os.tmpdir(), 'huobao-drama', 'codex-auth')
  fs.mkdirSync(tempRoot, { recursive: true })
  return fs.mkdtempSync(path.join(tempRoot, 'session-'))
}

function cleanupCodexHomeDirectory(codexHomeOverride?: string) {
  if (!codexHomeOverride) return
  const tempRoot = path.resolve(path.join(os.tmpdir(), 'huobao-drama', 'codex-auth'))
  const target = path.resolve(codexHomeOverride)
  if (!target.startsWith(tempRoot)) return
  try {
    fs.rmSync(target, { recursive: true, force: true })
  } catch {
    // best effort
  }
}

function stripAnsiControlSequences(value: string) {
  return value
    .replace(/[\u001B\u009B][[\]()#;?]*(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~])/g, '')
    .replace(/\r/g, '')
}

function extractAuthUrl(output: string) {
  const sanitizedOutput = stripAnsiControlSequences(output)
  const directUrlMatch = sanitizedOutput.match(/https?:\/\/[^\s)]+/g)
  if (!directUrlMatch?.length) return undefined
  const normalizedUrls = directUrlMatch.map(url => url.replace(/[.,;]+$/g, ''))
  const preferredCodexUrl = normalizedUrls.find(url => url.startsWith(DEFAULT_DEVICE_CODE_URL))
  return preferredCodexUrl ?? normalizedUrls[normalizedUrls.length - 1]
}

function extractUserCode(output: string) {
  const sanitizedOutput = stripAnsiControlSequences(output)
  const explicitMatch = sanitizedOutput.match(/one-time code(?:\s*\(.*?\))?\s+([A-Z0-9-]{4,})/i)
  if (explicitMatch?.[1]) return explicitMatch[1]
  return sanitizedOutput.match(/\n\s*([A-Z0-9]{4,}-[A-Z0-9-]{4,})\s*(?:\n|$)/)?.[1]
}

function trimTranscript(value: string) {
  const sanitizedValue = stripAnsiControlSequences(value)
  return sanitizedValue.length <= 24000
    ? sanitizedValue
    : sanitizedValue.slice(sanitizedValue.length - 24000)
}

function updateDeviceHints(flow: OpenAIFlowState) {
  const combinedOutput = `${flow.stdoutBuffer}\n${flow.stderrBuffer}`
  const authUrl = extractAuthUrl(combinedOutput) || DEFAULT_DEVICE_CODE_URL
  const userCode = extractUserCode(combinedOutput)

  updateProviderRuntimeSession(PROVIDER, current => ({
    authUrl,
    verificationUri: authUrl,
    userCode,
    details: trimTranscript(combinedOutput),
    stage: userCode ? 'waiting_browser_completion' : current.stage,
    message: userCode
      ? 'Conclua o login do Codex no navegador. Se quiser usar outra conta, abra o link em janela anonima.'
      : current.message,
  }))
}

function cleanupFlow(options: { keepSession?: boolean } = {}) {
  const activeFlows = getActiveFlows()
  const flow = activeFlows.get(flowKey())
  if (!flow) {
    if (!options.keepSession) clearProviderRuntimeSession(PROVIDER)
    return
  }

  if (flow.poller) {
    clearInterval(flow.poller)
    flow.poller = null
  }

  if (flow.process.exitCode == null && !flow.process.killed) {
    flow.process.kill('SIGTERM')
  }

  activeFlows.delete(flowKey())
  cleanupCodexHomeDirectory(flow.codexHomeOverride)

  if (!options.keepSession) clearProviderRuntimeSession(PROVIDER)
}

function failFlow(error: unknown) {
  const message = error instanceof Error ? error.message : 'Falha ao conectar OpenAI Codex.'
  updateProviderRuntimeSession(PROVIDER, current => ({
    status: 'failed',
    stage: 'failed',
    message,
    details: trimTranscript(
      [current.details, error instanceof Error ? error.stack : String(error)]
        .filter(Boolean)
        .join('\n\n'),
    ),
  }))
  cleanupFlow({ keepSession: true })
}

function completeFlow(payload: { accountLabel?: string; signature?: string; activeSource: ProviderConnectionSource }) {
  updateProviderRuntimeSession(PROVIDER, {
    status: 'completed',
    stage: 'connected',
    message: payload.accountLabel
      ? `OpenAI Codex conectado como ${payload.accountLabel}.`
      : 'OpenAI Codex conectado.',
    accountLabel: payload.accountLabel,
    authUrl: undefined,
    verificationUri: undefined,
    userCode: undefined,
  })
  cleanupFlow({ keepSession: true })
}

async function syncOpenAICodexSessionFromDiskRaw(options: {
  force?: boolean
  codexHomeOverride?: string
  activeSource?: ProviderConnectionSource
} = {}) {
  const signature = getCodexAuthFileSignature(options.codexHomeOverride)
  const currentConnection = getProviderConnection(PROVIDER)

  if (!options.force && signature && signature === currentConnection?.ignoredAuthSignature) {
    return {
      connected: Boolean(currentConnection?.oauthPayload?.accessToken),
      synced: false,
      signature,
      activeSource: currentConnection?.activeSource || 'codex-local',
      accountLabel: currentConnection?.accountLabel || undefined,
    }
  }

  const authFile = readCodexAuthFile(options.codexHomeOverride)
  if (!authFile || authFile.auth_mode !== 'chatgpt') {
    return { connected: false, synced: false, signature }
  }

  const accessToken = normalizeString(authFile.tokens?.access_token)
  const refreshToken = normalizeString(authFile.tokens?.refresh_token)
  const idToken = normalizeString(authFile.tokens?.id_token)
  if (!accessToken || !refreshToken) {
    return { connected: false, synced: false, signature }
  }

  const idTokenClaims = decodeJwtPayload(idToken)
  const accountEmail = normalizeString(typeof idTokenClaims?.email === 'string' ? idTokenClaims.email : undefined)
  const accountName = normalizeString(typeof idTokenClaims?.name === 'string' ? idTokenClaims.name : undefined)
  const accountLabel = accountEmail || accountName
  const activeSource = options.activeSource || 'codex-local'

  upsertProviderConnection({
    provider: PROVIDER,
    activeSource,
    ignoredAuthSignature: signature || null,
    accountLabel: accountLabel || null,
    oauthPayload: {
      accessToken,
      refreshToken,
      idToken,
      accountEmail,
      accountName,
      oauthAuthMode: activeSource,
      metadata: {
        brokerBaseUrl: OPENAI_CODEX_BASE_URL,
        authMode: authFile.auth_mode,
        lastRefresh: authFile.last_refresh || null,
      },
    },
    metadata: {
      baseUrl: OPENAI_CODEX_BASE_URL,
      localLoginAvailable: hasLocalOpenAICodexLogin(options.codexHomeOverride),
    },
  })

  return {
    connected: true,
    synced: true,
    signature,
    activeSource,
    accountLabel,
  }
}

export async function syncOpenAICodexSessionFromDisk(options: {
  force?: boolean
  codexHomeOverride?: string
  activeSource?: ProviderConnectionSource
} = {}) {
  cleanupFlow({ keepSession: false })

  createProviderRuntimeSession({
    providerId: PROVIDER,
    flowType: 'oauth',
    status: 'running',
    stage: 'validating_local_login',
    mode: 'local',
    message: 'Validando a sessao local do Codex...',
  })

  try {
    assertCodexBinaryAvailable()

    if (!hasLocalOpenAICodexLogin(options.codexHomeOverride)) {
      clearProviderConnection(PROVIDER)
      updateProviderRuntimeSession(PROVIDER, {
        status: 'failed',
        stage: 'failed',
        message: 'Nenhuma sessao local valida do Codex foi encontrada para importar.',
      })
      return { connected: false, synced: false }
    }

    const synced = await syncOpenAICodexSessionFromDiskRaw({
      ...options,
      force: true,
      activeSource: options.activeSource || 'codex-local',
    })

    if (!synced.connected) {
      clearProviderConnection(PROVIDER)
      updateProviderRuntimeSession(PROVIDER, {
        status: 'failed',
        stage: 'failed',
        message: 'Falha ao sincronizar a sessao local do Codex.',
      })
      return synced
    }

    updateProviderRuntimeSession(PROVIDER, {
      status: 'completed',
      stage: 'connected',
      message: synced.accountLabel
        ? `OpenAI Codex conectado como ${synced.accountLabel}.`
        : 'OpenAI Codex conectado.',
      accountLabel: synced.accountLabel,
      authUrl: undefined,
      verificationUri: undefined,
      userCode: undefined,
    })

    return synced
  } catch (error) {
    clearProviderConnection(PROVIDER)
    updateProviderRuntimeSession(PROVIDER, {
      status: 'failed',
      stage: 'failed',
      message: error instanceof Error ? error.message : 'Falha ao sincronizar a sessao local do Codex.',
      details: error instanceof Error ? (error.stack || error.message) : String(error),
    })
    return { connected: false, synced: false }
  }
}

function createFlowSession(mode: OpenAICodexStartMode) {
  return createProviderRuntimeSession({
    providerId: PROVIDER,
    flowType: 'oauth',
    status: 'running',
    stage: mode === 'code' ? 'waiting_device_code' : mode === 'login' ? 'opening_browser' : 'validating_local_login',
    mode,
    message: mode === 'local'
      ? 'Validando a sessao local do Codex...'
      : mode === 'login'
        ? 'Abrindo o fluxo web do Codex...'
        : 'Gerando codigo de verificacao do Codex...',
  })
}

export async function startOpenAICodexConnection(mode: OpenAICodexStartMode) {
  if (mode === 'local') {
    createFlowSession(mode)

    try {
      assertCodexBinaryAvailable()
      if (!hasLocalOpenAICodexLogin()) {
        updateProviderRuntimeSession(PROVIDER, {
          status: 'failed',
          stage: 'failed',
          message: 'Nenhuma sessao local valida do Codex foi encontrada para importar.',
        })
        return getOpenAICodexProviderSessionPayload()
      }

      const synced = await syncOpenAICodexSessionFromDiskRaw({
        force: true,
        activeSource: 'codex-local',
      })

      if (!synced.connected) {
        updateProviderRuntimeSession(PROVIDER, {
          status: 'failed',
          stage: 'failed',
          message: 'Falha ao sincronizar a sessao local do Codex.',
        })
      } else {
        updateProviderRuntimeSession(PROVIDER, {
          status: 'completed',
          stage: 'connected',
          message: synced.accountLabel
            ? `OpenAI Codex conectado como ${synced.accountLabel}.`
            : 'OpenAI Codex conectado.',
          accountLabel: synced.accountLabel,
        })
      }

      return getOpenAICodexProviderSessionPayload()
    } catch (error) {
      failFlow(error)
      return getOpenAICodexProviderSessionPayload()
    }
  }

  const runningFlow = getActiveFlows().get(flowKey())
  if (runningFlow && !runningFlow.completed && !runningFlow.cancelled) {
    return getOpenAICodexProviderSessionPayload()
  }

  try {
    const binary = assertCodexBinaryAvailable()
    cleanupFlow()
    createFlowSession(mode)

    const codexHomeOverride = createIsolatedCodexHomeDirectory()
    const args = mode === 'code' ? ['login', '--device-auth'] : ['login']
    const child = spawn(binary, args, {
      env: {
        ...process.env,
        CODEX_HOME: codexHomeOverride,
      },
      cwd: process.cwd(),
      stdio: 'pipe',
      shell: requiresShellForSpawn(binary),
    })

    const flow: OpenAIFlowState = {
      process: child,
      stdoutBuffer: '',
      stderrBuffer: '',
      poller: null,
      cancelled: false,
      completed: false,
      codexHomeOverride,
      mode: mode === 'code' ? 'code' : 'login',
    }
    getActiveFlows().set(flowKey(), flow)

    child.stdout.on('data', (chunk) => {
      flow.stdoutBuffer += chunk.toString()
      updateDeviceHints(flow)
    })
    child.stderr.on('data', (chunk) => {
      flow.stderrBuffer += chunk.toString()
      updateDeviceHints(flow)
    })
    child.on('error', (error) => {
      failFlow(error)
    })
    child.on('exit', async (code) => {
      if (flow.cancelled || flow.completed) return
      try {
        const synced = await syncOpenAICodexSessionFromDiskRaw({
          force: true,
          codexHomeOverride,
          activeSource: mode === 'code' ? 'codex-code' : 'codex-login',
        })

        if (synced.connected) {
          flow.completed = true
          completeFlow({
            accountLabel: synced.accountLabel,
            signature: synced.signature,
            activeSource: synced.activeSource as ProviderConnectionSource,
          })
          return
        }

        failFlow(new Error(code === 0
          ? 'Fluxo do Codex terminou sem gerar uma sessao valida.'
          : `Codex login encerrou com codigo ${code}.`))
      } catch (error) {
        failFlow(error)
      }
    })

    flow.poller = setInterval(async () => {
      if (flow.cancelled || flow.completed) return
      try {
        const synced = await syncOpenAICodexSessionFromDiskRaw({
          force: true,
          codexHomeOverride,
          activeSource: mode === 'code' ? 'codex-code' : 'codex-login',
        })
        if (!synced.connected) return

        flow.completed = true
        completeFlow({
          accountLabel: synced.accountLabel,
          signature: synced.signature,
          activeSource: synced.activeSource as ProviderConnectionSource,
        })
      } catch (error) {
        failFlow(error)
      }
    }, 1500)

    return getOpenAICodexProviderSessionPayload()
  } catch (error) {
    createFlowSession(mode)
    failFlow(error)
    return getOpenAICodexProviderSessionPayload()
  }
}

export function cancelOpenAICodexConnection() {
  const flow = getActiveFlows().get(flowKey())
  if (!flow) {
    clearProviderRuntimeSession(PROVIDER)
    return getOpenAICodexProviderSessionPayload()
  }

  flow.cancelled = true
  updateProviderRuntimeSession(PROVIDER, {
    status: 'cancelled',
    stage: 'cancelled',
    message: 'Fluxo do OpenAI Codex cancelado.',
  })
  cleanupFlow({ keepSession: true })
  return getOpenAICodexProviderSessionPayload()
}

export function disconnectOpenAICodexConnection() {
  cleanupFlow()
  clearProviderConnection(PROVIDER)
  clearProviderRuntimeSession(PROVIDER)
  return getOpenAICodexProviderSessionPayload()
}

export function getOpenAICodexResolvedCredential() {
  const connection = getProviderConnection(PROVIDER)
  const accessToken = normalizeString(connection?.oauthPayload?.accessToken)
  if (!accessToken) return null

  return {
    provider: PROVIDER,
    accessToken,
    baseUrl: OPENAI_CODEX_BASE_URL,
    accountLabel: connection?.accountLabel || connection?.oauthPayload?.accountEmail || connection?.oauthPayload?.accountName,
    activeSource: connection?.activeSource || 'codex-local',
  }
}

export function getOpenAICodexProviderSessionPayload() {
  const connection = getProviderConnection(PROVIDER)
  const runtimeSession = getProviderRuntimeSession(PROVIDER)
  return {
    provider: PROVIDER,
    dependency_available: Boolean(resolveInstalledCommand(resolveCodexBinary())),
    connected: Boolean(connection?.oauthPayload?.accessToken),
    local_login_available: hasLocalOpenAICodexLogin(),
    active_source: connection?.activeSource || null,
    account_label: connection?.accountLabel || connection?.oauthPayload?.accountEmail || connection?.oauthPayload?.accountName || null,
    verification_uri: runtimeSession?.verificationUri || runtimeSession?.authUrl || null,
    user_code: runtimeSession?.userCode || null,
    auth_url: runtimeSession?.authUrl || null,
    session: runtimeSession,
  }
}
