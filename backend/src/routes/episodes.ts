import { Hono } from 'hono'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, notFound, now } from '../utils/response.js'
import { toSnakeCaseArray, toSnakeCase } from '../utils/transform.js'
import { validateEpisodeAudioCoverage, validateEpisodeForCompose, validateEpisodeForMerge, validateEpisodeScript } from '../services/pipeline-validation.js'
import { sanitizeSupportPrompt, sanitizeVisualPrompt } from '../services/storyboard-prompts.js'
import { dedupeAdjacentStoryboardDialogues } from '../services/storyboard-dialogue.js'
import { getRelativeMediaDuration } from '../services/media-duration.js'
import { listAudioCuesGrouped } from '../services/audio-cues.js'
import {
  isSameCharacterIdentity,
  isSamePropIdentity,
  isSameSceneCandidate,
  normalizeCharacterName,
  normalizeSceneLocation,
  normalizeSceneTime,
  resolveCanonicalPropName,
  sanitizeEpisodeCharacterRows,
  sanitizeEpisodeSceneRows,
} from '../services/extraction-entities.js'
import { listEpisodeExtractionMentionSummaries } from '../services/extraction-audit.js'
import { sanitizeStoryboardCharacterIdsForText } from '../services/storyboard-grounding.js'
import { getStoryboardSpokenDialogue } from '../services/storyboard-speech.js'
import { buildEpisodePipelineContract } from '../services/pipeline-contract.js'
import { resolveStoryboardMotionPreset } from '../services/storyboard-motion.js'
import { normalizeStoryboardSubtitleMode } from '../services/storyboard-subtitles.js'
import { getStoryboardComposeSource } from '../services/storyboard-compose-source.js'
import { buildSceneImagePromptFromProfile, buildSceneVisualProfile, buildStoryboardGenerationSpec } from '../services/visual-identity.js'
import { orchestrateEpisodeProduction } from '../services/episode-orchestrator.js'
import { createWorkflowJob, failWorkflowJob, startWorkflowJob, completeWorkflowJob } from '../services/workflow-jobs.js'
import { parseJsonBody, parseParams, parseQuery, z } from '../utils/validation.js'
import { requireAdminAuth, requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

const episodeIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

const episodeStoryboardParamSchema = z.object({
  episode_id: z.coerce.number().int().positive(),
})

const createEpisodeSchema = z.object({
  drama_id: z.coerce.number().int().positive(),
  image_config_id: z.coerce.number().int().positive(),
  video_config_id: z.coerce.number().int().positive(),
  audio_config_id: z.coerce.number().int().positive(),
  title: z.string().optional(),
})

const updateEpisodeSchema = z.object({
  content: z.string().optional(),
  script_content: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  default_motion_preset: z.string().optional(),
  default_subtitle_mode: z.string().optional(),
  season_number: z.coerce.number().int().positive().optional(),
  episode_in_season: z.coerce.number().int().positive().optional(),
  target_duration_seconds: z.coerce.number().int().positive().optional(),
  target_part_count: z.coerce.number().int().positive().optional(),
  prompt_language: z.string().optional(),
  script_language: z.string().optional(),
  cinematic_status: z.string().optional(),
}).refine(value => Object.keys(value).length > 0, {
  message: 'At least one updatable field is required',
})

const episodeValidationQuerySchema = z.object({
  stage: z.enum(['compose', 'merge', 'script', 'audio']).optional().default('compose'),
})

const orchestrateBodySchema = z.object({
  target: z.enum(['storyboard_review', 'publish_ready']).optional().default('publish_ready'),
})

function parseJsonObject<T>(value: string | null | undefined): T | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as T : null
  } catch {
    return null
  }
}

function mapAudioCueForApi(cue: any) {
  return {
    ...toSnakeCase(cue),
    asset: cue?.asset ? toSnakeCase(cue.asset) : null,
  }
}

function sceneAuditIdentity(scene: { location?: string; time?: string }) {
  return `${normalizeSceneLocation(scene.location || '')}@@${normalizeSceneTime(scene.time || '')}`
}

function findCharacterAudit(summaryMap: Map<string, any>, character: { name?: string }) {
  const identity = normalizeCharacterName(character.name || '')
  return summaryMap.get(identity)
    || [...summaryMap.entries()].find(([key]) => isSameCharacterIdentity(key, identity))?.[1]
    || null
}

