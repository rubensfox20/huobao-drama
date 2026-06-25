import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now, badRequest } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { generateTTS } from '../services/tts-generation.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { getAudioConfigById } from '../services/ai.js'
import { sanitizeSupportPrompt, sanitizeVisualPrompt } from '../services/storyboard-prompts.js'
import { createWorkflowJob, startWorkflowJob, completeWorkflowJob, failWorkflowJob } from '../services/workflow-jobs.js'
import { validateStoryboardForTTS, validateVisualPrompt } from '../services/pipeline-validation.js'
import { resolveStoryboardVoiceSelection } from '../services/storyboard-voice.js'
import { getStoryboardSpokenDialogue } from '../services/storyboard-speech.js'
import { normalizeStoryboardContinuityMode, normalizeStoryboardReviewStatus } from '../services/storyboard-review.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

const IGNORE_TTS_SPEAKERS = /^(sfx|sound ?effect|bgm|ambient)$/i
const IGNORE_TTS_TEXT = /^(none|null|n\/a|na|bgm|sfx|ambient)$/i

function parseDialogueForTTS(dialogue?: string | null) {
  const raw = dialogue?.trim() || ''
  if (!raw) return { speaker: '', pureText: '', ignorable: true }
  const speakerMatch = raw.match(/^(.+?)[:：]/)
  const speaker = speakerMatch ? speakerMatch[1].replace(/[（(].+?[)）]/g, '').trim() : ''
  const pureText = raw.replace(/^.+?[:：]\s*/, '').replace(/[（(].+?[)）]/g, '').trim()
  const ignorable = (!!speaker && IGNORE_TTS_SPEAKERS.test(speaker)) || !pureText || IGNORE_TTS_TEXT.test(pureText)
  return { speaker, pureText, ignorable }
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

function getStoryboardCharacterIds(storyboardId: number) {
  return db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId)).all()
    .map(link => link.characterId)
}

function validateStoryboardBindings(episodeId: number, sceneId: number | null | undefined, characterIds: number[] | undefined) {
  const episodeSceneIds = new Set(
    db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.episodeId, episodeId)).all()
      .map(link => link.sceneId),
  )
  const episodeCharacterIds = new Set(
    db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
      .map(link => link.characterId),
  )

  if (sceneId != null && !episodeSceneIds.has(sceneId)) {
    throw new Error('scene_id deve pertencer a uma cena vinculada ao episódio atual')
  }

  const invalidCharacterIds = (characterIds || []).filter(id => !episodeCharacterIds.has(id))
  if (invalidCharacterIds.length) {
    throw new Error('character_ids deve pertencer a personagens vinculados ao episódio atual')
  }
}

// POST /storyboards
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  logTaskStart('StoryboardAPI', 'create', {
    episodeId: body.episode_id,
    shotNumber: body.storyboard_number || 1,
    sceneId: body.scene_id,
    characterIds: body.character_ids,
  })
  logTaskPayload('StoryboardAPI', 'create body', body)
  validateStoryboardBindings(body.episode_id, body.scene_id, body.character_ids)
  const res = db.insert(schema.storyboards).values({
    episodeId: body.episode_id,
    storyboardNumber: body.storyboard_number || 1,
    partNumber: body.part_number ?? null,
    panelNumber: body.panel_number ?? null,
    timeStartMs: body.time_start_ms ?? null,
    timeEndMs: body.time_end_ms ?? null,
    panelCaption: body.panel_caption ?? null,
    sceneSpeed: body.scene_speed ?? null,
    title: body.title,
    description: body.description,
    action: body.action,
    dialogue: body.dialogue,
    imagePrompt: 'image_prompt' in body ? sanitizeVisualPrompt(body.image_prompt) : undefined,
    videoPrompt: 'video_prompt' in body ? sanitizeVisualPrompt(body.video_prompt) : undefined,
    negativePrompt: body.negative_prompt,
    promptLayers: typeof body.prompt_layers === 'string' ? body.prompt_layers : body.prompt_layers ? JSON.stringify(body.prompt_layers) : undefined,
    modelAdapters: typeof body.model_adapters === 'string' ? body.model_adapters : body.model_adapters ? JSON.stringify(body.model_adapters) : undefined,
    qualityScore: body.quality_score ?? null,
    version: body.version ?? 1,
    reproducibility: typeof body.reproducibility === 'string' ? body.reproducibility : body.reproducibility ? JSON.stringify(body.reproducibility) : undefined,
    sceneId: body.scene_id,
    duration: body.duration || 10,
    motionPresetOverride: body.motion_preset_override || null,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  syncStoryboardCharacters(Number(res.lastInsertRowid), body.character_ids || [])
  const [result] = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, Number(res.lastInsertRowid))).all()
  logTaskSuccess('StoryboardAPI', 'create', {
    storyboardId: result.id,
    episodeId: result.episodeId,
    shotNumber: result.storyboardNumber,
  })
  return created(c, {
    ...toSnakeCase(result),
    character_ids: getStoryboardCharacterIds(result.id),
  })
})

