import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { sanitizeSupportPrompt, sanitizeVisualPrompt } from './storyboard-prompts.js'
import { dedupeAdjacentStoryboardDialogues } from './storyboard-dialogue.js'
import {
  repairStoryboardRowsAgainstScript,
  sanitizeEpisodeStoryboardCharacterLinks,
  sanitizeStoryboardCharacterIdsForText,
} from './storyboard-grounding.js'
import { isSameSceneCandidate } from './extraction-entities.js'

export type StoryboardDraftInput = {
  shot_number?: number | null
  storyboardNumber?: number | null
  part_number?: number | null
  partNumber?: number | null
  panel_number?: number | null
  panelNumber?: number | null
  time_start_ms?: number | null
  timeStartMs?: number | null
  time_end_ms?: number | null
  timeEndMs?: number | null
  panel_caption?: string | null
  panelCaption?: string | null
  scene_speed?: string | null
  sceneSpeed?: string | null
  title?: string | null
  shot_type?: string | null
  angle?: string | null
  movement?: string | null
  location?: string | null
  time?: string | null
  action?: string | null
  dialogue?: string | null
  description?: string | null
  result?: string | null
  atmosphere?: string | null
  image_prompt?: string | null
  video_prompt?: string | null
  negative_prompt?: string | null
  negativePrompt?: string | null
  prompt_layers?: Record<string, unknown> | string | null
  promptLayers?: Record<string, unknown> | string | null
  model_adapters?: Array<Record<string, unknown>> | string | null
  modelAdapters?: Array<Record<string, unknown>> | string | null
  quality_score?: number | null
  qualityScore?: number | null
  reproducibility?: Record<string, unknown> | string | null
  bgm_prompt?: string | null
  sound_effect?: string | null
  duration?: number | null
  scene_id?: number | null
  sceneId?: number | null
  character_ids?: number[]
  characterIds?: number[]
  character_names?: string[]
  characterNames?: string[]
  scene_location?: string | null
  sceneLocation?: string | null
  scene_time?: string | null
  sceneTime?: string | null
}

type EpisodeCharacterRow = typeof schema.characters.$inferSelect
type EpisodeSceneRow = typeof schema.scenes.$inferSelect

function normalizeWhitespace(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeLookup(value: string) {
  return normalizeWhitespace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function serializeJsonField(value: unknown) {
  if (value == null) return null
  if (typeof value === 'string') return value.trim() || null
  return JSON.stringify(value)
}

function tokenizeName(value: string) {
  return normalizeWhitespace(value)
    .split(/\s+/)
    .map(token => token.replace(/[^A-Za-zÀ-ÿ0-9'’.-]/g, ''))
    .filter(Boolean)
}

function getEpisodeCharacters(episodeId: number, dramaId: number) {
  const linkedCharacterIds = new Set(
    db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId))
      .all()
      .map(link => link.characterId),
  )

  return db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId))
    .all()
    .filter(character => !character.deletedAt && linkedCharacterIds.has(character.id))
}

function getEpisodeScenes(episodeId: number, dramaId: number) {
  const linkedSceneIds = new Set(
    db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.episodeId, episodeId))
      .all()
      .map(link => link.sceneId),
  )

  return db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, dramaId))
    .all()
    .filter(scene => !scene.deletedAt && linkedSceneIds.has(scene.id))
}

function syncStoryboardCharacters(storyboardId: number, characterIds: number[]) {
  db.delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    .run()

  const uniqueIds = [...new Set((characterIds || []).filter(Boolean))]
  if (!uniqueIds.length) return

  for (const characterId of uniqueIds) {
    db.insert(schema.storyboardCharacters).values({
      storyboardId,
      characterId,
    }).run()
  }
}

