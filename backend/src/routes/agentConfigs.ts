import { Hono } from 'hono'
import { eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, notFound, now } from '../utils/response.js'
import { toSnakeCaseArray, toSnakeCase } from '../utils/transform.js'
import { parseJsonBody, parseParams, idParamSchema, z } from '../utils/validation.js'
import { requireAdminAuth } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminAuth)

const upsertAgentConfigSchema = z.object({
  agent_type: z.string().trim().min(1),
  name: z.string().trim().optional(),
  description: z.string().optional(),
  model: z.string().optional(),
  system_prompt: z.string().optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  max_tokens: z.coerce.number().int().positive().optional(),
  max_iterations: z.coerce.number().int().positive().optional(),
  is_active: z.boolean().optional(),
})

const updateAgentConfigSchema = z.object({
  name: z.string().trim().optional(),
  description: z.string().optional(),
  model: z.string().optional(),
  system_prompt: z.string().optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  max_tokens: z.coerce.number().int().positive().optional(),
  max_iterations: z.coerce.number().int().positive().optional(),
  is_active: z.boolean().optional(),
})

app.get('/', async (c) => {
  const rows = db.select().from(schema.agentConfigs)
    .where(isNull(schema.agentConfigs.deletedAt)).all()
  return success(c, toSnakeCaseArray(rows))
})

app.get('/:id', async (c) => {
  const parsed = parseParams(c, idParamSchema)
  if (!parsed.ok) return parsed.response

  const [row] = db.select().from(schema.agentConfigs)
    .where(eq(schema.agentConfigs.id, parsed.data.id)).all()
  if (!row) return notFound(c)
  return success(c, toSnakeCase(row))
})

app.post('/', async (c) => {
  const parsed = await parseJsonBody(c, upsertAgentConfigSchema)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const ts = now()
  const [existing] = db.select().from(schema.agentConfigs)
    .where(eq(schema.agentConfigs.agentType, body.agent_type)).all()

  if (existing) {
    db.update(schema.agentConfigs).set({
      name: body.name || existing.name,
      description: body.description ?? existing.description,
      model: body.model ?? existing.model,
      systemPrompt: body.system_prompt ?? existing.systemPrompt,
      temperature: body.temperature ?? existing.temperature,
      maxTokens: body.max_tokens ?? existing.maxTokens,
      maxIterations: body.max_iterations ?? existing.maxIterations,
      isActive: body.is_active ?? existing.isActive ?? true,
      deletedAt: null,
      updatedAt: ts,
    }).where(eq(schema.agentConfigs.id, existing.id)).run()

    const [row] = db.select().from(schema.agentConfigs).where(eq(schema.agentConfigs.id, existing.id)).all()
    return success(c, toSnakeCase(row))
  }

  const result = db.insert(schema.agentConfigs).values({
    agentType: body.agent_type,
    name: body.name || '',
    description: body.description || '',
    model: body.model || '',
    systemPrompt: body.system_prompt || '',
    temperature: body.temperature ?? 0.7,
    maxTokens: body.max_tokens ?? 4096,
    maxIterations: body.max_iterations ?? 10,
    isActive: body.is_active ?? true,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const [row] = db.select().from(schema.agentConfigs)
    .where(eq(schema.agentConfigs.id, Number(result.lastInsertRowid))).all()
  return success(c, toSnakeCase(row))
})

app.put('/:id', async (c) => {
  const paramResult = parseParams(c, idParamSchema)
  if (!paramResult.ok) return paramResult.response
  const bodyResult = await parseJsonBody(c, updateAgentConfigSchema)
  if (!bodyResult.ok) return bodyResult.response

  const body = bodyResult.data
  const updates: Record<string, unknown> = { updatedAt: now() }

  if (body.model !== undefined) updates.model = body.model
  if (body.temperature !== undefined) updates.temperature = body.temperature
  if (body.max_tokens !== undefined) updates.maxTokens = body.max_tokens
  if (body.max_iterations !== undefined) updates.maxIterations = body.max_iterations
  if (body.is_active !== undefined) updates.isActive = body.is_active
  if (body.system_prompt !== undefined) updates.systemPrompt = body.system_prompt
  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description

  db.update(schema.agentConfigs).set(updates).where(eq(schema.agentConfigs.id, paramResult.data.id)).run()
  const [row] = db.select().from(schema.agentConfigs).where(eq(schema.agentConfigs.id, paramResult.data.id)).all()
  if (!row) return notFound(c)
  return success(c, toSnakeCase(row))
})

app.delete('/:id', async (c) => {
  const parsed = parseParams(c, idParamSchema)
  if (!parsed.ok) return parsed.response

  db.update(schema.agentConfigs).set({ deletedAt: now() }).where(eq(schema.agentConfigs.id, parsed.data.id)).run()
  return success(c)
})

export default app
