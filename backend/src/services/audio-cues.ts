import fs from 'fs'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { resolveStoragePath } from '../utils/storage.js'
import { getRelativeMediaDuration } from './media-duration.js'
import { invalidateEpisodeMerges } from './merge-status.js'
import { getStoryboardComposeSource } from './storyboard-compose-source.js'
import { getStoryboardComposeDuration } from './compose-duration.js'

export const AUDIO_CUE_SCOPE_TYPES = ['episode', 'scene', 'storyboard'] as const
export const AUDIO_CUE_LAYER_TYPES = ['score', 'ambience', 'sfx'] as const

export type AudioCueScopeType = typeof AUDIO_CUE_SCOPE_TYPES[number]
export type AudioCueLayerType = typeof AUDIO_CUE_LAYER_TYPES[number]

type AudioCueInput = Record<string, any>

type AudioCueRow = typeof schema.audioCues.$inferSelect
type AssetRow = typeof schema.assets.$inferSelect

export type ResolvedAudioCue = Omit<AudioCueRow, 'metadata'> & {
  metadata: Record<string, any> | null
  asset: (AssetRow & {
    previewUrl: string | null
    sourcePath: string | null
    durationMs: number | null
  }) | null
}

export type RenderAudioCue = ResolvedAudioCue & {
  sourceTrimMs?: number | null
}

export function getAudioCueAbsolutePath(relativePath?: string | null) {
  const safe = String(relativePath || '').trim()
  if (!safe) return null
  try {
    return resolveStoragePath(safe)
  } catch {
    return null
  }
}

function readString(input: AudioCueInput, snakeKey: string, camelKey = snakeKey) {
  if (snakeKey in input) return input[snakeKey]
  if (camelKey in input) return input[camelKey]
  return undefined
}

