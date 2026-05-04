import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest, now } from '../utils/response.js'
import { generateImage } from '../services/image-generation.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { validateVisualPrompt } from '../services/pipeline-validation.js'
import { prepareVisualImageRequest } from '../services/visual-identity.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

// POST /scenes
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  const res = db.insert(schema.scenes).values({
    dramaId: body.drama_id,
    episodeId: body.episode_id,
    location: body.location,
    time: body.time || '',
    prompt: body.prompt || body.location,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const [result] = db.select().from(schema.scenes)
    .where(eq(schema.scenes.id, Number(res.lastInsertRowid))).all()
  return created(c, result)
})

// PUT /scenes/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  const fieldMap: Record<string, string> = {
    location: 'location',
    time: 'time',
    prompt: 'prompt',
    image_url: 'imageUrl',
    local_path: 'localPath',
    status: 'status',
  }

  for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
    if (snakeKey in body) updates[camelKey] = body[snakeKey]
    else if (camelKey in body) updates[camelKey] = body[camelKey]
  }

  db.update(schema.scenes).set(updates).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

// POST /scenes/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [scene] = db.select().from(schema.scenes).where(eq(schema.scenes.id, id)).all()
  if (!scene) return badRequest(c, 'Scene not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')

  try {
    logTaskStart('SceneImage', 'generate', { sceneId: id, episodeId: ep.id, dramaId: scene.dramaId, location: scene.location })
    db.update(schema.scenes).set({ status: 'processing', updatedAt: now() }).where(eq(schema.scenes.id, id)).run()
    const prepared = prepareVisualImageRequest({
      sceneId: id,
      episodeId: ep.id,
      prompt: '',
      frameType: 'scene_environment',
      referenceImages: Array.isArray(body.reference_images) ? body.reference_images : [],
    })
    const validation = validateVisualPrompt(prepared.prompt, 'image_prompt')
    const generation = await generateImage({
      sceneId: id,
      dramaId: scene.dramaId,
      episodeId: ep.id,
      prompt: prepared.prompt,
      referenceImages: prepared.referenceImages,
      seed: prepared.seed,
      configId: ep.imageConfigId ?? undefined,
    })
    logTaskSuccess('SceneImage', 'generate', { sceneId: id, generationId: generation.id, workflowJobId: generation.workflowJobId })
    return success(c, {
      image_generation_id: generation.id,
      workflow_job_id: generation.workflowJobId,
      status: generation.cacheHit ? 'completed' : 'processing',
      validation,
      cache_hit: generation.cacheHit,
    })
  } catch (err: any) {
    logTaskError('SceneImage', 'generate', { sceneId: id, error: err.message })
    db.update(schema.scenes).set({ status: 'failed', updatedAt: now() }).where(eq(schema.scenes.id, id)).run()
    return badRequest(c, err.message)
  }
})

// DELETE /scenes/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.delete(schema.scenes).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

export default app