function findSceneAudit(summaryMap: Map<string, any>, scene: { location?: string; time?: string }) {
  const identity = sceneAuditIdentity(scene)
  return summaryMap.get(identity)
    || [...summaryMap.entries()].find(([key]) => {
      const [location, time] = String(key || '').split('@@')
      return isSameSceneCandidate(
        { location: location || '', time: time || '' },
        { location: scene.location || '', time: scene.time || '' },
      )
    })?.[1]
    || null
}

function findPropAudit(summaryMap: Map<string, any>, prop: { name?: string | null; description?: string | null; prompt?: string | null }) {
  const description = String(prop.description || prop.prompt || '')
  const identity = resolveCanonicalPropName(prop.name || '', description)
  return summaryMap.get(identity)
    || [...summaryMap.entries()].find(([key]) => (
      isSamePropIdentity(
        key,
        identity,
        '',
        description,
      )
    ))?.[1]
    || null
}

app.post('/', async (c) => {
  const parsed = await parseJsonBody(c, createEpisodeSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data
  const ts = now()

  const existing = db.select().from(schema.episodes)
    .where(eq(schema.episodes.dramaId, body.drama_id))
    .orderBy(schema.episodes.episodeNumber)
    .all()
  const nextNum = existing.length ? Math.max(...existing.map(row => row.episodeNumber)) + 1 : 1

  const result = db.insert(schema.episodes).values({
    dramaId: body.drama_id,
    episodeNumber: nextNum,
    title: body.title || `Episodio ${nextNum}`,
    imageConfigId: body.image_config_id,
    videoConfigId: body.video_config_id,
    audioConfigId: body.audio_config_id,
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const [episode] = db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, Number(result.lastInsertRowid))).all()
  return success(c, {
    id: episode.id,
    episode_number: episode.episodeNumber,
    title: episode.title,
    image_config_id: episode.imageConfigId,
    video_config_id: episode.videoConfigId,
    audio_config_id: episode.audioConfigId,
  })
})

app.put('/:id', async (c) => {
  const paramResult = parseParams(c, episodeIdParamSchema)
  if (!paramResult.ok) return paramResult.response
  const bodyResult = await parseJsonBody(c, updateEpisodeSchema)
  if (!bodyResult.ok) return bodyResult.response

  const body = bodyResult.data
  const updates: Record<string, unknown> = { updatedAt: now() }
  if (body.content !== undefined) updates.content = body.content
  if (body.script_content !== undefined) updates.scriptContent = body.script_content
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.status !== undefined) updates.status = body.status
  if (body.default_motion_preset !== undefined) updates.defaultMotionPreset = body.default_motion_preset
  if (body.default_subtitle_mode !== undefined) updates.defaultSubtitleMode = body.default_subtitle_mode
  if (body.season_number !== undefined) updates.seasonNumber = body.season_number
  if (body.episode_in_season !== undefined) updates.episodeInSeason = body.episode_in_season
  if (body.target_duration_seconds !== undefined) updates.targetDurationSeconds = body.target_duration_seconds
  if (body.target_part_count !== undefined) updates.targetPartCount = body.target_part_count
  if (body.prompt_language !== undefined) updates.promptLanguage = body.prompt_language
  if (body.script_language !== undefined) updates.scriptLanguage = body.script_language
  if (body.cinematic_status !== undefined) updates.cinematicStatus = body.cinematic_status

  db.update(schema.episodes).set(updates).where(eq(schema.episodes.id, paramResult.data.id)).run()
  return success(c)
})

app.get('/:id/characters', async (c) => {
  const parsed = parseParams(c, episodeIdParamSchema)
  if (!parsed.ok) return parsed.response

  const links = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, parsed.data.id)).all()
  const characterIds = links.map(link => link.characterId)
  if (!characterIds.length) return success(c, [])

  const linkedRows = db.select().from(schema.characters)
    .where(and(inArray(schema.characters.id, characterIds), isNull(schema.characters.deletedAt)))
    .all()
  const result = sanitizeEpisodeCharacterRows(linkedRows).characters
  const auditSummaries = listEpisodeExtractionMentionSummaries(parsed.data.id, 'character')
  return success(c, result.map((character) => ({
    ...toSnakeCase(character),
    visual_profile: parseJsonObject(character.visualProfile),
    extraction_audit: findCharacterAudit(auditSummaries, character),
  })))
})

