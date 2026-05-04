import { createHash } from 'node:crypto'

export type ConnectableProvider = 'openai-codex' | 'github-copilot'
export type ProviderConnectionSource =
  | 'codex-local'
  | 'codex-login'
  | 'codex-code'
  | 'gh-cli'
  | 'github-device-flow'

export const OPENAI_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex'
export const OPENAI_CODEX_SESSION_MODEL_IDS = [
  'gpt-5.4',
  'gpt-5-mini',
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex',
] as const
export const OPENAI_CODEX_SESSION_MODEL_ID_SET = new Set<string>(OPENAI_CODEX_SESSION_MODEL_IDS)

export function getOpenAICodexFallbackModelIds(modelId?: string | null) {
  const normalized = getOpenAICodexCompatibleModelId(modelId)
  const candidates = new Set<string>([normalized])

  if (normalized === 'gpt-5.4') {
    candidates.add('gpt-5.3-codex')
    candidates.add('gpt-5-mini')
    candidates.add('gpt-5.2-codex')
  } else if (normalized === 'gpt-5.3-codex') {
    candidates.add('gpt-5-mini')
    candidates.add('gpt-5.2-codex')
  } else if (normalized === 'gpt-5.2-codex') {
    candidates.add('gpt-5.3-codex')
    candidates.add('gpt-5-mini')
  } else if (normalized === 'gpt-5-mini') {
    candidates.add('gpt-5.3-codex')
    candidates.add('gpt-5.2-codex')
  } else {
    candidates.add('gpt-5.3-codex')
    candidates.add('gpt-5-mini')
  }

  return [...candidates]
}

export const GITHUB_COPILOT_BASE_URL = 'https://api.githubcopilot.com'
export const GITHUB_COPILOT_MODEL_PREFIX = 'github-copilot/'
export const GITHUB_COPILOT_API_VERSION = '2025-10-01'
export const GITHUB_COPILOT_INTEGRATION_ID = 'vscode-chat'
export const GITHUB_COPILOT_EDITOR_VERSION = 'vscode/1.99.0'
export const GITHUB_COPILOT_EDITOR_PLUGIN_VERSION = 'huobao-drama/1.0.0'
export const GITHUB_COPILOT_USER_AGENT = 'GitHubCopilotChat/1.0.0'
export const GITHUB_COPILOT_PREFERRED_MODEL_IDS = [
  'gpt-4o-mini',
  'gpt-5-mini',
  'gpt-4.1',
  'claude-haiku-4.5',
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.2-codex',
] as const

export const GITHUB_COPILOT_LEGACY_MODEL_ALIASES: Record<string, string> = {
  'gpt-5.1-codex-max': 'gpt-5.3-codex',
  'gpt-5.1-codex': 'gpt-5.2-codex',
  'gpt-5.2': 'gpt-5-mini',
  'claude-sonnet-4.6': 'claude-haiku-4.5',
  'gemini-3-pro-preview': 'gpt-5-mini',
  'gpt-41-copilot': 'gpt-4.1',
}

export function normalizeString(value?: string | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function isConnectionBackedTextProvider(provider?: string | null): provider is ConnectableProvider {
  const normalized = String(provider || '').trim().toLowerCase()
  return normalized === 'openai-codex' || normalized === 'github-copilot'
}

export function decodeJwtPayload(token?: string) {
  const payload = token?.split('.')?.[1]
  if (!payload) return undefined

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return undefined
  }
}

export function getOpenAICodexCompatibleModelId(modelId?: string | null) {
  const normalizedModelId = String(modelId || 'gpt-5.3-codex').trim().toLowerCase()

  if (normalizedModelId === 'gpt-5-mini' || normalizedModelId === 'gpt-5.4-mini') {
    return 'gpt-5-mini'
  }

  if (OPENAI_CODEX_SESSION_MODEL_ID_SET.has(normalizedModelId)) {
    return normalizedModelId
  }

  if (normalizedModelId === 'gpt-5-codex') {
    return 'gpt-5.3-codex'
  }

  if (normalizedModelId === 'gpt-5.1-codex-mini') {
    return 'gpt-5.1-codex-max'
  }

  if (normalizedModelId.startsWith('gpt-5.4') || normalizedModelId === 'gpt-5-chat-latest') {
    return 'gpt-5.3-codex'
  }

  if (normalizedModelId.startsWith('gpt-5.3')) {
    return 'gpt-5.3-codex'
  }

  if (normalizedModelId.startsWith('gpt-5.2')) {
    return normalizedModelId.includes('codex') ? 'gpt-5.2-codex' : 'gpt-5.2'
  }

  return 'gpt-5.3-codex'
}

