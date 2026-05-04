import { desc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'

type ProviderUsageInput = {
  workflowJobId?: number | null
  serviceType: string
  provider: string
  model?: string | null
  operation: string
  status: string
  requestHash?: string | null
  errorMsg?: string | null
  latencyMs?: number | null
  metadata?: Record<string, unknown> | null
}

function stringify(value: unknown) {
  if (!value) return null
  return JSON.stringify(value)
}

export function recordProviderUsageEvent(input: ProviderUsageInput) {
  const result = db.insert(schema.providerUsageEvents).values({
    workflowJobId: input.workflowJobId ?? null,
    serviceType: input.serviceType,
    provider: input.provider,
    model: input.model ?? null,
    operation: input.operation,
    status: input.status,
    requestHash: input.requestHash ?? null,
    errorMsg: input.errorMsg ?? null,
    latencyMs: input.latencyMs ?? null,
    metadata: stringify(input.metadata),
    createdAt: now(),
  }).run()
  return Number(result.lastInsertRowid)
}

export function listRecentProviderUsageEvents(limit = 50) {
  return db.select().from(schema.providerUsageEvents)
    .orderBy(desc(schema.providerUsageEvents.id))
    .limit(limit)
    .all()
}

export function listProviderUsageEventsByWorkflowJob(workflowJobId: number) {
  return db.select().from(schema.providerUsageEvents)
    .where(eq(schema.providerUsageEvents.workflowJobId, workflowJobId))
    .all()
}
