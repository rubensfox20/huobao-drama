import { spawnSync } from 'node:child_process'
import { clearProviderConnection, getProviderConnection, upsertProviderConnection } from './repository.js'
import {
  clearProviderRuntimeSession,
  createProviderRuntimeSession,
  getProviderRuntimeSession,
  updateProviderRuntimeSession,
} from './session-store.js'
import {
  defaultConnectionModel,
  getGitHubCopilotRequestHeaders,
  GITHUB_COPILOT_BASE_URL,
  getGitHubCopilotSafeModelId,
  hashSecretSignature,
  normalizeString,
  type ConnectableProvider,
} from './shared.js'

const PROVIDER: ConnectableProvider = 'github-copilot'
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23liWV2HdC0RBLecWx'
const GITHUB_COPILOT_SCOPES = 'read:user,user:email'
const DEFAULT_GITHUB_COPILOT_EXPIRES_IN_SECONDS = 365 * 24 * 60 * 60
const ACTIVE_GITHUB_COPILOT_FLOWS_KEY = Symbol.for('huobao-drama.activeGithubCopilotFlows')

type GitHubCopilotStartMode = 'local' | 'code'

type GitHubCopilotFlowState = {
  deviceCode: string
  intervalSeconds: number
  timeoutId: NodeJS.Timeout | null
  active: boolean
}

type GitHubCopilotValidationCode =
  | 'copilot_not_licensed'
  | 'invalid_github_token'
  | 'github_auth_failed'

function getActiveFlows() {
  const root = globalThis as typeof globalThis & {
    [ACTIVE_GITHUB_COPILOT_FLOWS_KEY]?: Map<string, GitHubCopilotFlowState>
  }

  if (!root[ACTIVE_GITHUB_COPILOT_FLOWS_KEY]) {
    root[ACTIVE_GITHUB_COPILOT_FLOWS_KEY] = new Map()
  }

  return root[ACTIVE_GITHUB_COPILOT_FLOWS_KEY]!
}

function flowKey() {
  return PROVIDER
}

function getGitHubOauthDeviceCodeUrl() {
  return 'https://github.com/login/device/code'
}

function getGitHubOauthAccessTokenUrl() {
  return 'https://github.com/login/oauth/access_token'
}

function getGitHubApiBaseUrl() {
  return 'https://api.github.com'
}

function resolveGitHubCliPath() {
  const configured = process.env.GH_BIN?.trim()
  if (configured) return configured

  if (process.platform !== 'win32') return 'gh'

  const result = spawnSync('where.exe', ['gh'], {
    encoding: 'utf8',
    env: process.env,
  })

  if (result.status !== 0) return 'gh'

  const candidates = result.stdout
    .trim()
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  return (
    candidates.find(candidate => candidate.toLowerCase().endsWith('.exe'))
    || candidates.find(candidate => candidate.toLowerCase().endsWith('.cmd'))
    || candidates[0]
    || 'gh'
  )
}

function getGitHubCliToken() {
  const result = spawnSync(resolveGitHubCliPath(), ['auth', 'token'], {
    encoding: 'utf8',
    env: process.env,
  })
  if (result.status !== 0) return undefined
  return normalizeString(result.stdout)
}

function createGitHubCopilotError(message: string, code: GitHubCopilotValidationCode, details?: string) {
  const error = new Error(message) as Error & {
    code?: GitHubCopilotValidationCode
    details?: string
  }
  error.code = code
  error.details = details
  return error
}

function normalizeGitHubCopilotValidationError(rawBody: string, status: number) {
  const message = normalizeString(rawBody) || `GitHub Copilot validation failed with ${status}`
  const normalized = message.toLowerCase()

  if (normalized.includes('not licensed to use copilot')) {
    return createGitHubCopilotError(
      'Esta conta do GitHub nao tem licenca do Copilot. Use outra conta ou outro provider de texto.',
      'copilot_not_licensed',
      message,
    )
  }

  if (normalized.includes('bad credentials') || normalized.includes('invalid token') || status === 401) {
    return createGitHubCopilotError(
      'O token atual do GitHub CLI nao e valido para o Copilot.',
      'invalid_github_token',
      message,
    )
  }

  return createGitHubCopilotError(message, 'github_auth_failed', message)
}

function buildGitHubCopilotFailurePatch(error: unknown, fallbackMessage: string) {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code || '')
      : ''

  const message =
    error instanceof Error && normalizeString(error.message)
      ? error.message
      : fallbackMessage

  const stage = code === 'copilot_not_licensed' ? 'not_licensed' : 'failed'

  return {
    status: 'failed' as const,
    stage,
    message,
    details: error instanceof Error
      ? ((error as Error & { details?: string }).details || error.stack || error.message)
      : String(error),
    authUrl: undefined,
    verificationUri: undefined,
    userCode: undefined,
    accountLabel: undefined,
  }
}

