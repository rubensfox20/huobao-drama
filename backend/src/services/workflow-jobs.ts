import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'

type WorkflowJobInput = {
  kind: string
  relatedEntityType?: string | null
  relatedEntityId?: number | null
  dramaId?: number | null
  episodeId?: number | null
  provider?: string | null
  model?: string | null
  inputSummary?: string | null
  metadata?: Record<string, unknown> | null
  retryOfJobId?: number | null
}

type WorkflowJobFilter = {
  kind?: string
  status?: string
  relatedEntityType?: string
  relatedEntityId?: number
  dramaId?: number
  episodeId?: number
}

type WorkflowJobPagination = {
  page?: number
  pageSize?: number
}

const ACTIVE_GENERATION_STATUSES = ['queued', 'processing', 'running']

function stringify(value: unknown) {
  if (!value) return null
  return JSON.stringify(value)
}

function buildEpisodeScopeCondition(episodeId: number) {
  return sql`(
    ${schema.workflowJobs.episodeId} = ${episodeId}
    OR (${schema.workflowJobs.relatedEntityType} = 'episode' AND ${schema.workflowJobs.relatedEntityId} = ${episodeId})
    OR (${schema.workflowJobs.relatedEntityType} = 'storyboard' AND EXISTS (
      SELECT 1
      FROM ${schema.storyboards}
      WHERE ${schema.storyboards.id} = ${schema.workflowJobs.relatedEntityId}
        AND ${schema.storyboards.episodeId} = ${episodeId}
    ))
    OR (${schema.workflowJobs.relatedEntityType} = 'scene' AND (
      EXISTS (
        SELECT 1
        FROM ${schema.scenes}
        WHERE ${schema.scenes.id} = ${schema.workflowJobs.relatedEntityId}
          AND ${schema.scenes.episodeId} = ${episodeId}
      )
      OR EXISTS (
        SELECT 1
        FROM ${schema.episodeScenes}
        WHERE ${schema.episodeScenes.sceneId} = ${schema.workflowJobs.relatedEntityId}
          AND ${schema.episodeScenes.episodeId} = ${episodeId}
      )
    ))
    OR (${schema.workflowJobs.relatedEntityType} = 'character' AND EXISTS (
      SELECT 1
      FROM ${schema.episodeCharacters}
      WHERE ${schema.episodeCharacters.characterId} = ${schema.workflowJobs.relatedEntityId}
        AND ${schema.episodeCharacters.episodeId} = ${episodeId}
    ))
  )`
}

function buildDramaScopeCondition(dramaId: number) {
  return sql`(
    ${schema.workflowJobs.dramaId} = ${dramaId}
    OR EXISTS (
      SELECT 1
      FROM ${schema.episodes}
      WHERE ${schema.episodes.id} = ${schema.workflowJobs.episodeId}
        AND ${schema.episodes.dramaId} = ${dramaId}
    )
    OR (${schema.workflowJobs.relatedEntityType} = 'episode' AND EXISTS (
      SELECT 1
      FROM ${schema.episodes}
      WHERE ${schema.episodes.id} = ${schema.workflowJobs.relatedEntityId}
        AND ${schema.episodes.dramaId} = ${dramaId}
    ))
    OR (${schema.workflowJobs.relatedEntityType} = 'storyboard' AND EXISTS (
      SELECT 1
      FROM ${schema.storyboards}
      INNER JOIN ${schema.episodes} ON ${schema.episodes.id} = ${schema.storyboards.episodeId}
      WHERE ${schema.storyboards.id} = ${schema.workflowJobs.relatedEntityId}
        AND ${schema.episodes.dramaId} = ${dramaId}
    ))
    OR (${schema.workflowJobs.relatedEntityType} = 'scene' AND (
      EXISTS (
        SELECT 1
        FROM ${schema.scenes}
        WHERE ${schema.scenes.id} = ${schema.workflowJobs.relatedEntityId}
          AND ${schema.scenes.dramaId} = ${dramaId}
      )
      OR EXISTS (
        SELECT 1
        FROM ${schema.episodeScenes}
        INNER JOIN ${schema.episodes} ON ${schema.episodes.id} = ${schema.episodeScenes.episodeId}
        WHERE ${schema.episodeScenes.sceneId} = ${schema.workflowJobs.relatedEntityId}
          AND ${schema.episodes.dramaId} = ${dramaId}
      )
    ))
    OR (${schema.workflowJobs.relatedEntityType} = 'character' AND (
      EXISTS (
        SELECT 1
        FROM ${schema.characters}
        WHERE ${schema.characters.id} = ${schema.workflowJobs.relatedEntityId}
          AND ${schema.characters.dramaId} = ${dramaId}
      )
      OR EXISTS (
        SELECT 1
        FROM ${schema.episodeCharacters}
        INNER JOIN ${schema.episodes} ON ${schema.episodes.id} = ${schema.episodeCharacters.episodeId}
        WHERE ${schema.episodeCharacters.characterId} = ${schema.workflowJobs.relatedEntityId}
          AND ${schema.episodes.dramaId} = ${dramaId}
      )
    ))
  )`
}

