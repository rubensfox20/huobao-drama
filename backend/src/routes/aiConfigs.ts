import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, notFound, created, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { redactUrl, logTaskError, logTaskProgress, logTaskSuccess } from '../utils/task-logger.js'
import { buildProviderProbe } from '../services/provider-probe.js'
import { defaultConnectionBaseUrl, defaultConnectionModel, isConnectionBackedTextProvider } from '../services/provider-connections/shared.js'
import { probeConnectionBackedTextProvider } from '../services/text-provider.js'
import { parseJsonBody, parseParams, parseQuery, z, idParamSchema } from '../utils/validation.js'
import { requireAdminAuth } from '../middleware/admin-auth.js'
import {
  parseModelList,
  revealAIConfigApiKey,
  sealAIConfigApiKey,
  serializeAIConfig,
  type AIConfigRow,
} from '../services/ai-configs.js'
import type { ConnectableProvider } from '../services/provider-connections/shared.js'

const app = new Hono()
app.use('*', requireAdminAuth)

const listQuerySchema = z.object({
  service_type: z.string().trim().optional(),
})

const aiConfigBaseSchema = z.object({
  service_type: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  base_url: z.string().trim().optional().default(''),
  api_key: z.string().optional(),
  model: z.array(z.string().trim().min(1)).optional(),
  priority: z.coerce.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional(),
})

const aiConfigUpdateSchema = z.object({
  provider: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  base_url: z.string().trim().optional(),
  api_key: z.string().optional(),
  clear_api_key: z.boolean().optional(),
  model: z.array(z.string().trim().min(1)).optional(),
  priority: z.coerce.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
})

const aiConfigTestSchema = z.object({
  service_type: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  base_url: z.string().trim().optional().default(''),
  api_key: z.string().optional(),
  model: z.union([z.array(z.string().trim().min(1)), z.string().trim().min(1)]).optional(),
})

function pickTestModel(raw: string[] | string | undefined) {
  if (Array.isArray(raw)) return raw[0]
  return raw
}

function resolveProbePayload(input: {
  serviceType: string
  provider: string
  baseUrl: string
  apiKey: string
  model?: string[] | string
}) {
  return {
    serviceType: input.serviceType,
    provider: input.provider,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: pickTestModel(input.model),
  }
}

async function executeConfigProbe(input: {
  serviceType: string
  provider: string
  baseUrl: string
  apiKey: string
  model?: string[] | string
}) {
  if (input.serviceType === 'text' && isConnectionBackedTextProvider(input.provider)) {
    const snapshot = await probeConnectionBackedTextProvider(input.provider, pickTestModel(input.model))
    const service = snapshot.services?.[0]
    return {
      ok: snapshot.status === 'available',
      reachable: snapshot.status !== 'not_configured',
      status: service?.statusCode ?? (snapshot.status === 'available' ? 200 : null),
      status_text: snapshot.status,
      method: service?.method || 'POST',
      url: service?.url || defaultConnectionBaseUrl(input.provider),
      message: service?.message || snapshot.status,
      response_preview: service?.message || '',
    }
  }

  if (!String(input.baseUrl || '').trim()) {
    throw new Error('base_url is required')
  }

  const probe = buildProviderProbe(
    input.serviceType,
    input.provider,
    input.baseUrl,
    pickTestModel(input.model),
    input.apiKey,
  )
  const probeUrl = redactUrl(probe.url)

  logTaskProgress('AIConfig', 'probe-start', {
    serviceType: input.serviceType,
    provider: input.provider,
    method: probe.method,
    url: probeUrl,
  })

  try {
    const resp = await fetch(probe.url, {
      method: probe.method,
      headers: probe.headers,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
    })
    const text = await resp.text()
    const reachable = [200, 204, 400, 401, 403].includes(resp.status)
    const payload = {
      ok: resp.ok,
      reachable,
      status: resp.status,
      status_text: resp.statusText,
      method: probe.method,
      url: probeUrl,
      message: reachable
        ? (resp.ok ? 'Endpoint acessivel, autenticacao e caminho normais.' : 'Endpoint respondeu. Verifique o codigo de status.')
        : 'O endpoint nao respondeu como esperado. Verifique a Base URL.',
      response_preview: text.slice(0, 240),
    }
    if (reachable) {
      logTaskSuccess('AIConfig', 'probe-done', {
        provider: input.provider,
        status: resp.status,
        url: probeUrl,
      })
    } else {
      logTaskError('AIConfig', 'probe-unexpected', {
        provider: input.provider,
        status: resp.status,
        url: probeUrl,
      })
    }
    return payload
  } catch (error: any) {
    logTaskError('AIConfig', 'probe-failed', {
      provider: input.provider,
      url: probeUrl,
      error: error.message,
    })
    return {
      ok: false,
      reachable: false,
      method: probe.method,
      url: probeUrl,
      message: error.message || 'Falha na requisicao',
      response_preview: '',
    }
  }
}

function getAIConfigById(id: number) {
  const [row] = db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id)).all()
  return row as AIConfigRow | undefined
}

