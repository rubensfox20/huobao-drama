import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'

type AssetCacheLookupInput = {
  assetType: 'image' | 'video'
  provider: string
  model?: string | null
  prompt: string
  referenceMode?: string | null
  inputs?: Record<string, unknown> | null
}

function stableStringify(value: unknown): string {
  if (value == null) return ''
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stableStringify(inner)}`).join(',')}}`
}

export function buildAssetGenerationCacheKey(input: AssetCacheLookupInput) {
  const raw = stableStringify({
    assetType: input.assetType,
    provider: input.provider,
    model: input.model || '',
    prompt: input.prompt.trim(),
    referenceMode: input.referenceMode || '',
    inputs: input.inputs || {},
  })
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function findAssetGenerationCacheByKey(cacheKey: string) {
  const [row] = db.select().from(schema.assetGenerationCache)
    .where(eq(schema.assetGenerationCache.cacheKey, cacheKey))
    .all()
  return row || null
}

export function touchAssetGenerationCache(id: number) {
  const existing = db.select().from(schema.assetGenerationCache)
    .where(eq(schema.assetGenerationCache.id, id)).all()[0]
  if (!existing) return
  db.update(schema.assetGenerationCache).set({
    hitCount: (existing.hitCount || 0) + 1,
    lastHitAt: now(),
    updatedAt: now(),
  }).where(eq(schema.assetGenerationCache.id, id)).run()
}

export function upsertAssetGenerationCache(input: {
  assetType: 'image' | 'video'
  cacheKey: string
  provider: string
  model?: string | null
  prompt: string
  referenceMode?: string | null
  sourceImageGenerationId?: number | null
  sourceVideoGenerationId?: number | null
  imageUrl?: string | null
  videoUrl?: string | null
  localPath?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const existing = findAssetGenerationCacheByKey(input.cacheKey)
  const ts = now()
  if (existing) {
    db.update(schema.assetGenerationCache).set({
      provider: input.provider,
      model: input.model ?? null,
      prompt: input.prompt,
      referenceMode: input.referenceMode ?? null,
      sourceImageGenerationId: input.sourceImageGenerationId ?? null,
      sourceVideoGenerationId: input.sourceVideoGenerationId ?? null,
      imageUrl: input.imageUrl ?? null,
      videoUrl: input.videoUrl ?? null,
      localPath: input.localPath ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : existing.metadata,
      status: 'completed',
      updatedAt: ts,
      lastHitAt: ts,
    }).where(eq(schema.assetGenerationCache.id, existing.id)).run()
    return findAssetGenerationCacheByKey(input.cacheKey)
  }

  const result = db.insert(schema.assetGenerationCache).values({
    assetType: input.assetType,
    cacheKey: input.cacheKey,
    provider: input.provider,
    model: input.model ?? null,
    prompt: input.prompt,
    referenceMode: input.referenceMode ?? null,
    sourceImageGenerationId: input.sourceImageGenerationId ?? null,
    sourceVideoGenerationId: input.sourceVideoGenerationId ?? null,
    imageUrl: input.imageUrl ?? null,
    videoUrl: input.videoUrl ?? null,
    localPath: input.localPath ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    status: 'completed',
    hitCount: 0,
    lastHitAt: ts,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  return db.select().from(schema.assetGenerationCache)
    .where(eq(schema.assetGenerationCache.id, Number(result.lastInsertRowid)))
    .all()[0]
}