async function fetchGitHubUserAccount(githubAccessToken: string) {
  const headers = {
    Authorization: `Bearer ${githubAccessToken}`,
    Accept: 'application/json',
  }

  const [userResponse, emailsResponse] = await Promise.all([
    fetch(`${getGitHubApiBaseUrl()}/user`, { headers }),
    fetch(`${getGitHubApiBaseUrl()}/user/emails`, { headers }),
  ])

  let accountName: string | undefined
  let accountEmail: string | undefined

  if (userResponse.ok) {
    const userPayload = await userResponse.json() as { login?: string; name?: string | null }
    accountName = userPayload.name ?? userPayload.login ?? undefined
  }

  if (emailsResponse.ok) {
    const emailsPayload = await emailsResponse.json() as Array<{ email?: string; primary?: boolean }>
    accountEmail =
      emailsPayload.find(email => email.primary)?.email
      ?? emailsPayload[0]?.email
      ?? undefined
  }

  return { accountEmail, accountName }
}

async function validateGitHubCopilotToken(githubAccessToken: string) {
  const response = await fetch(`${GITHUB_COPILOT_BASE_URL}/models`, {
    headers: getGitHubCopilotRequestHeaders(githubAccessToken),
    signal: AbortSignal.timeout(15_000),
  })

  const rawBody = await response.text().catch(() => '')
  if (!response.ok) {
    throw normalizeGitHubCopilotValidationError(rawBody, response.status)
  }

  try {
    const payload = JSON.parse(rawBody) as Array<{ id?: string }>
    let models = Array.isArray(payload)
      ? payload.map(item => normalizeString(item.id)).filter(Boolean)
      : []
    if (!models.length) {
      models = await probeGitHubCopilotWorkingModels(githubAccessToken)
    }
    return {
      brokerBaseUrl: GITHUB_COPILOT_BASE_URL,
      modelsUrl: `${GITHUB_COPILOT_BASE_URL}/models`,
      availableModels: models,
    }
  } catch {
    const models = await probeGitHubCopilotWorkingModels(githubAccessToken)
    return {
      brokerBaseUrl: GITHUB_COPILOT_BASE_URL,
      modelsUrl: `${GITHUB_COPILOT_BASE_URL}/models`,
      availableModels: models,
    }
  }
}

async function probeGitHubCopilotWorkingModels(githubAccessToken: string) {
  const candidates = [
    getGitHubCopilotSafeModelId(defaultConnectionModel(PROVIDER)),
    'gpt-4o-mini',
    'gpt-5-mini',
    'gpt-4.1',
  ]

  const supported = new Set<string>()

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${GITHUB_COPILOT_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getGitHubCopilotRequestHeaders(githubAccessToken),
        },
        body: JSON.stringify({
          model: candidate,
          messages: [{ role: 'user', content: 'Reply with OK only.' }],
        }),
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) continue
      supported.add(candidate)
      break
    } catch {
      // ignore probe failures and continue
    }
  }

  return [...supported]
}

async function storeGitHubCopilotSession(params: {
  githubAccessToken: string
  accountEmail?: string
  accountName?: string
  scopes?: string[]
  activeSource: 'gh-cli' | 'github-device-flow'
}) {
  const validation = await validateGitHubCopilotToken(params.githubAccessToken)
  const account = params.accountEmail || params.accountName
    ? { accountEmail: params.accountEmail, accountName: params.accountName }
    : await fetchGitHubUserAccount(params.githubAccessToken)

  const accountLabel = account.accountEmail || account.accountName
  upsertProviderConnection({
    provider: PROVIDER,
    activeSource: params.activeSource,
    ignoredAuthSignature: params.activeSource === 'gh-cli' ? hashSecretSignature(params.githubAccessToken) : null,
    accountLabel: accountLabel || null,
    oauthPayload: {
      accessToken: params.githubAccessToken,
      refreshToken: params.githubAccessToken,
      expiresIn: DEFAULT_GITHUB_COPILOT_EXPIRES_IN_SECONDS,
      tokenTimestamp: Math.floor(Date.now() / 1000),
      accountEmail: account.accountEmail,
      accountName: account.accountName,
      brokerBaseUrl: validation.brokerBaseUrl,
      modelsUrl: validation.modelsUrl,
      scopes: params.scopes,
      oauthAuthMode: params.activeSource,
      metadata: {
        availableModels: validation.availableModels,
      },
    },
    metadata: {
      baseUrl: GITHUB_COPILOT_BASE_URL,
      availableModels: validation.availableModels,
      localLoginAvailable: Boolean(getGitHubCliToken()),
    },
  })

  return {
    accountLabel,
    availableModels: validation.availableModels,
  }
}