app.get('/', async (c) => {
  const parsed = parseQuery(c, listQuerySchema)
  if (!parsed.ok) return parsed.response

  const conditions = []
  if (parsed.data.service_type) {
    conditions.push(eq(schema.aiServiceConfigs.serviceType, parsed.data.service_type))
  }

  const rows = conditions.length
    ? db.select().from(schema.aiServiceConfigs).where(and(...conditions)).all()
    : db.select().from(schema.aiServiceConfigs).all()

  return success(c, rows.map(row => serializeAIConfig(row as AIConfigRow)))
})

app.post('/', async (c) => {
  const parsed = await parseJsonBody(c, aiConfigBaseSchema)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const ts = now()
  const isConnectionBacked = body.service_type === 'text' && isConnectionBackedTextProvider(body.provider)
  const connectionProvider = body.provider as ConnectableProvider
  const defaultBaseUrl = isConnectionBacked ? defaultConnectionBaseUrl(connectionProvider) : ''
  const defaultModel = isConnectionBacked ? defaultConnectionModel(connectionProvider) : ''
  const hasExistingActiveTextConfig = body.service_type === 'text'
    && db.select().from(schema.aiServiceConfigs)
      .where(eq(schema.aiServiceConfigs.serviceType, 'text'))
      .all()
      .some(row => row.isActive)
  const shouldActivate = body.is_active ?? !(isConnectionBacked && hasExistingActiveTextConfig)

  const result = db.insert(schema.aiServiceConfigs).values({
    serviceType: body.service_type,
    provider: body.provider,
    name: body.name || `${body.provider}-${body.service_type}`,
    baseUrl: body.base_url || defaultBaseUrl,
    apiKey: sealAIConfigApiKey(body.api_key || ''),
    model: JSON.stringify((body.model?.length ? body.model : [defaultModel]).filter(Boolean)),
    priority: body.priority,
    isActive: shouldActivate,
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const row = getAIConfigById(Number(result.lastInsertRowid))
  return created(c, row ? serializeAIConfig(row) : null)
})

app.post('/test', async (c) => {
  const parsed = await parseJsonBody(c, aiConfigTestSchema)
  if (!parsed.ok) return parsed.response
  if (
    !(parsed.data.service_type === 'text' && isConnectionBackedTextProvider(parsed.data.provider))
    && !String(parsed.data.base_url || '').trim()
  ) {
    return c.json({ code: 400, message: 'base_url is required' }, 400)
  }

  const payload = resolveProbePayload({
    serviceType: parsed.data.service_type,
    provider: parsed.data.provider,
    baseUrl: parsed.data.base_url,
    apiKey: parsed.data.api_key || '',
    model: parsed.data.model,
  })

  return success(c, await executeConfigProbe(payload))
})

app.get('/:id', async (c) => {
  const parsed = parseParams(c, idParamSchema)
  if (!parsed.ok) return parsed.response

  const row = getAIConfigById(parsed.data.id)
  if (!row) return notFound(c)
  return success(c, serializeAIConfig(row))
})

app.post('/:id/test', async (c) => {
  const parsed = parseParams(c, idParamSchema)
  if (!parsed.ok) return parsed.response

  const row = getAIConfigById(parsed.data.id)
  if (!row) return notFound(c)

  return success(c, await executeConfigProbe({
    serviceType: row.serviceType,
    provider: String(row.provider || ''),
    baseUrl: row.baseUrl,
    apiKey: revealAIConfigApiKey(row.apiKey),
    model: parseModelList(row.model),
  }))
})

app.put('/:id', async (c) => {
  const paramResult = parseParams(c, idParamSchema)
  if (!paramResult.ok) return paramResult.response
  const bodyResult = await parseJsonBody(c, aiConfigUpdateSchema)
  if (!bodyResult.ok) return bodyResult.response

  const updates: Record<string, unknown> = { updatedAt: now() }
  const body = bodyResult.data

  if (body.provider !== undefined) updates.provider = body.provider
  if (body.name !== undefined) updates.name = body.name
  if (body.base_url !== undefined) updates.baseUrl = body.base_url
  if (body.clear_api_key) updates.apiKey = ''
  else if (typeof body.api_key === 'string' && body.api_key.trim()) updates.apiKey = sealAIConfigApiKey(body.api_key)
  if (body.model !== undefined) updates.model = JSON.stringify(body.model)
  if (body.priority !== undefined) updates.priority = body.priority
  if (body.is_active !== undefined) updates.isActive = body.is_active

  db.update(schema.aiServiceConfigs).set(updates).where(eq(schema.aiServiceConfigs.id, paramResult.data.id)).run()
  const row = getAIConfigById(paramResult.data.id)
  if (!row) return notFound(c)
  return success(c, serializeAIConfig(row))
})

app.delete('/:id', async (c) => {
  const parsed = parseParams(c, idParamSchema)
  if (!parsed.ok) return parsed.response

  db.delete(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, parsed.data.id)).run()
  return success(c)
})

export const aiProviders = new Hono()
aiProviders.get('/', async (c) => {
  const rows = db.select().from(schema.aiServiceProviders).all()
  const parsed = rows.map(r => ({
    ...toSnakeCase(r),
    preset_models: r.presetModels ? JSON.parse(r.presetModels) : [],
  }))
  return success(c, parsed)
})

export default app