function buildWorkflowJobConditions(filter: WorkflowJobFilter) {
  const conditions: any[] = []
  if (filter.kind) conditions.push(eq(schema.workflowJobs.kind, filter.kind))
  if (filter.status) conditions.push(eq(schema.workflowJobs.status, filter.status))
  if (filter.relatedEntityType) conditions.push(eq(schema.workflowJobs.relatedEntityType, filter.relatedEntityType))
  if (filter.relatedEntityId != null) conditions.push(eq(schema.workflowJobs.relatedEntityId, filter.relatedEntityId))
  if (filter.dramaId != null) conditions.push(buildDramaScopeCondition(filter.dramaId))
  if (filter.episodeId != null) conditions.push(buildEpisodeScopeCondition(filter.episodeId))
  return conditions
}

export function createWorkflowJob(input: WorkflowJobInput) {
  const ts = now()
  const result = db.insert(schema.workflowJobs).values({
    kind: input.kind,
    status: 'queued',
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    dramaId: input.dramaId ?? null,
    episodeId: input.episodeId ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
    inputSummary: input.inputSummary ?? null,
    metadata: stringify(input.metadata),
    retryOfJobId: input.retryOfJobId ?? null,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  return getWorkflowJob(Number(result.lastInsertRowid))
}

export function getWorkflowJob(id: number) {
  const [row] = db.select().from(schema.workflowJobs)
    .where(eq(schema.workflowJobs.id, id))
    .all()
  return row || null
}

export function listWorkflowJobs(filter: WorkflowJobFilter = {}, pagination: WorkflowJobPagination = {}) {
  const page = pagination.page && pagination.page > 0 ? pagination.page : 1
  const pageSize = pagination.pageSize && pagination.pageSize > 0 ? pagination.pageSize : 50
  const offset = (page - 1) * pageSize
  const conditions = buildWorkflowJobConditions(filter)
  const whereClause = conditions.length ? and(...conditions) : undefined

  const [countRow] = whereClause
    ? db.select({ count: sql<number>`count(*)` })
      .from(schema.workflowJobs)
      .where(whereClause)
      .all()
    : db.select({ count: sql<number>`count(*)` })
      .from(schema.workflowJobs)
      .all()

  const items = whereClause
    ? db.select().from(schema.workflowJobs)
      .where(whereClause)
      .orderBy(desc(schema.workflowJobs.id))
      .limit(pageSize)
      .offset(offset)
      .all()
    : db.select().from(schema.workflowJobs)
      .orderBy(desc(schema.workflowJobs.id))
      .limit(pageSize)
      .offset(offset)
      .all()

  const total = Number(countRow?.count || 0)

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export function startWorkflowJob(id: number, patch: Partial<WorkflowJobInput> = {}) {
  db.update(schema.workflowJobs).set({
    status: 'running',
    provider: patch.provider ?? undefined,
    model: patch.model ?? undefined,
    startedAt: now(),
    updatedAt: now(),
    metadata: patch.metadata ? stringify(patch.metadata) : undefined,
  }).where(eq(schema.workflowJobs.id, id)).run()
  return getWorkflowJob(id)
}

export function completeWorkflowJob(id: number, patch: {
  outputSummary?: string | null
  metadata?: Record<string, unknown> | null
} = {}) {
  db.update(schema.workflowJobs).set({
    status: 'completed',
    outputSummary: patch.outputSummary ?? null,
    metadata: patch.metadata ? stringify(patch.metadata) : undefined,
    completedAt: now(),
    updatedAt: now(),
  }).where(eq(schema.workflowJobs.id, id)).run()
  return getWorkflowJob(id)
}

export function failWorkflowJob(id: number, errorMsg: string, patch: {
  metadata?: Record<string, unknown> | null
} = {}) {
  db.update(schema.workflowJobs).set({
    status: 'failed',
    errorMsg,
    metadata: patch.metadata ? stringify(patch.metadata) : undefined,
    completedAt: now(),
    updatedAt: now(),
  }).where(eq(schema.workflowJobs.id, id)).run()
  return getWorkflowJob(id)
}

export function recoverOrphanedWorkflowJobs(reason = 'Job interrompido por reinicio do servidor ou encerramento inesperado') {
  const activeRows = db.select().from(schema.workflowJobs)
    .where(and(
      eq(schema.workflowJobs.status, 'running'),
    ))
    .all()
    .concat(
      db.select().from(schema.workflowJobs)
        .where(and(
          eq(schema.workflowJobs.status, 'queued'),
        ))
        .all(),
    )

  if (!activeRows.length) return { recovered: 0, jobIds: [] as number[] }

  const ts = now()
  const jobIds = activeRows.map(row => Number(row.id))
  for (const row of activeRows) {
    const previousMetadata = row.metadata ? safeParseMetadata(row.metadata) : null
    db.update(schema.workflowJobs).set({
      status: 'failed',
      errorMsg: row.errorMsg || reason,
      metadata: stringify({
        ...(previousMetadata || {}),
        recovered: true,
        recoveredReason: reason,
      }),
      completedAt: ts,
      updatedAt: ts,
    }).where(eq(schema.workflowJobs.id, row.id)).run()
  }

  return { recovered: jobIds.length, jobIds }
}

export function recoverOrphanedGenerationRecords(reason = 'Geracao interrompida por reinicio do servidor ou encerramento inesperado') {
  const imageRows = db.select({ id: schema.imageGenerations.id, errorMsg: schema.imageGenerations.errorMsg })
    .from(schema.imageGenerations)
    .where(inArray(schema.imageGenerations.status, ACTIVE_GENERATION_STATUSES))
    .all()
  const videoRows = db.select({ id: schema.videoGenerations.id, errorMsg: schema.videoGenerations.errorMsg })
    .from(schema.videoGenerations)
    .where(inArray(schema.videoGenerations.status, ACTIVE_GENERATION_STATUSES))
    .all()
  const mergeRows = db.select({ id: schema.videoMerges.id, errorMsg: schema.videoMerges.errorMsg })
    .from(schema.videoMerges)
    .where(inArray(schema.videoMerges.status, ACTIVE_GENERATION_STATUSES))
    .all()

  const records = [
    ...imageRows.map((row) => ({ type: 'image_generation' as const, id: Number(row.id) })),
    ...videoRows.map((row) => ({ type: 'video_generation' as const, id: Number(row.id) })),
    ...mergeRows.map((row) => ({ type: 'video_merge' as const, id: Number(row.id) })),
  ]
  if (!records.length) return { recovered: 0, records }

  const ts = now()
  for (const row of imageRows) {
    db.update(schema.imageGenerations).set({
      status: 'failed',
      errorMsg: row.errorMsg || reason,
      completedAt: ts,
      updatedAt: ts,
    }).where(eq(schema.imageGenerations.id, row.id)).run()
  }
  for (const row of videoRows) {
    db.update(schema.videoGenerations).set({
      status: 'failed',
      errorMsg: row.errorMsg || reason,
      completedAt: ts,
      updatedAt: ts,
    }).where(eq(schema.videoGenerations.id, row.id)).run()
  }
  for (const row of mergeRows) {
    db.update(schema.videoMerges).set({
      status: 'failed',
      errorMsg: row.errorMsg || reason,
      completedAt: ts,
    }).where(eq(schema.videoMerges.id, row.id)).run()
  }

  return { recovered: records.length, records }
}

function safeParseMetadata(value: string) {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