export async function syncGitHubCopilotSessionFromGh() {
  stopPolling()
  const githubAccessToken = getGitHubCliToken()
  if (!githubAccessToken) {
    clearProviderConnection(PROVIDER)
    createProviderRuntimeSession({
      providerId: PROVIDER,
      flowType: 'oauth',
      status: 'failed',
      stage: 'failed',
      mode: 'local',
      message: 'Nenhum login valido do GitHub CLI foi encontrado para importar.',
    })
    return { connected: false }
  }

  createProviderRuntimeSession({
    providerId: PROVIDER,
    flowType: 'oauth',
    status: 'running',
    stage: 'validating_local_login',
    mode: 'local',
    message: 'Validando o login local do GitHub CLI...',
  })

  try {
    const stored = await storeGitHubCopilotSession({
      githubAccessToken,
      activeSource: 'gh-cli',
    })

    updateProviderRuntimeSession(PROVIDER, {
      status: 'completed',
      stage: 'connected',
      message: stored.accountLabel
        ? `GitHub Copilot conectado como ${stored.accountLabel}.`
        : 'GitHub Copilot conectado.',
      accountLabel: stored.accountLabel,
    })

    return {
      connected: true,
      accountLabel: stored.accountLabel,
      availableModels: stored.availableModels,
    }
  } catch (error) {
    clearProviderConnection(PROVIDER)
    updateProviderRuntimeSession(PROVIDER, buildGitHubCopilotFailurePatch(error, 'Falha ao validar o login local do GitHub CLI.'))
    return { connected: false }
  }
}

function stopPolling() {
  const flow = getActiveFlows().get(flowKey())
  if (!flow) return
  if (flow.timeoutId) clearTimeout(flow.timeoutId)
  flow.timeoutId = null
  flow.active = false
  getActiveFlows().delete(flowKey())
}

async function pollForAccessToken() {
  const flow = getActiveFlows().get(flowKey())
  if (!flow || !flow.active) return

  updateProviderRuntimeSession(PROVIDER, {
    stage: 'waiting_browser_completion',
    message: 'Aguardando a autorizacao do GitHub Copilot. Conclua o login no navegador.',
  })

  try {
    const response = await fetch(getGitHubOauthAccessTokenUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        device_code: flow.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })

    const data = await response.json() as {
      access_token?: string
      error?: string
      error_description?: string
      scope?: string
    }

    if (response.ok && data.access_token) {
      const stored = await storeGitHubCopilotSession({
        githubAccessToken: data.access_token,
        scopes: data.scope
          ? data.scope.split(/[,\s]+/).map(scope => scope.trim()).filter(Boolean)
          : undefined,
        activeSource: 'github-device-flow',
      })

      updateProviderRuntimeSession(PROVIDER, {
        status: 'completed',
        stage: 'connected',
        message: stored.accountLabel
          ? `GitHub Copilot conectado como ${stored.accountLabel}.`
          : 'GitHub Copilot conectado.',
        accountLabel: stored.accountLabel,
        verificationUri: undefined,
        userCode: undefined,
      })

      stopPolling()
      return
    }

    switch (data.error) {
      case 'authorization_pending':
        flow.timeoutId = setTimeout(() => { void pollForAccessToken() }, flow.intervalSeconds * 1000)
        return
      case 'slow_down':
        flow.intervalSeconds += 5
        flow.timeoutId = setTimeout(() => { void pollForAccessToken() }, flow.intervalSeconds * 1000)
        return
      case 'expired_token':
        updateProviderRuntimeSession(PROVIDER, {
          status: 'failed',
          stage: 'failed',
          message: 'O codigo do GitHub expirou. Inicie a conexao novamente.',
          authUrl: undefined,
          verificationUri: undefined,
          userCode: undefined,
        })
        stopPolling()
        return
      case 'access_denied':
        updateProviderRuntimeSession(PROVIDER, {
          status: 'failed',
          stage: 'failed',
          message: 'A autorizacao do GitHub foi negada.',
          authUrl: undefined,
          verificationUri: undefined,
          userCode: undefined,
        })
        stopPolling()
        return
      default:
        throw new Error(data.error_description || data.error || 'Falha ao concluir o login do GitHub Copilot.')
    }
  } catch (error) {
    clearProviderConnection(PROVIDER)
    updateProviderRuntimeSession(PROVIDER, buildGitHubCopilotFailurePatch(error, 'Falha ao concluir o login do GitHub Copilot.'))
    stopPolling()
  }
}