app.get('/:id/scenes', async (c) => {
  const parsed = parseParams(c, episodeIdParamSchema)
  if (!parsed.ok) return parsed.response

  const links = db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, parsed.data.id)).all()
  const sceneIds = links.map(link => link.sceneId)
  if (!sceneIds.length) return success(c, [])

  const linkedRows = db.select().from(schema.scenes)
    .where(and(inArray(schema.scenes.id, sceneIds), isNull(schema.scenes.deletedAt)))
    .all()
  const result = sanitizeEpisodeSceneRows(linkedRows).scenes
  const sceneCues = listAudioCuesGrouped('scene', result.map(scene => scene.id))
  const auditSummaries = listEpisodeExtractionMentionSummaries(parsed.data.id, 'scene')

  return success(c, result.map((scene) => {
    const visualProfile = parseJsonObject<any>(scene.visualProfile) || buildSceneVisualProfile(scene)
    return {
      ...toSnakeCase(scene),
      visual_profile: visualProfile,
      effective_image_prompt: buildSceneImagePromptFromProfile(visualProfile),
      extraction_audit: findSceneAudit(auditSummaries, scene),
      audio_cues: sceneCues.get(scene.id)?.map(mapAudioCueForApi) || [],
    }
  }))
})

app.get('/:id/props', async (c) => {
  const parsed = parseParams(c, episodeIdParamSchema)
  if (!parsed.ok) return parsed.response

  const links = db.select().from(schema.episodeProps)
    .where(eq(schema.episodeProps.episodeId, parsed.data.id)).all()
  const propIds = links.map(link => link.propId)
  if (!propIds.length) return success(c, [])

  const linkedRows = db.select().from(schema.props)
    .where(and(inArray(schema.props.id, propIds), isNull(schema.props.deletedAt)))
    .all()
  const auditSummaries = listEpisodeExtractionMentionSummaries(parsed.data.id, 'prop')
  return success(c, linkedRows.map((prop) => ({
    ...toSnakeCase(prop),
    extraction_audit: findPropAudit(auditSummaries, prop),
  })))
})

app.get('/:episode_id/storyboards', async (c) => {
  const parsed = parseParams(c, episodeStoryboardParamSchema)
  if (!parsed.ok) return parsed.response

  const episodeId = parsed.data.episode_id
  const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  const rows = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()
  const effectiveRows = dedupeAdjacentStoryboardDialogues(rows)
  const storyboardIds = effectiveRows.map(row => row.id)
  const links = storyboardIds.length
    ? db.select().from(schema.storyboardCharacters).where(inArray(schema.storyboardCharacters.storyboardId, storyboardIds)).all()
    : []
  const charIdsByStoryboard = new Map<number, number[]>()
  for (const link of links) {
    const group = charIdsByStoryboard.get(link.storyboardId) || []
    group.push(link.characterId)
    charIdsByStoryboard.set(link.storyboardId, group)
  }

  const episodeCharIds = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId))
    .all()
    .map(link => link.characterId)
  const linkedCharacters = episodeCharIds.length
    ? db.select().from(schema.characters)
      .where(and(inArray(schema.characters.id, episodeCharIds), isNull(schema.characters.deletedAt)))
      .all()
    : []
  const sanitizedCharacters = sanitizeEpisodeCharacterRows(linkedCharacters).characters
  const characterMap = new Map(sanitizedCharacters.map(character => [character.id, character]))

  const sceneIds = [...new Set(effectiveRows.map(row => row.sceneId).filter((value): value is number => Boolean(value)))]
  const scenes = sceneIds.length
    ? db.select().from(schema.scenes).where(and(inArray(schema.scenes.id, sceneIds), isNull(schema.scenes.deletedAt))).all()
    : []
  const sceneMap = new Map(scenes.map(scene => [scene.id, scene]))

  const episodePropIds = db.select().from(schema.episodeProps)
    .where(eq(schema.episodeProps.episodeId, episodeId))
    .all()
    .map(link => link.propId)
  const episodeProps = episodePropIds.length
    ? db.select().from(schema.props).where(and(inArray(schema.props.id, episodePropIds), isNull(schema.props.deletedAt))).all()
    : []
  const storyboardCues = listAudioCuesGrouped('storyboard', storyboardIds)

  const items = await Promise.all(effectiveRows.map(async (row) => {
    const sanitizedCharacterIds = sanitizeStoryboardCharacterIdsForText(
      row,
      charIdsByStoryboard.get(row.id) || [],
      sanitizedCharacters,
    )
    const composedDuration = await getRelativeMediaDuration(row.composedVideoUrl)
    const effectiveDuration = composedDuration ?? Number(row.duration || 10)
    const effectiveMotionPreset = resolveStoryboardMotionPreset(
      episode?.defaultMotionPreset,
      row.motionPresetOverride,
    )
    const effectiveSubtitleMode = normalizeStoryboardSubtitleMode(episode?.defaultSubtitleMode)
    const spokenDialogue = getStoryboardSpokenDialogue(row)
    const composeSource = getStoryboardComposeSource(row)
    const storyboardCharacters = sanitizedCharacterIds
      .map(id => characterMap.get(id))
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
    const generationSpec = episode
      ? buildStoryboardGenerationSpec({
        storyboard: row,
        episode,
        scene: row.sceneId ? sceneMap.get(row.sceneId) || null : null,
        characters: storyboardCharacters,
        props: episodeProps,
      })
      : parseJsonObject(row.generationSpec)
    const renderSettingsDirty = !!(
      composeSource?.kind === 'image'
      && effectiveMotionPreset !== resolveStoryboardMotionPreset(null, row.lastComposedMotionPreset)
    ) || !!(
      spokenDialogue
      && effectiveSubtitleMode !== normalizeStoryboardSubtitleMode(row.lastComposedSubtitleMode)
    )

    return {
      ...toSnakeCase({
        ...row,
        bgmPrompt: sanitizeSupportPrompt(row.bgmPrompt),
        imagePrompt: sanitizeVisualPrompt(row.imagePrompt),
        soundEffect: sanitizeSupportPrompt(row.soundEffect),
        videoPrompt: sanitizeVisualPrompt(row.videoPrompt),
        effectiveDuration,
        effectiveMotionPreset,
        effectiveSubtitleMode,
        renderSettingsDirty,
        spokenDialogue,
        generationSpec,
      }),
      audio_cues: (storyboardCues.get(row.id) || []).map(mapAudioCueForApi),
      character_ids: sanitizedCharacterIds,
      characters: storyboardCharacters.map(character => toSnakeCase(character)),
    }
  }))

  return success(c, items)
})