function resolveCharacterIdsFromNames(
  names: string[],
  episodeCharacters: EpisodeCharacterRow[],
) {
  const normalizedNames = [...new Set((names || []).map(item => normalizeWhitespace(item)).filter(Boolean))]
  const matches = new Set<number>()

  for (const candidateName of normalizedNames) {
    const candidateLookup = normalizeLookup(candidateName)
    const candidateTokens = tokenizeName(candidateName).map(normalizeLookup).filter(Boolean)
    const candidateTail = candidateTokens[candidateTokens.length - 1] || ''
    const directMatch = episodeCharacters.find(character => normalizeLookup(character.name) === candidateLookup)
    if (directMatch) {
      matches.add(directMatch.id)
      continue
    }

    const tailMatches = candidateTail
      ? episodeCharacters.filter((character) => {
          const tokens = tokenizeName(character.name).map(normalizeLookup).filter(Boolean)
          const tail = tokens[tokens.length - 1] || ''
          return tail && tail === candidateTail
        })
      : []

    if (tailMatches.length === 1) {
      matches.add(tailMatches[0].id)
    }
  }

  return [...matches]
}

function resolveStoryboardCharacterIds(
  storyboard: StoryboardDraftInput,
  episodeCharacters: EpisodeCharacterRow[],
) {
  const explicitIds = [...new Set([
    ...(Array.isArray(storyboard.character_ids) ? storyboard.character_ids : []),
    ...(Array.isArray(storyboard.characterIds) ? storyboard.characterIds : []),
  ])].filter((id): id is number => Number.isFinite(Number(id)))
    .map(id => Number(id))
    .filter(id => episodeCharacters.some(character => character.id === id))

  const byNames = resolveCharacterIdsFromNames([
    ...(Array.isArray(storyboard.character_names) ? storyboard.character_names : []),
    ...(Array.isArray(storyboard.characterNames) ? storyboard.characterNames : []),
  ], episodeCharacters)

  return [...new Set([...explicitIds, ...byNames])]
}

function resolveStoryboardScene(
  episodeScenes: EpisodeSceneRow[],
  storyboard: StoryboardDraftInput,
) {
  const explicitSceneId = Number(storyboard.scene_id ?? storyboard.sceneId ?? 0)
  if (explicitSceneId && episodeScenes.some(scene => scene.id === explicitSceneId)) {
    return episodeScenes.find(scene => scene.id === explicitSceneId) || null
  }

  const candidate = {
    location: String(storyboard.scene_location || storyboard.sceneLocation || storyboard.location || ''),
    time: String(storyboard.scene_time || storyboard.sceneTime || storyboard.time || ''),
  }

  if (!normalizeWhitespace(candidate.location)) return null

  return episodeScenes.find(scene => isSameSceneCandidate({
    location: scene.location || '',
    time: scene.time || '',
  }, candidate)) || null
}

