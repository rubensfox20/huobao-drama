import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { generateVoiceSample } from '../services/tts-generation.js'
import { generateImage } from '../services/image-generation.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { completeWorkflowJob, createWorkflowJob, failWorkflowJob, startWorkflowJob } from '../services/workflow-jobs.js'
import { validateVisualPrompt } from '../services/pipeline-validation.js'
import { invalidateCharacterVoiceOutputs } from '../services/voice-invalidation.js'
import { prepareVisualImageRequest } from '../services/visual-identity.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

// PUT /characters/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  for (const key of ['name', 'role', 'description', 'appearance', 'personality', 'voiceStyle', 'voiceProvider', 'imageUrl', 'localPath']) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    if (snakeKey in body) updates[key] = body[snakeKey]
    else if (key in body) updates[key] = body[key]
  }
  if ('voice_style' in body || 'voiceStyle' in body) {
    updates.voiceSampleUrl = null
  }
  db.update(schema.characters).set(updates).where(eq(schema.characters.id, id)).run()
  if ('voice_style' in body || 'voiceStyle' in body) {
    invalidateCharacterVoiceOutputs(id)
  }
  return success(c)
})

// DELETE /characters/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.update(schema.characters).set({ deletedAt: now() }).where(eq(schema.characters.id, id)).run()
  return success(c)
})


app.post('/:id/generate-voice-sample', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')
  if (!char.voiceStyle) return badRequest(c, 'Atribua uma voz primeiro')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')
  const workflowJob = createWorkflowJob({
    kind: 'voice_sample_generate',
    relatedEntityType: 'character',
    relatedEntityId: id,
    dramaId: char.dramaId,
    episodeId: ep.id,
    inputSummary: char.name,
    metadata: { voiceStyle: char.voiceStyle },
  })

  try {
    logTaskStart('VoiceSample', 'generate', { characterId: id, characterName: char.name, episodeId: ep.id, voice: char.voiceStyle })
    startWorkflowJob(Number(workflowJob?.id), { provider: char.voiceProvider || undefined })
    const audioPath = await generateVoiceSample(char.name, char.voiceStyle, ep.audioConfigId ?? undefined, Number(workflowJob?.id))
    db.update(schema.characters)
      .set({ voiceSampleUrl: audioPath, updatedAt: now() })
      .where(eq(schema.characters.id, id)).run()
    completeWorkflowJob(Number(workflowJob?.id), { outputSummary: audioPath, metadata: { voiceSampleUrl: audioPath } })
    logTaskSuccess('VoiceSample', 'generate', { characterId: id, path: audioPath })
    return success(c, { voice_sample_url: audioPath, workflow_job_id: Number(workflowJob?.id), status: 'completed' })
  } catch (err: any) {
    logTaskError('VoiceSample', 'generate', { characterId: id, error: err.message })
    failWorkflowJob(Number(workflowJob?.id), err.message)
    return badRequest(c, `Falha ao gerar TTS: ${err.message}`)
  }
})

// POST /characters/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')

  try {
    logTaskStart('CharacterImage', 'generate', { characterId: id, episodeId: ep.id, dramaId: char.dramaId })
    const prepared = prepareVisualImageRequest({
      characterId: id,
      episodeId: ep.id,
      prompt: String(body.prompt || '').trim(),
      frameType: 'character_portrait',
      referenceImages: Array.isArray(body.reference_images) ? body.reference_images : [],
    })
    const validation = validateVisualPrompt(prepared.prompt, 'image_prompt')
    const generation = await generateImage({
      characterId: id,
      dramaId: char.dramaId,
      episodeId: ep.id,
      prompt: prepared.prompt,
      referenceImages: prepared.referenceImages,
      seed: prepared.seed,
      configId: ep.imageConfigId ?? undefined,
    })
    logTaskSuccess('CharacterImage', 'generate', { characterId: id, generationId: generation.id, workflowJobId: generation.workflowJobId })
    return success(c, {
      image_generation_id: generation.id,
      workflow_job_id: generation.workflowJobId,
      status: generation.cacheHit ? 'completed' : 'processing',
      validation,
      cache_hit: generation.cacheHit,
    })
  } catch (err: any) {
    logTaskError('CharacterImage', 'generate', { characterId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /characters/batch-generate-images
app.post('/batch-generate-images', async (c) => {
  const body = await c.req.json()
  const items = Array.isArray(body.items) ? body.items : []
  const ids: number[] = body.character_ids || items.map((item: any) => Number(item?.id || 0)).filter(Boolean)
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')
  const results: number[] = []
  for (const cid of ids) {
    const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, cid)).all()
    if (!char) continue
    const item = items.find((entry: any) => Number(entry?.id || 0) === cid)
    try {
      const prepared = prepareVisualImageRequest({
        characterId: cid,
        episodeId: ep.id,
        prompt: String(item?.prompt || '').trim(),
        frameType: 'character_portrait',
        referenceImages: Array.isArray(item?.reference_images) ? item.reference_images : [],
      })
      const generation = await generateImage({
        characterId: cid,
        dramaId: char.dramaId,
        episodeId: ep.id,
        prompt: prepared.prompt,
        referenceImages: prepared.referenceImages,
        seed: prepared.seed,
        configId: ep.imageConfigId ?? undefined,
      })
      results.push(generation.id)
    } catch {}
  }
  logTaskSuccess('CharacterImage', 'batch-generate', { episodeId: ep.id, requested: ids.length, started: results.length })
  return success(c, { count: results.length, ids: results })
})

export default app
