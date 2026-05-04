import { db, schema } from '../db/index.js'
import { buildProviderProbe } from './provider-probe.js'
import { classifyProviderIssue, type ProviderAvailabilityStatus } from './provider-classification.js'
import { runProviderOperation } from './provider-execution.js'
import { redactUrl } from '../utils/task-logger.js'
import { AI_CONFIG_API_KEY_PURPOSE, openSecret } from '../utils/secrets.js'
import { isConnectionBackedTextProvider } from './provider-connections/shared.js'
import { probeConnectionBackedTextProvider } from './text-provider.js'

type ProviderAvailabilitySnapshot = {
  provider: string
  status: ProviderAvailabilityStatus
  checkedAt: string
  tier: 'stable' | 'experimental'
  supportsStructuredOutput: boolean
  supportsToolCalling: boolean
  recommendedFor: string[]
  services: Array<{
    configId: number
    serviceType: string
    name: string
    model: string
    status: ProviderAvailabilityStatus
    statusCode: number | null
    message: string
    reachable: boolean
    method: string
    url: string
  }>
}

type CacheEntry = {
  expiresAt: number
  snapshot: ProviderAvailabilitySnapshot
}

const availabilityCache = new Map<string, CacheEntry>()
const CACHE_MS = 30_000

const PROVIDER_CAPABILITIES: Record<string, {
  tier: 'stable' | 'experimental'
  supportsStructuredOutput: boolean
  supportsToolCalling: boolean
  recommendedFor: string[]
}> = {
  openrouter: {
    tier: 'stable',
    supportsStructuredOutput: true,
    supportsToolCalling: true,
    recommendedFor: ['script_rewriter', 'extractor', 'storyboard_breaker'],
  },
  openai: {
    tier: 'stable',
    supportsStructuredOutput: true,
    supportsToolCalling: true,
    recommendedFor: ['script_rewriter', 'extractor', 'storyboard_breaker'],
  },
  gemini: {
    tier: 'stable',
    supportsStructuredOutput: true,
    supportsToolCalling: true,
    recommendedFor: ['script_rewriter', 'extractor'],
  },
  'openai-codex': {
    tier: 'experimental',
    supportsStructuredOutput: true,
    supportsToolCalling: true,
    recommendedFor: ['script_rewriter', 'extractor', 'storyboard_breaker'],
  },
  'github-copilot': {
    tier: 'experimental',
    supportsStructuredOutput: true,
    supportsToolCalling: false,
    recommendedFor: ['script_rewriter', 'extractor'],
  },
  huggingface: {
    tier: 'experimental',
    supportsStructuredOutput: false,
    supportsToolCalling: false,
    recommendedFor: ['image_generate', 'video_generate'],
  },
  leonardo: {
    tier: 'experimental',
    supportsStructuredOutput: false,
    supportsToolCalling: false,
    recommendedFor: ['image_generate'],
  },
}

function getProviderCapabilities(provider: string) {
  return PROVIDER_CAPABILITIES[String(provider || '').toLowerCase()] || {
    tier: 'experimental' as const,
    supportsStructuredOutput: false,
    supportsToolCalling: false,
    recommendedFor: [],
  }
}

export async function getProviderAvailabilitySnapshot(provider: string): Promise<ProviderAvailabilitySnapshot> {
  const cacheKey = provider.toLowerCase()
  const cached = availabilityCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.snapshot

  if (isConnectionBackedTextProvider(cacheKey)) {
    const snapshot = await probeConnectionBackedTextProvider(cacheKey)
    const capabilities = getProviderCapabilities(provider)
    const enrichedSnapshot = {
      ...snapshot,
      ...capabilities,
    }
    availabilityCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_MS,
      snapshot: enrichedSnapshot,
    })
    return enrichedSnapshot
  }

  const configs = db.select().from(schema.aiServiceConfigs).all()
    .filter(config => config.isActive && String(config.provider || '').toLowerCase() === cacheKey)

  if (!configs.length) {
    const capabilities = getProviderCapabilities(provider)
    return {
      provider,
      status: 'not_configured',
      checkedAt: new Date().toISOString(),
      ...capabilities,
      services: [],
    }
  }

  const services = []
  for (const config of configs) {
    const model = safeModel(config.model)
    const probe = buildProviderProbe(
      config.serviceType,
      config.provider || provider,
      config.baseUrl,
      model,
      openSecret(config.apiKey, AI_CONFIG_API_KEY_PURPOSE),
    )
    const serviceSnapshot = await runProbe(config.id, config.serviceType, config.name, config.provider || provider, model, probe)
    services.push(serviceSnapshot)
  }

  const snapshot: ProviderAvailabilitySnapshot = {
    provider,
    status: summarizeProviderStatus(services.map(service => service.status)),
    checkedAt: new Date().toISOString(),
    ...getProviderCapabilities(provider),
    services,
  }

  availabilityCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_MS,
    snapshot,
  })

  return snapshot
}

async function runProbe(
  configId: number,
  serviceType: string,
  name: string,
  provider: string,
  model: string,
  probe: { method: string; url: string; headers: Record<string, string>; body?: unknown },
) {
  try {
    const result = await runProviderOperation({
      serviceType,
      provider,
      model,
      operation: `availability:${serviceType}`,
      metadata: { configId, probeUrl: redactUrl(probe.url) },
    }, async () => {
      const response = await fetch(probe.url, {
        method: probe.method,
        headers: probe.headers,
        body: probe.body ? JSON.stringify(probe.body) : undefined,
        signal: AbortSignal.timeout(10_000),
      })
      const text = await response.text()
      const reachable = [200, 204, 400, 401, 403, 429].includes(response.status)
      return {
        statusCode: response.status,
        message: text.slice(0, 240),
        reachable,
      }
    })

    const status = classifyProviderIssue({
      status: result.statusCode,
      message: result.message,
      reachable: result.reachable,
    })
    return {
      configId,
      serviceType,
      name,
      model,
      status,
      statusCode: result.statusCode,
      message: result.message || humanStatusMessage(status),
      reachable: result.reachable,
      method: probe.method,
      url: redactUrl(probe.url),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = classifyProviderIssue({ message, reachable: false })
    return {
      configId,
      serviceType,
      name,
      model,
      status,
      statusCode: null,
      message,
      reachable: false,
      method: probe.method,
      url: redactUrl(probe.url),
    }
  }
}

function summarizeProviderStatus(statuses: ProviderAvailabilityStatus[]): ProviderAvailabilityStatus {
  if (statuses.some(status => status === 'available')) return 'available'
  if (statuses.some(status => status === 'quota_exceeded')) return 'quota_exceeded'
  if (statuses.some(status => status === 'paid_plan_required')) return 'paid_plan_required'
  if (statuses.some(status => status === 'invalid_key')) return 'invalid_key'
  if (statuses.some(status => status === 'not_configured')) return 'not_configured'
  return 'unknown_error'
}

function humanStatusMessage(status: ProviderAvailabilityStatus) {
  switch (status) {
    case 'available': return 'Provider responding normally.'
    case 'quota_exceeded': return 'Provider reached quota or temporary rate limit.'
    case 'paid_plan_required': return 'Provider requires paid credits for this operation.'
    case 'invalid_key': return 'Provider rejected authentication.'
    case 'not_configured': return 'Provider is not configured.'
    default: return 'Provider returned an unknown error.'
  }
}

function safeModel(raw: string | null | undefined) {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? String(parsed[0] || '') : String(parsed || '')
  } catch {
    return String(raw)
  }
}
