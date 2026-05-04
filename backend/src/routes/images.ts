import { Hono } from 'hono'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now, badRequest } from '../utils/response.js'
import { generateImage } from '../services/image-generation.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { validateVisualPrompt } from '../services/pipeline-validation.js'
import { sanitizeVisualPrompt } from '../services/storyboard-prompts.js'
import { prepareVisualImageRequest } from '../services/visual-identity.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'
import { parseQuery, z } from '../utils/validation.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

const listImagesQuerySchema = z.object({
  storyboard_id: z.coerce.number().int().positive().optional(),
  drama_id: z.coerce.number().int().positive().optional(),
  status: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(200).optional().default(50),
})

// POST /images — Generate image
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.prompt && !body.storyboard_id && !body.scene_id && !body.character_id) {
    return badRequest(c, 'prompt is required when no storyboard_id, scene_id, or character_id is provided')
  }

  try {
    let configId: number | undefined = body.config_id
    let episodeId: number | undefined = body.episode_id ? Number(body.episode_id) : undefined
    if (body.storyboard_id) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all()
      if (sb) {
        episodeId = sb.episodeId
        const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
        if (ep?.imageConfigId != null) configId = ep.imageConfigId
      }
    }

    logTaskStart('ImageAPI', 'generate', {
      storyboardId: body.storyboard_id,
      sceneId: body.scene_id,
      characterId: body.character_id,
      dramaId: body.drama_id,
      frameType: body.frame_type,
    })
    logTaskPayload('ImageAPI', 'request body', body)
    const prepared = prepareVisualImageRequest({
      storyboardId: body.storyboard_id ? Number(body.storyboard_id) : undefined,
      sceneId: body.scene_id ? Number(body.scene_id) : undefined,
      characterId: body.character_id ? Number(body.character_id) : undefined,
      episodeId,
      prompt: body.prompt ? sanitizeVisualPrompt(body.prompt) : '',
      frameType: body.frame_type,
      referenceImages: Array.isArray(body.reference_images) ? body.reference_images : [],
    })
    const validation = validateVisualPrompt(prepared.prompt, 'image_prompt')
    const generation = await generateImage({
      storyboardId: body.storyboard_id,
      dramaId: body.drama_id,
      episodeId,
      sceneId: body.scene_id,
      characterId: body.character_id,
      prompt: prepared.prompt,
      model: body.model,
      size: body.size,
      seed: prepared.seed,
      referenceImages: prepared.referenceImages,
      frameType: body.frame_type,
      configId,
    })

    const [record] = db.select().from(schema.imageGenerations)
      .where(eq(schema.imageGenerations.id, generation.id)).all()
    logTaskSuccess('ImageAPI', 'generate', { generationId: generation.id, provider: record?.provider, workflowJobId: generation.workflowJobId })
    return created(c, {
      ...record,
      workflow_job_id: generation.workflowJobId,
      status: record?.status || 'processing',
      validation,
      cache_hit: generation.cacheHit,
    })
  } catch (err: any) {
    logTaskError('ImageAPI', 'generate', { error: err.message })
    return badRequest(c, err.message)
  }
})

// GET /images/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.id, id)).all()
  return success(c, row || null)
})

// GET /images — List by storyboard_id or drama_id
app.get('/', async (c) => {
  const parsed = parseQuery(c, listImagesQuerySchema)
  if (!parsed.ok) return parsed.response

  const { storyboard_id: storyboardId, drama_id: dramaId, status, page, page_size: pageSize } = parsed.data
  const offset = (page - 1) * pageSize
  const conditions: any[] = []

  if (storyboardId) conditions.push(eq(schema.imageGenerations.storyboardId, storyboardId))
  if (dramaId) conditions.push(eq(schema.imageGenerations.dramaId, dramaId))
  if (status) conditions.push(eq(schema.imageGenerations.status, status))

  const whereClause = conditions.length ? and(...conditions) : undefined
  const [countRow] = whereClause
    ? db.select({ count: sql<number>`count(*)` })
      .from(schema.imageGenerations)
      .where(whereClause)
      .all()
    : db.select({ count: sql<number>`count(*)` })
      .from(schema.imageGenerations)
      .all()

  const rows = whereClause
    ? db.select().from(schema.imageGenerations)
      .where(whereClause)
      .orderBy(desc(schema.imageGenerations.id))
      .limit(pageSize)
      .offset(offset)
      .all()
    : db.select().from(schema.imageGenerations)
      .orderBy(desc(schema.imageGenerations.id))
      .limit(pageSize)
      .offset(offset)
      .all()

  const total = Number(countRow?.count || 0)
  return success(c, {
    items: rows,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  })
})

// DELETE /images/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.delete(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).run()
  return success(c)
})

export default app
