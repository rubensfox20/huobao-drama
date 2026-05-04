import { Hono } from 'hono'
import { badRequest, success } from '../utils/response.js'
import {
  ensurePromptTemplatesSeeded,
  estimatePromptMetrics,
  getPromptHistory,
  listPromptTemplates,
  parsePromptVariables,
  renderPromptContent,
  resetPromptTemplate,
  restorePromptTemplate,
  updatePromptTemplate,
} from '../services/prompt-templates.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'
import { parseJsonBody, z } from '../utils/validation.js'
import { requireAdminAuth } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminAuth)

const savePromptSchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  content: z.string().min(1),
  variables: z.array(z.string()).optional().default([]),
})

const restorePromptSchema = z.object({
  history_id: z.coerce.number().int().positive(),
})

const testPromptSchema = z.object({
  content: z.string(),
  variables: z.record(z.string(), z.unknown()).optional().default({}),
})

app.get('/', (c) => {
  ensurePromptTemplatesSeeded()
  const templates = listPromptTemplates().map(template => ({
    ...toSnakeCase(template),
    variables: parsePromptVariables(template.variables),
  }))
  return success(c, templates)
})

app.post('/', async (c) => {
  const parsed = await parseJsonBody(c, savePromptSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data
  const template = updatePromptTemplate({
    key: String(body.key),
    name: body.name,
    description: body.description,
    content: String(body.content),
    variables: body.variables.map((value: unknown) => String(value)),
  })
  return success(c, {
    ...toSnakeCase(template),
    variables: parsePromptVariables(template?.variables),
  })
})

app.post('/:key/reset', (c) => {
  const key = c.req.param('key')
  const template = resetPromptTemplate(key)
  if (!template) return badRequest(c, 'Prompt template not found')
  return success(c, {
    ...toSnakeCase(template),
    variables: parsePromptVariables(template.variables),
  })
})

app.get('/:key/history', (c) => {
  const key = c.req.param('key')
  const history = getPromptHistory(key).map(entry => ({
    ...toSnakeCase(entry),
    variables: parsePromptVariables(entry.variables),
  }))
  return success(c, history)
})

app.post('/:key/restore', async (c) => {
  const key = c.req.param('key')
  const parsed = await parseJsonBody(c, restorePromptSchema)
  if (!parsed.ok) return parsed.response
  const template = restorePromptTemplate(key, parsed.data.history_id)
  if (!template) return badRequest(c, 'History entry not found')
  return success(c, {
    ...toSnakeCase(template),
    variables: parsePromptVariables(template.variables),
  })
})

app.post('/test', async (c) => {
  const parsed = await parseJsonBody(c, testPromptSchema)
  if (!parsed.ok) return parsed.response
  const rendered = renderPromptContent(parsed.data.content, parsed.data.variables)
  return success(c, {
    rendered,
    metrics: estimatePromptMetrics(rendered),
  })
})

export default app