// PUT /storyboards/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [storyboard] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).all()
  if (!storyboard) return badRequest(c, 'Tomada não encontrada')
  logTaskStart('StoryboardAPI', 'update', {
    storyboardId: id,
    episodeId: storyboard.episodeId,
    fields: Object.keys(body),
  })
  logTaskPayload('StoryboardAPI', 'update body', body)

  const fieldMap: Record<string, string> = {
    title: 'title', description: 'description', shot_type: 'shotType',
    part_number: 'partNumber', panel_number: 'panelNumber',
    time_start_ms: 'timeStartMs', time_end_ms: 'timeEndMs',
    panel_caption: 'panelCaption', scene_speed: 'sceneSpeed',
    angle: 'angle', movement: 'movement', action: 'action',
    dialogue: 'dialogue', duration: 'duration', video_prompt: 'videoPrompt',
    image_prompt: 'imagePrompt', negative_prompt: 'negativePrompt',
    prompt_layers: 'promptLayers', model_adapters: 'modelAdapters',
    quality_score: 'qualityScore', version: 'version', reproducibility: 'reproducibility',
    scene_id: 'sceneId', location: 'location',
    time: 'time', atmosphere: 'atmosphere', result: 'result',
    review_status: 'reviewStatus', review_notes: 'reviewNotes',
    continuity_mode: 'continuityMode', continuity_source_storyboard_id: 'continuitySourceStoryboardId',
    motion_preset_override: 'motionPresetOverride',
    bgm_prompt: 'bgmPrompt', sound_effect: 'soundEffect',
    first_frame_image: 'firstFrameImage', last_frame_image: 'lastFrameImage',
    composed_image: 'composedImage', video_url: 'videoUrl',
    composed_video_url: 'composedVideoUrl', tts_audio_url: 'ttsAudioUrl',
    subtitle_url: 'subtitleUrl', status: 'status',
  }

  const updates: Record<string, any> = { updatedAt: now() }
  for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
    if (snakeKey in body) updates[camelKey] = body[snakeKey]
  }

  if ('image_prompt' in body) updates.imagePrompt = sanitizeVisualPrompt(body.image_prompt)
  if ('video_prompt' in body) updates.videoPrompt = sanitizeVisualPrompt(body.video_prompt)
  if ('negative_prompt' in body) updates.negativePrompt = sanitizeSupportPrompt(body.negative_prompt)
  if ('prompt_layers' in body) updates.promptLayers = typeof body.prompt_layers === 'string' ? body.prompt_layers : JSON.stringify(body.prompt_layers || {})
  if ('model_adapters' in body) updates.modelAdapters = typeof body.model_adapters === 'string' ? body.model_adapters : JSON.stringify(body.model_adapters || [])
  if ('reproducibility' in body) updates.reproducibility = typeof body.reproducibility === 'string' ? body.reproducibility : JSON.stringify(body.reproducibility || {})
  if ('bgm_prompt' in body) updates.bgmPrompt = sanitizeSupportPrompt(body.bgm_prompt)
  if ('sound_effect' in body) updates.soundEffect = sanitizeSupportPrompt(body.sound_effect)
  if ('review_status' in body) updates.reviewStatus = normalizeStoryboardReviewStatus(body.review_status)
  if ('review_notes' in body) updates.reviewNotes = String(body.review_notes || '').trim() || null
  if ('continuity_mode' in body) updates.continuityMode = normalizeStoryboardContinuityMode(body.continuity_mode)
  if ('continuity_source_storyboard_id' in body) {
    const sourceId = Number(body.continuity_source_storyboard_id || 0)
    if (sourceId > 0) {
      const [sourceStoryboard] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, sourceId)).all()
      if (!sourceStoryboard || Number(sourceStoryboard.episodeId) !== Number(storyboard.episodeId)) {
        return badRequest(c, 'continuity_source_storyboard_id deve pertencer ao episodio atual')
      }
      updates.continuitySourceStoryboardId = sourceId
    } else {
      updates.continuitySourceStoryboardId = null
    }
    updates.generationSpec = null
  }

  if ('dialogue' in body) {
    updates.ttsAudioUrl = null
    updates.subtitleUrl = null
  }

  if ('continuity_mode' in body || 'first_frame_image' in body || 'last_frame_image' in body || 'composed_image' in body) {
    updates.generationSpec = null
  }

  validateStoryboardBindings(
    storyboard.episodeId,
    'scene_id' in body ? body.scene_id : storyboard.sceneId,
    'character_ids' in body ? body.character_ids : getStoryboardCharacterIds(id),
  )

  db.update(schema.storyboards).set(updates).where(eq(schema.storyboards.id, id)).run()
  if ('character_ids' in body) syncStoryboardCharacters(id, body.character_ids || [])
  logTaskSuccess('StoryboardAPI', 'update', {
    storyboardId: id,
    updatedFields: Object.keys(updates),
    characterIds: body.character_ids,
  })
  return success(c)
})