export function stripGitHubCopilotModelPrefix(modelId: string) {
  return modelId.startsWith(GITHUB_COPILOT_MODEL_PREFIX)
    ? modelId.slice(GITHUB_COPILOT_MODEL_PREFIX.length)
    : modelId
}

export function prefixGitHubCopilotModelId(modelId: string) {
  return modelId.startsWith(GITHUB_COPILOT_MODEL_PREFIX)
    ? modelId
    : `${GITHUB_COPILOT_MODEL_PREFIX}${modelId}`
}

export function normalizeGitHubCopilotModelId(modelId?: string | null) {
  const normalized = stripGitHubCopilotModelPrefix(String(modelId || 'gpt-5-mini')).trim().toLowerCase()
  return GITHUB_COPILOT_LEGACY_MODEL_ALIASES[normalized] || normalized || 'gpt-5-mini'
}

export function getGitHubCopilotSafeModelId(modelId?: string | null, availableModels?: string[] | null) {
  const normalized = normalizeGitHubCopilotModelId(modelId)
  const normalizedAvailable = Array.isArray(availableModels)
    ? availableModels.map(item => normalizeGitHubCopilotModelId(item)).filter(Boolean)
    : []

  if (normalizedAvailable.includes(normalized)) {
    return normalized
  }

  if (normalizedAvailable.includes('gpt-4o-mini')) {
    return 'gpt-4o-mini'
  }

  if (normalizedAvailable.length > 0) {
    return normalizedAvailable[0]
  }

  if ([
    'gpt-5-mini',
    'gpt-4.1',
    'gpt-5.4',
    'gpt-5.3-codex',
    'gpt-5.2-codex',
    'claude-haiku-4.5',
  ].includes(normalized)) {
    return 'gpt-4o-mini'
  }

  return normalized || 'gpt-4o-mini'
}

export function getGitHubCopilotFallbackModelIds(modelId?: string | null) {
  const normalized = normalizeGitHubCopilotModelId(modelId)
  const candidates = new Set<string>([normalized])

  if (normalized.includes('codex')) {
    candidates.add('gpt-5.3-codex')
    candidates.add('gpt-5.2-codex')
    candidates.add('gpt-5-mini')
  } else if (normalized.startsWith('gpt-5')) {
    candidates.add('gpt-5-mini')
    candidates.add('gpt-4.1')
    candidates.add('gpt-4o-mini')
  } else if (normalized.startsWith('gpt-4')) {
    candidates.add('gpt-4.1')
    candidates.add('gpt-4o-mini')
    candidates.add('gpt-5-mini')
  } else if (normalized.includes('claude')) {
    candidates.add('claude-haiku-4.5')
    candidates.add('gpt-5-mini')
    candidates.add('gpt-4.1')
  }

  for (const fallbackModelId of GITHUB_COPILOT_PREFERRED_MODEL_IDS) {
    candidates.add(fallbackModelId)
  }

  return [...candidates]
}

export function getGitHubCopilotRequestHeaders(accessToken: string, includeAuthorization = true) {
  return {
    ...(includeAuthorization ? { Authorization: `Bearer ${accessToken}` } : {}),
    Accept: 'application/json',
    'X-GitHub-Api-Version': GITHUB_COPILOT_API_VERSION,
    'Copilot-Integration-Id': GITHUB_COPILOT_INTEGRATION_ID,
    'Editor-Version': GITHUB_COPILOT_EDITOR_VERSION,
    'Editor-Plugin-Version': GITHUB_COPILOT_EDITOR_PLUGIN_VERSION,
    'User-Agent': GITHUB_COPILOT_USER_AGENT,
  }
}

export function hashSecretSignature(value?: string | null) {
  const normalized = normalizeString(value)
  if (!normalized) return undefined
  return createHash('sha256').update(normalized).digest('hex')
}

export function defaultConnectionModel(provider: ConnectableProvider) {
  if (provider === 'openai-codex') return 'gpt-5.3-codex'
  return prefixGitHubCopilotModelId('gpt-4o-mini')
}

export function defaultConnectionBaseUrl(provider: ConnectableProvider) {
  if (provider === 'openai-codex') return OPENAI_CODEX_BASE_URL
  return GITHUB_COPILOT_BASE_URL
}