export async function startGitHubCopilotConnection(mode: GitHubCopilotStartMode) {
  if (mode === 'local') {
    return syncGitHubCopilotSessionFromGh()
  }

  const runningFlow = getActiveFlows().get(flowKey())
  if (runningFlow?.active) {
    return getGitHubCopilotProviderSessionPayload()
  }

  createProviderRuntimeSession({
    providerId: PROVIDER,
    flowType: 'oauth',
    status: 'running',
    stage: 'requesting_device_code',
    mode: 'code',
    message: 'Solicitando codigo de verificacao do GitHub Copilot...',
  })

  const response = await fetch(getGitHubOauthDeviceCodeUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_COPILOT_SCOPES,
    }),
  })

  const data = await response.json() as {
    device_code?: string
    user_code?: string
    verification_uri?: string
    interval?: number
    error?: string
    error_description?: string
  }

  if (!response.ok || !data.device_code || !data.user_code || !data.verification_uri) {
    updateProviderRuntimeSession(PROVIDER, {
      status: 'failed',
      stage: 'failed',
      message: data.error_description || data.error || 'Falha ao iniciar o device flow do GitHub Copilot.',
    })
    return getGitHubCopilotProviderSessionPayload()
  }

  getActiveFlows().set(flowKey(), {
    deviceCode: data.device_code,
    intervalSeconds: Number(data.interval || 5),
    timeoutId: null,
    active: true,
  })

  updateProviderRuntimeSession(PROVIDER, {
    status: 'running',
    stage: 'waiting_browser_completion',
    mode: 'code',
    message: 'Conclua a autorizacao do GitHub Copilot no navegador.',
    verificationUri: data.verification_uri,
    authUrl: data.verification_uri,
    userCode: data.user_code,
  })

  void pollForAccessToken()
  return getGitHubCopilotProviderSessionPayload()
}

export function disconnectGitHubCopilotConnection() {
  stopPolling()
  clearProviderConnection(PROVIDER)
  clearProviderRuntimeSession(PROVIDER)
  return getGitHubCopilotProviderSessionPayload()
}

export function cancelGitHubCopilotConnection() {
  stopPolling()
  updateProviderRuntimeSession(PROVIDER, {
    status: 'cancelled',
    stage: 'cancelled',
    message: 'Fluxo do GitHub Copilot cancelado.',
    authUrl: undefined,
    verificationUri: undefined,
    userCode: undefined,
  })
  return getGitHubCopilotProviderSessionPayload()
}

export function getGitHubCopilotResolvedCredential() {
  const connection = getProviderConnection(PROVIDER)
  const accessToken = normalizeString(connection?.oauthPayload?.accessToken)
  if (!accessToken) return null

  return {
    provider: PROVIDER,
    accessToken,
    baseUrl: GITHUB_COPILOT_BASE_URL,
    accountLabel: connection?.accountLabel || connection?.oauthPayload?.accountEmail || connection?.oauthPayload?.accountName,
    activeSource: connection?.activeSource || 'gh-cli',
    availableModels: Array.isArray(connection?.metadata?.availableModels)
      ? connection?.metadata?.availableModels
      : Array.isArray(connection?.oauthPayload?.metadata?.availableModels)
        ? connection.oauthPayload.metadata.availableModels as string[]
        : [defaultConnectionModel(PROVIDER)],
  }
}

export function getGitHubCopilotProviderSessionPayload() {
  const connection = getProviderConnection(PROVIDER)
  const runtimeSession = getProviderRuntimeSession(PROVIDER)
  return {
    provider: PROVIDER,
    dependency_available: Boolean(resolveGitHubCliPath()),
    connected: Boolean(connection?.oauthPayload?.accessToken),
    local_login_available: Boolean(getGitHubCliToken()),
    active_source: connection?.activeSource || null,
    account_label: connection?.accountLabel || connection?.oauthPayload?.accountEmail || connection?.oauthPayload?.accountName || null,
    verification_uri: runtimeSession?.verificationUri || null,
    user_code: runtimeSession?.userCode || null,
    auth_url: runtimeSession?.authUrl || null,
    session: runtimeSession,
    available_models: Array.isArray(connection?.metadata?.availableModels)
      ? connection?.metadata?.availableModels
      : Array.isArray(connection?.oauthPayload?.metadata?.availableModels)
        ? connection.oauthPayload.metadata.availableModels
        : [],
  }
}
