
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'
import { joinProviderUrl } from './adapters/url.js'
import { revealAIConfigApiKey } from './ai-configs.js'
import { getResolvedTextConfig, type ResolvedTextConfig } from './text-provider.js'
import { getOpenAICodexResolvedCredential } from './provider-connections/openai-codex.js'
import { getOpenAICodexCompatibleModelId, OPENAI_CODEX_BASE_URL } from './provider-connections/shared.js'

export type ServiceType = 'text' | 'image' | 'video' | 'audio'

export interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  headers?: Record<string, string>
  fetch?: any
  authSource?: string
  accountLabel?: string | null
  requiresManualApiKey?: boolean
  connectionStatus?: 'connected' | 'not_configured'
}

export function getTextProviderBaseUrl(config: AIConfig) {
  const provider = config.provider.toLowerCase()

  if (provider === 'openai' || provider === 'openrouter' || provider === 'chatfire') {
    return joinProviderUrl(config.baseUrl, '/v1', '')
  }

  if (provider === 'gemini') {
    return joinProviderUrl(config.baseUrl, '/v1beta/openai', '')
  }

  if (provider === 'volcengine') {
    return joinProviderUrl(config.baseUrl, '/api/v1', '')
  }

  if (provider === 'ali') {
    return joinProviderUrl(config.baseUrl, '/api/v1', '')
  }

  return config.baseUrl
}

export function getActiveConfig(serviceType: ServiceType): AIConfig | null {
  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, serviceType))
    .all()
    .filter(r => r.isActive)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))

  const active = rows[0]
  if (!active) {
    logTaskWarn('AIConfig', 'active-config-missing', { serviceType })
    return null
  }

  const models = active.model ? JSON.parse(active.model) : []
  logTaskProgress('AIConfig', 'active-config-selected', {
    serviceType,
    configId: active.id,
    provider: active.provider,
    model: models[0] || '',
    priority: active.priority,
  })
  return resolveConnectionBackedConfig({
    provider: active.provider || '',
    baseUrl: active.baseUrl,
    apiKey: revealAIConfigApiKey(active.apiKey),
    model: models[0] || '',
  })
}

export function getTextConfig(): AIConfig {
  return getResolvedTextConfig() as ResolvedTextConfig
}

export function getAudioConfig(): AIConfig {
  const config = getActiveConfig('audio')
  if (!config) throw new Error('Nenhuma configuração de IA de áudio está ativa. Adicione um serviço de áudio nas configurações.')
  return config
}

export function getAudioConfigById(id?: number | null): AIConfig {
  if (id) {
    const config = getConfigById(id)
    if (config) return config
  }
  return getAudioConfig()
}

export function getConfigById(id: number): AIConfig | null {
  const [row] = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.id, id)).all()
  if (!row || !row.isActive) {
    logTaskWarn('AIConfig', 'config-by-id-missing', { configId: id })
    return null
  }
  const models = row.model ? JSON.parse(row.model) : []
  logTaskProgress('AIConfig', 'config-by-id-selected', {
    configId: id,
    provider: row.provider,
    model: models[0] || '',
    serviceType: row.serviceType,
  })
  return resolveConnectionBackedConfig({
    provider: row.provider || '',
    baseUrl: row.baseUrl,
    apiKey: revealAIConfigApiKey(row.apiKey),
    model: models[0] || '',
  })
}

function resolveConnectionBackedConfig(config: AIConfig): AIConfig {
  if (config.provider !== 'openai-codex') return config

  const credential = getOpenAICodexResolvedCredential()
  if (!credential) {
    throw new Error('OpenAI Codex sem conexao ativa. Abra Configuracoes > Conexoes e conecte o provider.')
  }

  return {
    ...config,
    baseUrl: OPENAI_CODEX_BASE_URL,
    apiKey: credential.accessToken,
    model: getOpenAICodexCompatibleModelId(config.model),
    authSource: credential.activeSource,
    accountLabel: credential.accountLabel,
    requiresManualApiKey: false,
    connectionStatus: 'connected',
  }
}