// POST /storyboards/:id/generate-tts
app.post('/:id/generate-tts', async (c) => {
  const id = Number(c.req.param('id'))
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).all()
  if (!sb) return badRequest(c, 'Take não existe')
  const parsedDialogue = parseDialogueForTTS(getStoryboardSpokenDialogue(sb))
  if (parsedDialogue.ignorable) return badRequest(c, 'Esta tomada não tem diálogos ou narração para gerar')
  logTaskStart('StoryboardAPI', 'generate-tts', {
    storyboardId: id,
    episodeId: sb.episodeId,
    dialoguePreview: (sb.dialogue || '').slice(0, 40),
  })
  logTaskPayload('StoryboardAPI', 'generate-tts input', {
    storyboardId: id,
    episodeId: sb.episodeId,
    dialogue: sb.dialogue,
  })

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
  const audioProvider = getAudioConfigById(ep?.audioConfigId ?? null)?.provider || null
  const speaker = parsedDialogue.speaker
  const linkedCharacterIds = getStoryboardCharacterIds(id)
  const chars = ep
    ? db.select().from(schema.characters).where(eq(schema.characters.dramaId, ep.dramaId)).all()
    : []
  const linkedCharacters = chars.filter((char) => linkedCharacterIds.includes(char.id))
  const { voiceId, source: voiceSource } = resolveStoryboardVoiceSelection({
    provider: audioProvider,
    speaker,
    linkedCharacters,
    allCharacters: chars,
  })

  const pureDialogue = parsedDialogue.pureText
  if (!pureDialogue) return badRequest(c, 'Nenhum texto foi extraído para síntese')
  const workflowJob = createWorkflowJob({
    kind: 'tts_generate',
    relatedEntityType: 'storyboard',
    relatedEntityId: id,
    dramaId: ep?.dramaId ?? null,
    episodeId: sb.episodeId,
    inputSummary: pureDialogue.slice(0, 120),
    metadata: { voiceId, speaker, voiceSource },
  })

  try {
    startWorkflowJob(Number(workflowJob?.id), { provider: audioProvider || undefined, model: getAudioConfigById(ep?.audioConfigId || null)?.model || undefined })
    const audioPath = await generateTTS({ text: pureDialogue, voice: voiceId, configId: ep?.audioConfigId || null, workflowJobId: Number(workflowJob?.id) })
  db.update(schema.storyboards)
    .set({ ttsAudioUrl: audioPath, updatedAt: now() })
    .where(eq(schema.storyboards.id, id))
    .run()
    completeWorkflowJob(Number(workflowJob?.id), { outputSummary: audioPath, metadata: { storyboardId: id, voiceId } })

    logTaskSuccess('StoryboardAPI', 'generate-tts', {
      storyboardId: id,
      voiceId,
      voiceSource,
      path: audioPath,
      textLength: pureDialogue.length,
    })
    return success(c, {
      tts_audio_url: audioPath,
      voice_id: voiceId,
      text: pureDialogue,
      workflow_job_id: Number(workflowJob?.id),
      status: 'completed',
      validation: validateStoryboardForTTS(id),
    })
  } catch (err: any) {
    logTaskError('StoryboardAPI', 'generate-tts', { storyboardId: id, voiceId, error: err.message })
    failWorkflowJob(Number(workflowJob?.id), err.message, { metadata: { storyboardId: id, voiceId } })
    return badRequest(c, err.message)
  }
})

// DELETE /storyboards/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  logTaskStart('StoryboardAPI', 'delete', { storyboardId: id })
  db.delete(schema.storyboardCharacters).where(eq(schema.storyboardCharacters.storyboardId, id)).run()
  db.delete(schema.storyboards).where(eq(schema.storyboards.id, id)).run()
  logTaskSuccess('StoryboardAPI', 'delete', { storyboardId: id })
  return success(c)
})

export default app
