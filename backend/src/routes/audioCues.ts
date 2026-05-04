import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { created, badRequest, success, now } from '../utils/response.js'
import { db, schema } from '../db/index.js'
import { toSnakeCase } from '../utils/transform.js'
import {
  assertCueScopeLayerCompatibility,
  attachCueAssetContext,
  getAudioCueById,
  getResolvedAudioCueById,
  invalidateAudioCueScope,
  listAudioCuesForScope,
  normalizeAudioCuePayload,
  type AudioCueLayerType,
  type AudioCueScopeType,
} from '../services/audio-cues.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

function cueAffectsRender(cue: { assetId?: number | null } | null | undefined, nextAssetId?: number | null) {
  if (nextAssetId != null) return !!nextAssetId
  return !!cue?.assetId
}

app.get('/', async (c) => {
  const scopeType = String(c.req.query('scope_type') || '').trim().toLowerCase()
  const scopeId = Number(c.req.query('scope_id') || 0)

  if (!scopeType) return badRequest(c, 'scope_type is required')
  if (!scopeId) return badRequest(c, 'scope_id is required')

  try {
    const items = listAudioCuesForScope(scopeType as AudioCueScopeType, scopeId)
    return success(c, items.map((item) => ({
      ...toSnakeCase(item as any),
      asset: item.asset ? toSnakeCase(item.asset as any) : null,
    })))
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

app.post('/', async (c) => {
  let body: Record<string, any> = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  try {
    const patch = normalizeAudioCuePayload(body, 'create')
    assertCueScopeLayerCompatibility(patch.scopeType as AudioCueScopeType, patch.layerType as AudioCueLayerType)
    const ts = now()
    const result = db.insert(schema.audioCues).values({
      scopeType: patch.scopeType,
      scopeId: patch.scopeId,
      layerType: patch.layerType,
      assetId: patch.assetId ?? null,
      prompt: patch.prompt ?? null,
      startMs: patch.startMs,
      targetDurationMs: patch.targetDurationMs ?? null,
      volumeDb: patch.volumeDb,
      fadeInMs: patch.fadeInMs,
      fadeOutMs: patch.fadeOutMs,
      loop: patch.loop,
      duckDialogue: patch.duckDialogue,
      sortOrder: patch.sortOrder,
      metadata: patch.metadata ?? null,
      createdAt: ts,
      updatedAt: ts,
    }).run()

    const cueId = Number(result.lastInsertRowid)
    attachCueAssetContext(patch.assetId, patch.scopeType as AudioCueScopeType, patch.scopeId, patch.layerType as AudioCueLayerType)
    invalidateAudioCueScope(patch.scopeType as AudioCueScopeType, patch.scopeId, cueAffectsRender(null, patch.assetId))
    const item = getResolvedAudioCueById(cueId)
    return created(c, item ? {
      ...toSnakeCase(item as any),
      asset: item.asset ? toSnakeCase(item.asset as any) : null,
    } : null)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const existing = getAudioCueById(id)
  if (!existing) return badRequest(c, 'audio cue not found')

  let body: Record<string, any> = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  try {
    const patch = normalizeAudioCuePayload(body, 'update')
    if (!Object.keys(patch).length) return badRequest(c, 'no valid fields')
    const hasPatch = (field: string) => Object.prototype.hasOwnProperty.call(patch, field)

    const nextScopeType = (patch.scopeType ?? existing.scopeType) as AudioCueScopeType
    const nextScopeId = Number(patch.scopeId ?? existing.scopeId)
    const nextLayerType = (patch.layerType ?? existing.layerType) as AudioCueLayerType
    const nextAssetId = patch.assetId !== undefined ? patch.assetId : existing.assetId
    assertCueScopeLayerCompatibility(nextScopeType, nextLayerType)

    const updates: Record<string, any> = { updatedAt: now() }
    if (hasPatch('scopeType')) updates.scopeType = patch.scopeType
    if (hasPatch('scopeId')) updates.scopeId = patch.scopeId
    if (hasPatch('layerType')) updates.layerType = patch.layerType
    if (hasPatch('assetId')) updates.assetId = patch.assetId
    if (hasPatch('prompt')) updates.prompt = patch.prompt
    if (hasPatch('startMs')) updates.startMs = patch.startMs
    if (hasPatch('targetDurationMs')) updates.targetDurationMs = patch.targetDurationMs
    if (hasPatch('volumeDb')) updates.volumeDb = patch.volumeDb
    if (hasPatch('fadeInMs')) updates.fadeInMs = patch.fadeInMs
    if (hasPatch('fadeOutMs')) updates.fadeOutMs = patch.fadeOutMs
    if (hasPatch('loop')) updates.loop = patch.loop
    if (hasPatch('duckDialogue')) updates.duckDialogue = patch.duckDialogue
    if (hasPatch('sortOrder')) updates.sortOrder = patch.sortOrder
    if (hasPatch('metadata')) updates.metadata = patch.metadata

    db.update(schema.audioCues).set(updates).where(eq(schema.audioCues.id, id)).run()

    attachCueAssetContext(nextAssetId, nextScopeType, nextScopeId, nextLayerType)
    invalidateAudioCueScope(existing.scopeType as AudioCueScopeType, existing.scopeId, cueAffectsRender(existing))
    if (existing.scopeType !== nextScopeType || Number(existing.scopeId) !== nextScopeId) {
      invalidateAudioCueScope(nextScopeType, nextScopeId, cueAffectsRender(existing, nextAssetId))
    }
    const item = getResolvedAudioCueById(id)
    return success(c, item ? {
      ...toSnakeCase(item as any),
      asset: item.asset ? toSnakeCase(item.asset as any) : null,
    } : null)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const existing = getAudioCueById(id)
  if (!existing) return badRequest(c, 'audio cue not found')

  db.update(schema.audioCues).set({
    deletedAt: now(),
    updatedAt: now(),
  }).where(eq(schema.audioCues.id, id)).run()

  invalidateAudioCueScope(existing.scopeType as AudioCueScopeType, existing.scopeId, cueAffectsRender(existing))
  return success(c)
})

export default app