export function saveEpisodeStoryboards(
  episodeId: number,
  dramaId: number,
  storyboards: StoryboardDraftInput[],
) {
  const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!episode) {
    throw new Error(`Episode ${episodeId} not found`)
  }

  const episodeCharacters = getEpisodeCharacters(episodeId, dramaId)
  const episodeScenes = getEpisodeScenes(episodeId, dramaId)
  const sortedStoryboards = [...storyboards]
    .sort((left, right) => {
      const leftNumber = Number(left.shot_number ?? left.storyboardNumber ?? 0)
      const rightNumber = Number(right.shot_number ?? right.storyboardNumber ?? 0)
      return leftNumber - rightNumber
    })

  const normalizedStoryboards = dedupeAdjacentStoryboardDialogues(
    repairStoryboardRowsAgainstScript(
      sortedStoryboards,
      String(episode.scriptContent || episode.content || ''),
      String(episode.content || ''),
      episodeCharacters,
    ),
  ) as StoryboardDraftInput[]

  const ts = now()
  const existingStoryboardIds = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId)).all()
    .map(storyboard => storyboard.id)

  for (const storyboardId of existingStoryboardIds) {
    db.delete(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
      .run()
  }
  db.delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).run()

  let totalDuration = 0
  for (const storyboard of normalizedStoryboards) {
    const resolvedScene = resolveStoryboardScene(episodeScenes, storyboard)
    const seededCharacterIds = resolveStoryboardCharacterIds(storyboard, episodeCharacters)
    const groundedCharacterIds = sanitizeStoryboardCharacterIdsForText({
      ...storyboard,
      scene_id: resolvedScene?.id ?? null,
      location: storyboard.location || resolvedScene?.location || '',
      time: storyboard.time || resolvedScene?.time || '',
    }, seededCharacterIds, episodeCharacters)

    const duration = Math.max(3, Math.min(20, Number(storyboard.duration || 10) || 10))
    const insertValues: typeof schema.storyboards.$inferInsert = {
      episodeId,
      sceneId: resolvedScene?.id ?? null,
      storyboardNumber: Number(storyboard.shot_number ?? storyboard.storyboardNumber ?? 0) || 1,
      partNumber: storyboard.part_number ?? storyboard.partNumber ?? null,
      panelNumber: storyboard.panel_number ?? storyboard.panelNumber ?? null,
      timeStartMs: storyboard.time_start_ms ?? storyboard.timeStartMs ?? null,
      timeEndMs: storyboard.time_end_ms ?? storyboard.timeEndMs ?? null,
      panelCaption: normalizeWhitespace(String(storyboard.panel_caption ?? storyboard.panelCaption ?? '')) || null,
      sceneSpeed: normalizeWhitespace(String(storyboard.scene_speed ?? storyboard.sceneSpeed ?? '')) || null,
      title: normalizeWhitespace(String(storyboard.title || '')) || null,
      shotType: normalizeWhitespace(String(storyboard.shot_type || '')) || null,
      angle: normalizeWhitespace(String(storyboard.angle || '')) || null,
      movement: normalizeWhitespace(String(storyboard.movement || '')) || null,
      location: normalizeWhitespace(String(storyboard.location || resolvedScene?.location || '')) || null,
      time: normalizeWhitespace(String(storyboard.time || resolvedScene?.time || '')) || null,
      action: normalizeWhitespace(String(storyboard.action || '')) || null,
      dialogue: normalizeWhitespace(String(storyboard.dialogue || '')) || null,
      description: normalizeWhitespace(String(storyboard.description || '')) || null,
      result: normalizeWhitespace(String(storyboard.result || '')) || null,
      atmosphere: normalizeWhitespace(String(storyboard.atmosphere || '')) || null,
      imagePrompt: sanitizeVisualPrompt(storyboard.image_prompt),
      videoPrompt: sanitizeVisualPrompt(storyboard.video_prompt),
      negativePrompt: sanitizeSupportPrompt(storyboard.negative_prompt ?? storyboard.negativePrompt),
      promptLayers: serializeJsonField(storyboard.prompt_layers ?? storyboard.promptLayers),
      modelAdapters: serializeJsonField(storyboard.model_adapters ?? storyboard.modelAdapters),
      qualityScore: storyboard.quality_score ?? storyboard.qualityScore ?? null,
      reproducibility: serializeJsonField(storyboard.reproducibility),
      bgmPrompt: sanitizeSupportPrompt(storyboard.bgm_prompt),
      soundEffect: sanitizeSupportPrompt(storyboard.sound_effect),
      duration,
      createdAt: ts,
      updatedAt: ts,
    }

    const res = db.insert(schema.storyboards).values(insertValues).run()
    syncStoryboardCharacters(Number(res.lastInsertRowid), groundedCharacterIds)
    totalDuration += duration
  }

  sanitizeEpisodeStoryboardCharacterLinks(episodeId, dramaId)

  db.update(schema.episodes)
    .set({ duration: Math.ceil(totalDuration / 60), updatedAt: ts })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  return {
    count: normalizedStoryboards.length,
    totalDuration,
  }
}