function readNumber(input: AudioCueInput, snakeKey: string, camelKey = snakeKey) {
  const raw = readString(input, snakeKey, camelKey)
  if (raw === null) return null
  if (raw === undefined || raw === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : NaN
}

function readBoolean(input: AudioCueInput, snakeKey: string, camelKey = snakeKey) {
  const raw = readString(input, snakeKey, camelKey)
  if (raw == null || raw === '') return undefined
  if (typeof raw === 'boolean') return raw
  const normalized = String(raw).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return undefined
}

function parseMetadata(value: unknown) {
  if (!value) return null
  if (typeof value === 'object') return value as Record<string, any>
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

function stringifyMetadata(value: unknown) {
  if (!value) return null
  return JSON.stringify(value)
}

function normalizePrompt(value: unknown) {
  const text = String(value || '').trim()
  return text || null
}

function getAudioAsset(assetId: number | null | undefined) {
  if (!assetId) return null
  const [asset] = db.select().from(schema.assets)
    .where(and(eq(schema.assets.id, assetId), isNull(schema.assets.deletedAt)))
    .all()
  return asset || null
}

function ensureCueScopeType(value: unknown): AudioCueScopeType {
  const safe = String(value || '').trim().toLowerCase()
  if ((AUDIO_CUE_SCOPE_TYPES as readonly string[]).includes(safe)) return safe as AudioCueScopeType
  throw new Error('scope_type invalido')
}

function ensureCueLayerType(value: unknown): AudioCueLayerType {
  const safe = String(value || '').trim().toLowerCase()
  if ((AUDIO_CUE_LAYER_TYPES as readonly string[]).includes(safe)) return safe as AudioCueLayerType
  throw new Error('layer_type invalido')
}

export function assertCueScopeLayerCompatibility(scopeType: AudioCueScopeType, layerType: AudioCueLayerType) {
  if (scopeType === 'episode' || scopeType === 'scene') {
    if (layerType === 'score' || layerType === 'ambience') return
    throw new Error(`${scopeType} aceita apenas cues de score ou ambience`)
  }

  if (scopeType === 'storyboard') {
    if (layerType === 'sfx' || layerType === 'ambience') return
    throw new Error('storyboard aceita apenas cues de sfx ou ambience')
  }
}

function ensureNonNegativeInt(value: number | null | undefined, field: string, allowNull = false) {
  if (value == null) {
    if (allowNull) return null
    throw new Error(`${field} obrigatorio`)
  }
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} invalido`)
  return Math.round(value)
}

function ensureFiniteNumber(value: number | null | undefined, field: string, fallback?: number) {
  if (value == null && fallback != null) return fallback
  if (value == null || !Number.isFinite(value)) throw new Error(`${field} invalido`)
  return value
}

function ensureAudioAsset(assetId: number | null) {
  if (assetId == null) return null
  const asset = getAudioAsset(assetId)
  if (!asset) throw new Error('asset_id nao encontrado')
  if (String(asset.type || '').toLowerCase() !== 'audio') throw new Error('asset_id precisa apontar para um audio')
  return asset
}

function mapCueWithAsset(cue: AudioCueRow, assetById: Map<number, AssetRow>): ResolvedAudioCue {
  const asset = cue.assetId ? assetById.get(cue.assetId) || null : null
  const sourcePath = asset ? asset.url || asset.localPath || null : null
  const previewUrl = sourcePath ? `/${sourcePath.replace(/^\/+/, '')}` : null
  const durationMs = asset?.duration != null ? Math.round(Number(asset.duration || 0) * 1000) : null

  return {
    ...cue,
    metadata: parseMetadata(cue.metadata),
    asset: asset ? {
      ...asset,
      category: cue.layerType,
      previewUrl,
      sourcePath,
      durationMs,
    } : null,
  }
}

export function normalizeAudioCuePayload(input: AudioCueInput, mode: 'create' | 'update') {
  const patch: Record<string, any> = {}

  const scopeTypeRaw = readString(input, 'scope_type', 'scopeType')
  const scopeIdRaw = readNumber(input, 'scope_id', 'scopeId')
  const layerTypeRaw = readString(input, 'layer_type', 'layerType')
  const assetIdRaw = readNumber(input, 'asset_id', 'assetId')
  const promptRaw = readString(input, 'prompt')
  const startMsRaw = readNumber(input, 'start_ms', 'startMs')
  const targetDurationMsRaw = readNumber(input, 'target_duration_ms', 'targetDurationMs')
  const volumeDbRaw = readNumber(input, 'volume_db', 'volumeDb')
  const fadeInMsRaw = readNumber(input, 'fade_in_ms', 'fadeInMs')
  const fadeOutMsRaw = readNumber(input, 'fade_out_ms', 'fadeOutMs')
  const loopRaw = readBoolean(input, 'loop')
  const duckDialogueRaw = readBoolean(input, 'duck_dialogue', 'duckDialogue')
  const sortOrderRaw = readNumber(input, 'sort_order', 'sortOrder')
  const metadataRaw = readString(input, 'metadata')

  if (mode === 'create' || scopeTypeRaw !== undefined) patch.scopeType = ensureCueScopeType(scopeTypeRaw)
  if (mode === 'create' || scopeIdRaw !== undefined) patch.scopeId = ensureNonNegativeInt(scopeIdRaw, 'scope_id')
  if (mode === 'create' || layerTypeRaw !== undefined) patch.layerType = ensureCueLayerType(layerTypeRaw)
  if (assetIdRaw !== undefined) {
    patch.assetId = assetIdRaw == null ? null : ensureNonNegativeInt(assetIdRaw, 'asset_id', true)
    ensureAudioAsset(patch.assetId)
  }
  if (promptRaw !== undefined) patch.prompt = normalizePrompt(promptRaw)
  if (mode === 'create' || startMsRaw !== undefined) patch.startMs = ensureNonNegativeInt(startMsRaw ?? 0, 'start_ms')
  if (targetDurationMsRaw !== undefined) {
    if (targetDurationMsRaw === null) patch.targetDurationMs = null
    else {
      const targetDurationMs = ensureNonNegativeInt(targetDurationMsRaw, 'target_duration_ms', true)
      patch.targetDurationMs = targetDurationMs != null && targetDurationMs <= 0 ? null : targetDurationMs
    }
  }
  if (mode === 'create' || volumeDbRaw !== undefined) patch.volumeDb = ensureFiniteNumber(volumeDbRaw, 'volume_db', 0)
  if (mode === 'create' || fadeInMsRaw !== undefined) patch.fadeInMs = ensureNonNegativeInt(fadeInMsRaw ?? 0, 'fade_in_ms')
  if (mode === 'create' || fadeOutMsRaw !== undefined) patch.fadeOutMs = ensureNonNegativeInt(fadeOutMsRaw ?? 0, 'fade_out_ms')
  if (mode === 'create' || loopRaw !== undefined) patch.loop = Boolean(loopRaw)
  if (mode === 'create' || duckDialogueRaw !== undefined) patch.duckDialogue = Boolean(duckDialogueRaw)
  if (mode === 'create' || sortOrderRaw !== undefined) patch.sortOrder = ensureNonNegativeInt(sortOrderRaw ?? 0, 'sort_order')
  if (metadataRaw !== undefined || ('metadata' in input && typeof input.metadata === 'object')) {
    patch.metadata = stringifyMetadata(typeof input.metadata === 'object' ? input.metadata : parseMetadata(metadataRaw))
  }

  if (patch.fadeInMs != null && patch.targetDurationMs != null && patch.fadeInMs > patch.targetDurationMs) {
    throw new Error('fade_in_ms nao pode ser maior que target_duration_ms')
  }
  if (patch.fadeOutMs != null && patch.targetDurationMs != null && patch.fadeOutMs > patch.targetDurationMs) {
    throw new Error('fade_out_ms nao pode ser maior que target_duration_ms')
  }
  if (patch.scopeType && patch.layerType) {
    assertCueScopeLayerCompatibility(patch.scopeType, patch.layerType)
  }

  return patch
}

export function listAudioCuesForScope(scopeType: AudioCueScopeType, scopeId: number) {
  const rows = db.select().from(schema.audioCues)
    .where(and(
      eq(schema.audioCues.scopeType, scopeType),
      eq(schema.audioCues.scopeId, scopeId),
      isNull(schema.audioCues.deletedAt),
    ))
    .orderBy(asc(schema.audioCues.sortOrder), asc(schema.audioCues.id))
    .all()

  const assetIds = [...new Set(rows.map((row) => row.assetId).filter((value): value is number => Number.isFinite(Number(value))))]
  const assets = assetIds.length
    ? db.select().from(schema.assets)
      .where(and(inArray(schema.assets.id, assetIds), isNull(schema.assets.deletedAt)))
      .all()
    : []
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  return rows.map((row) => mapCueWithAsset(row, assetById))
}

export function listAudioCuesGrouped(scopeType: AudioCueScopeType, scopeIds: number[]) {
  const uniqueIds = [...new Set(scopeIds.filter((value) => Number.isFinite(Number(value))))]
  const rows = uniqueIds.length
    ? db.select().from(schema.audioCues)
      .where(and(
        eq(schema.audioCues.scopeType, scopeType),
        inArray(schema.audioCues.scopeId, uniqueIds),
        isNull(schema.audioCues.deletedAt),
      ))
      .orderBy(asc(schema.audioCues.scopeId), asc(schema.audioCues.sortOrder), asc(schema.audioCues.id))
      .all()
    : []

  const assetIds = [...new Set(rows.map((row) => row.assetId).filter((value): value is number => Number.isFinite(Number(value))))]
  const assets = assetIds.length
    ? db.select().from(schema.assets)
      .where(and(inArray(schema.assets.id, assetIds), isNull(schema.assets.deletedAt)))
      .all()
    : []
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const grouped = new Map<number, ResolvedAudioCue[]>()

  for (const row of rows) {
    const items = grouped.get(row.scopeId) || []
    items.push(mapCueWithAsset(row, assetById))
    grouped.set(row.scopeId, items)
  }

  return grouped
}

export function getAudioCueById(id: number) {
  const [row] = db.select().from(schema.audioCues)
    .where(and(eq(schema.audioCues.id, id), isNull(schema.audioCues.deletedAt)))
    .all()
  return row || null
}

export function getResolvedAudioCueById(id: number) {
  const cue = getAudioCueById(id)
  if (!cue) return null
  const assetIds = cue.assetId ? [cue.assetId] : []
  const assets = assetIds.length
    ? db.select().from(schema.assets)
      .where(and(inArray(schema.assets.id, assetIds), isNull(schema.assets.deletedAt)))
      .all()
    : []
  return mapCueWithAsset(cue, new Map(assets.map((asset) => [asset.id, asset])))
}

export function getScopeEpisodeIds(scopeType: AudioCueScopeType, scopeId: number) {
  if (scopeType === 'episode') return [scopeId]
  if (scopeType === 'storyboard') {
    const [storyboard] = db.select({ episodeId: schema.storyboards.episodeId })
      .from(schema.storyboards)
      .where(eq(schema.storyboards.id, scopeId))
      .all()
    return storyboard?.episodeId ? [Number(storyboard.episodeId)] : []
  }
  const [scene] = db.select({ episodeId: schema.scenes.episodeId })
    .from(schema.scenes)
    .where(eq(schema.scenes.id, scopeId))
    .all()
  if (scene?.episodeId) return [Number(scene.episodeId)]
  const links = db.select({ episodeId: schema.episodeScenes.episodeId })
    .from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.sceneId, scopeId))
    .all()
  return [...new Set(links.map((link) => Number(link.episodeId)).filter(Boolean))]
}

export function getScopeContext(scopeType: AudioCueScopeType, scopeId: number) {
  if (scopeType === 'episode') {
    const [episode] = db.select().from(schema.episodes)
      .where(eq(schema.episodes.id, scopeId))
      .all()
    if (!episode) return null
    return {
      dramaId: episode.dramaId,
      episodeId: episode.id,
      sceneId: null,
      storyboardId: null,
    }
  }

  if (scopeType === 'storyboard') {
    const [storyboard] = db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.id, scopeId))
      .all()
    if (!storyboard) return null
    const [episode] = db.select({ dramaId: schema.episodes.dramaId })
      .from(schema.episodes)
      .where(eq(schema.episodes.id, storyboard.episodeId))
      .all()
    return {
      dramaId: episode?.dramaId ?? null,
      episodeId: storyboard.episodeId,
      sceneId: storyboard.sceneId ?? null,
      storyboardId: storyboard.id,
    }
  }

  const [scene] = db.select().from(schema.scenes)
    .where(eq(schema.scenes.id, scopeId))
    .all()
  if (!scene) return null
  return {
    dramaId: scene.dramaId,
    episodeId: scene.episodeId ?? getScopeEpisodeIds('scene', scopeId)[0] ?? null,
    sceneId: scene.id,
    storyboardId: null,
  }
}

export function attachCueAssetContext(assetId: number | null | undefined, scopeType: AudioCueScopeType, scopeId: number, layerType: AudioCueLayerType) {
  if (!assetId) return
  const context = getScopeContext(scopeType, scopeId)
  if (!context) return
  const asset = getAudioAsset(assetId)
  if (!asset) return
  const storyboardNumber = context.storyboardId
    ? db.select({ storyboardNumber: schema.storyboards.storyboardNumber })
      .from(schema.storyboards)
      .where(eq(schema.storyboards.id, context.storyboardId))
      .all()[0]?.storyboardNumber
    : null

  const patch: Record<string, any> = {
    type: 'audio',
    updatedAt: now(),
  }

  if (!asset.category) patch.category = layerType
  if (asset.dramaId == null && context.dramaId != null) patch.dramaId = context.dramaId
  if (asset.episodeId == null && context.episodeId != null) patch.episodeId = context.episodeId
  if (asset.storyboardId == null && context.storyboardId != null) {
    patch.storyboardId = context.storyboardId
    patch.storyboardNum = storyboardNumber ?? undefined
  }

  db.update(schema.assets).set({
    ...patch,
  }).where(eq(schema.assets.id, assetId)).run()
}

export function invalidateAudioCueScope(scopeType: AudioCueScopeType, scopeId: number, affectsRender: boolean) {
  if (!affectsRender) return
  if (scopeType === 'storyboard') {
    const [storyboard] = db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.id, scopeId))
      .all()
    if (!storyboard) return
    db.update(schema.storyboards).set({
      composedVideoUrl: null,
      status: 'pending',
      updatedAt: now(),
    }).where(eq(schema.storyboards.id, scopeId)).run()
    invalidateEpisodeMerges(storyboard.episodeId)
    return
  }

  const storyboardIds = scopeType === 'episode'
    ? db.select({ id: schema.storyboards.id }).from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, scopeId))
      .all()
      .map((row) => row.id)
    : db.select({ id: schema.storyboards.id }).from(schema.storyboards)
      .where(eq(schema.storyboards.sceneId, scopeId))
      .all()
      .map((row) => row.id)

  if (storyboardIds.length) {
    db.update(schema.storyboards).set({
      composedVideoUrl: null,
      status: 'pending',
      updatedAt: now(),
    }).where(inArray(schema.storyboards.id, storyboardIds)).run()
  }

  for (const episodeId of getScopeEpisodeIds(scopeType, scopeId)) {
    invalidateEpisodeMerges(episodeId)
  }
}

type StoryboardAudioTiming = {
  storyboardId: number
  episodeId: number
  sceneId: number | null
  durationMs: number
  episodeStartMs: number
  sceneStartMs: number
}

async function getStoryboardEstimatedDurationMs(storyboard: typeof schema.storyboards.$inferSelect) {
  const composedDuration = await getRelativeMediaDuration(storyboard.composedVideoUrl)
  if (composedDuration && composedDuration > 0) {
    return Math.max(100, Math.round(composedDuration * 1000))
  }

  const composeSource = getStoryboardComposeSource(storyboard)
  const sourceDuration = composeSource?.kind === 'video'
    ? await getRelativeMediaDuration(composeSource.url)
    : null
  const ttsDuration = await getRelativeMediaDuration(storyboard.ttsAudioUrl)
  const durationSeconds = getStoryboardComposeDuration({
    sourceKind: composeSource?.kind || 'image',
    plannedDuration: storyboard.duration,
    sourceDuration,
    ttsDuration,
    hasSpokenAudio: !!String(storyboard.dialogue || '').trim() && !!ttsDuration,
  })
  return Math.max(100, Math.round(durationSeconds * 1000))
}

async function buildEpisodeStoryboardAudioTimings(episodeId: number) {
  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()

  const durationsMs = await Promise.all(storyboards.map((storyboard) => getStoryboardEstimatedDurationMs(storyboard)))
  const sceneOffsets = new Map<number, number>()
  const timings = new Map<number, StoryboardAudioTiming>()
  let episodeCursorMs = 0

  storyboards.forEach((storyboard, index) => {
    const durationMs = durationsMs[index] || 100
    const sceneId = Number(storyboard.sceneId || 0) || null
    const sceneStartMs = sceneId ? (sceneOffsets.get(sceneId) || 0) : 0
    timings.set(storyboard.id, {
      storyboardId: storyboard.id,
      episodeId,
      sceneId,
      durationMs,
      episodeStartMs: episodeCursorMs,
      sceneStartMs,
    })
    episodeCursorMs += durationMs
    if (sceneId) sceneOffsets.set(sceneId, sceneStartMs + durationMs)
  })

  return timings
}

function projectCueToStoryboardWindow(
  cue: ResolvedAudioCue,
  scopeWindowStartMs: number,
  storyboardDurationMs: number,
): RenderAudioCue | null {
  if (!cue.assetId || !cue.asset) return null

  const cueStartMs = Math.max(0, Number(cue.startMs || 0))
  const cueEndMs = cue.targetDurationMs != null
    ? cueStartMs + Math.max(0, Number(cue.targetDurationMs || 0))
    : Number.POSITIVE_INFINITY
  const windowEndMs = scopeWindowStartMs + storyboardDurationMs
  const overlapStartMs = Math.max(scopeWindowStartMs, cueStartMs)
  const overlapEndMs = Math.min(windowEndMs, cueEndMs)
  const overlapDurationMs = Math.max(0, overlapEndMs - overlapStartMs)

  if (overlapDurationMs <= 10) return null

  return {
    ...cue,
    startMs: Math.max(0, cueStartMs - scopeWindowStartMs),
    targetDurationMs: overlapDurationMs,
    sourceTrimMs: Math.max(0, overlapStartMs - cueStartMs),
  }
}

export async function getStoryboardRenderAudioCues(storyboardId: number): Promise<RenderAudioCue[]> {
  const [storyboard] = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, storyboardId))
    .all()
  if (!storyboard) return []

  const timings = await buildEpisodeStoryboardAudioTimings(storyboard.episodeId)
  const timing = timings.get(storyboardId)
  if (!timing) return []

  const localCues: RenderAudioCue[] = listAudioCuesForScope('storyboard', storyboardId)
    .filter((cue) => !!cue.assetId && (cue.layerType === 'sfx' || cue.layerType === 'ambience'))
    .map((cue) => ({ ...cue, sourceTrimMs: 0 }))

  const episodeCues = listAudioCuesForScope('episode', storyboard.episodeId)
    .filter((cue) => !!cue.assetId && (cue.layerType === 'score' || cue.layerType === 'ambience'))
    .map((cue) => projectCueToStoryboardWindow(cue, timing.episodeStartMs, timing.durationMs))
    .filter((cue): cue is RenderAudioCue => !!cue)

  const sceneCues = timing.sceneId
    ? listAudioCuesForScope('scene', timing.sceneId)
      .filter((cue) => !!cue.assetId && (cue.layerType === 'score' || cue.layerType === 'ambience'))
      .map((cue) => projectCueToStoryboardWindow(cue, timing.sceneStartMs, timing.durationMs))
      .filter((cue): cue is RenderAudioCue => !!cue)
    : []

  return [...episodeCues, ...sceneCues, ...localCues]
    .sort((a, b) => {
      const startDiff = Number(a.startMs || 0) - Number(b.startMs || 0)
      if (startDiff !== 0) return startDiff
      const sortDiff = Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
      if (sortDiff !== 0) return sortDiff
      return Number(a.id || 0) - Number(b.id || 0)
    })
}

export async function resolveCuePlayback(cue: ResolvedAudioCue) {
  const sourcePath = cue.asset?.sourcePath || cue.asset?.url || cue.asset?.localPath || null
  const absolutePath = getAudioCueAbsolutePath(sourcePath)
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return {
      ...cue,
      absolutePath: null,
      durationSeconds: null,
    }
  }

  const durationSeconds = await getRelativeMediaDuration(sourcePath)
  return {
    ...cue,
    absolutePath,
    durationSeconds,
  }
}
