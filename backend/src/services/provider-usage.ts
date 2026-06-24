import { desc, eq, lt } from 'drizzle-orm'
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

const DEFAULT_PROVIDER_USAGE_RETENTION_DAYS = 14
const PROVIDER_USAGE_CLEANUP_INTERVAL_MS = 60 * 60_000
let nextProviderUsageCleanupAt = 0

function stringify(value: unknown) {
  if (!value) return null
  return JSON.stringify(value)
}

function resolveProviderUsageRetentionDays() {
  const parsed = Number(process.env.PROVIDER_USAGE_RETENTION_DAYS)
  return Number.isFinite(parsed) ? parsed : DEFAULT_PROVIDER_USAGE_RETENTION_DAYS
}

export function cleanupOldProviderUsageEvents(referenceTime = Date.now()) {
  const retentionDays = resolveProviderUsageRetentionDays()
  if (retentionDays <= 0) return 0

  const cutoff = new Date(referenceTime - retentionDays * 24 * 60 * 60_000).toISOString()
  const result = db.delete(schema.providerUsageEvents)
    .where(lt(schema.providerUsageEvents.createdAt, cutoff))
    .run()
  return result.changes
}

function maybeCleanupOldProviderUsageEvents() {
  const currentTime = Date.now()
  if (currentTime < nextProviderUsageCleanupAt) return

  nextProviderUsageCleanupAt = currentTime + PROVIDER_USAGE_CLEANUP_INTERVAL_MS
  try {
    cleanupOldProviderUsageEvents(currentTime)
  } catch (error) {
    console.warn('[provider-usage] failed to cleanup old usage events', error)
  }
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
  maybeCleanupOldProviderUsageEvents()
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
