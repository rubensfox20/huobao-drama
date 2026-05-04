import { toSnakeCase } from '../utils/transform.js'
import {
  AI_CONFIG_API_KEY_PURPOSE,
  getSecretSummary,
  openSecret,
  sealSecret,
} from '../utils/secrets.js'
import { getTextConfigConnectionInfo } from './text-provider.js'

export type AIConfigRow = {
  id: number
  serviceType: string
  provider: string | null
  name: string
  baseUrl: string
  apiKey: string
  model: string | null
  endpoint: string | null
  queryEndpoint: string | null
  priority: number | null
  isDefault: boolean | null
  isActive: boolean | null
  settings: string | null
  createdAt: string
  updatedAt: string
}

export function parseModelList(raw: string | null | undefined) {
  if (!raw) return [] as string[]
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(value => String(value)) : [String(parsed)]
  } catch {
    return [String(raw)]
  }
}

export function maskApiKey(apiKey: string | null | undefined) {
  const clean = String(apiKey || '').trim()
  if (!clean) return null
  if (clean.length <= 8) return `${clean.slice(0, 2)}***${clean.slice(-2)}`
  return `${clean.slice(0, 4)}***${clean.slice(-4)}`
}

export function sealAIConfigApiKey(apiKey: string | null | undefined) {
  return sealSecret(apiKey, AI_CONFIG_API_KEY_PURPOSE)
}

export function revealAIConfigApiKey(apiKey: string | null | undefined) {
  return openSecret(apiKey, AI_CONFIG_API_KEY_PURPOSE)
}

export function serializeAIConfig(row: AIConfigRow) {
  const {
    apiKey: _apiKey,
    ...safeRow
  } = row
  const secret = getSecretSummary(row.apiKey, AI_CONFIG_API_KEY_PURPOSE)
  return {
    ...toSnakeCase(safeRow),
    model: parseModelList(row.model),
    has_api_key: secret.hasValue,
    api_key_hint: secret.decryptable ? maskApiKey(secret.value) : 'encrypted',
    ...getTextConfigConnectionInfo(row.provider),
  }
}