app.get('/:id/validation', async (c) => {
  const paramResult = parseParams(c, episodeIdParamSchema)
  if (!paramResult.ok) return paramResult.response
  const queryResult = parseQuery(c, episodeValidationQuerySchema)
  if (!queryResult.ok) return queryResult.response

  const issues = queryResult.data.stage === 'merge'
    ? validateEpisodeForMerge(paramResult.data.id)
    : queryResult.data.stage === 'script'
      ? validateEpisodeScript(paramResult.data.id)
      : queryResult.data.stage === 'audio'
        ? validateEpisodeAudioCoverage(paramResult.data.id)
        : validateEpisodeForCompose(paramResult.data.id)

  return success(c, {
    episode_id: paramResult.data.id,
    stage: queryResult.data.stage,
    blocked: issues.some(issue => issue.severity === 'error'),
    issues: toSnakeCaseArray(issues),
  })
})

app.get('/:id/pipeline-status', async (c) => {
  const parsed = parseParams(c, episodeIdParamSchema)
  if (!parsed.ok) return parsed.response

  const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, parsed.data.id)).all()
  if (!episode) return notFound(c, 'Episode not found')
  const contract = buildEpisodePipelineContract(parsed.data.id)
  return success(c, toSnakeCase(contract))
})

app.post('/:id/orchestrate', requireAdminAuth, async (c) => {
  const paramResult = parseParams(c, episodeIdParamSchema)
  if (!paramResult.ok) return paramResult.response
  const bodyResult = await parseJsonBody(c, orchestrateBodySchema)
  if (!bodyResult.ok) return bodyResult.response

  const episodeId = paramResult.data.id
  const target = bodyResult.data.target
  const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!episode) return notFound(c, 'Episode not found')

  const workflowJob = createWorkflowJob({
    kind: 'episode_orchestrate',
    relatedEntityType: 'episode',
    relatedEntityId: episodeId,
    dramaId: episode.dramaId,
    episodeId,
    inputSummary: `orchestrate:${target}`,
    metadata: { target },
  })

  startWorkflowJob(Number(workflowJob?.id), {
    metadata: { target, episodeId },
  })

  ;(async () => {
    try {
      const result = await orchestrateEpisodeProduction({
        episodeId,
        target,
      })
      completeWorkflowJob(Number(workflowJob?.id), {
        outputSummary: `${result.status}:${target}`,
        metadata: result,
      })
    } catch (error) {
      failWorkflowJob(Number(workflowJob?.id), error instanceof Error ? error.message : String(error), {
        metadata: { target, episodeId },
      })
    }
  })()

  return success(c, {
    workflow_job_id: Number(workflowJob?.id),
    status: 'running',
    target,
  })
})

export default app
