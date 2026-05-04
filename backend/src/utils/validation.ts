import type { Context } from 'hono'
import { z, type ZodType } from 'zod'
import { badRequest } from './response.js'

function buildValidationDetails(issues: z.ZodIssue[]) {
  return issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }))
}

export function validationError(c: Context, issues: z.ZodIssue[]) {
  return c.json({
    code: 400,
    message: 'validation_failed',
    details: buildValidationDetails(issues),
  }, 400)
}

export async function parseJsonBody<T>(c: Context, schema: ZodType<T>) {
  const raw = await c.req.json().catch(() => undefined)
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false as const, response: validationError(c, parsed.error.issues) }
  }
  return { ok: true as const, data: parsed.data }
}

export function parseQuery<T>(c: Context, schema: ZodType<T>) {
  const query = c.req.query()
  const parsed = schema.safeParse(query)
  if (!parsed.success) {
    return { ok: false as const, response: validationError(c, parsed.error.issues) }
  }
  return { ok: true as const, data: parsed.data }
}

export function parseParams<T>(c: Context, schema: ZodType<T>) {
  const params = c.req.param()
  const parsed = schema.safeParse(params)
  if (!parsed.success) {
    return { ok: false as const, response: validationError(c, parsed.error.issues) }
  }
  return { ok: true as const, data: parsed.data }
}

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export function ensureNonEmptyString(value: string | null | undefined, message: string) {
  if (!String(value || '').trim()) {
    throw new Error(message)
  }
  return String(value).trim()
}

export { z, badRequest }
