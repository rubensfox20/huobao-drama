import { Hono } from 'hono'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest } from '../utils/response.js'
import { generateVideo } from '../services/video-generation.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { validateVisualPrompt } from '../services/pipeline-validation.js'
import { sanitizeVisualPrompt } from '../services/storyboard-prompts.js'
import { prepareStoryboardVideoRequest } from '../services/visual-identity.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'
import { parseQuery, z } from '../utils/validation.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

const listVideosQuerySchema = z.object({
  storyboard_id: z.coerce.number().int().positive().optional(),
  drama_id: z.coerce.number().int().positive().optional(),
  status: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(200).optional().default(50),
})

// POST /videos — Generate video
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.prompt && !body.storyboard_id) return badRequest(c, 'prompt is required when no storyboard_id is provided')

  try {
    let configId: number | undefined = body.config_id
    let episodeId: number | undefined = body.episode_id ? Number(body.episode_id) : undefined
    let preparedPrompt = sanitizeVisualPrompt(body.prompt || '')
    let preparedReferenceMode = body.reference_mode
    let preparedImageUrl = body.image_url
    let preparedFirstFrameUrl = body.first_frame_url
    let preparedLastFrameUrl = body.last_frame_url
    let preparedReferenceImageUrls = Array.isArray(body.reference_image_urls) ? body.reference_image_urls : undefined

    if (body.storyboard_id) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all()
      if (sb) {
        episodeId = sb.episodeId
        const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
        if (ep?.videoConfigId != null) configId = ep.videoConfigId
      }

      const prepared = prepareStoryboardVideoRequest({
        storyboardId: Number(body.storyboard_id),
        prompt: body.prompt,
        referenceMode: body.reference_mode,
        imageUrl: body.image_url,
        firstFrameUrl: body.first_frame_url,
        lastFrameUrl: body.last_frame_url,
        referenceImageUrls: Array.isArray(body.reference_image_urls) ? body.reference_image_urls : [],
      })
      preparedPrompt = prepared.prompt
      preparedReferenceMode = prepared.referenceMode
      preparedImageUrl = prepared.imageUrl
      preparedFirstFrameUrl = prepared.firstFrameUrl
      preparedLastFrameUrl = prepared.lastFrameUrl
      preparedReferenceImageUrls = prepared.referenceImageUrls
    }

    logTaskStart('VideoAPI', 'generate', {
      storyboardId: body.storyboard_id,
      dramaId: body.drama_id,
      referenceMode: preparedReferenceMode,
      duration: body.duration,
    })
    logTaskPayload('VideoAPI', 'request body', body)
    const validation = validateVisualPrompt(preparedPrompt, 'video_prompt')
    const generation = await generateVideo({
      storyboardId: body.storyboard_id,
      dramaId: body.drama_id,
      episodeId,
      prompt: preparedPrompt,
      model: body.model,
      referenceMode: preparedReferenceMode,
      imageUrl: preparedImageUrl,
      firstFrameUrl: preparedFirstFrameUrl,
      lastFrameUrl: preparedLastFrameUrl,
      referenceImageUrls: preparedReferenceImageUrls,
      duration: body.duration,
      aspectRatio: body.aspect_ratio,
      configId,
    })

    const [record] = db.select().from(schema.videoGenerations)
      .where(eq(schema.videoGenerations.id, generation.id)).all()
    logTaskSuccess('VideoAPI', 'generate', { generationId: generation.id, provider: record?.provider, workflowJobId: generation.workflowJobId })
    return created(c, {
      ...record,
      workflow_job_id: generation.workflowJobId,
      status: record?.status || 'processing',
      validation,
      cache_hit: generation.cacheHit,
    })
  } catch (err: any) {
    logTaskError('VideoAPI', 'generate', { error: err.message })
    return badRequest(c, err.message)
  }
})

// GET /videos/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = db.select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.id, id)).all()
  return success(c, row || null)
})

// GET /videos — List by storyboard_id or drama_id
app.get('/', async (c) => {
  const parsed = parseQuery(c, listVideosQuerySchema)
  if (!parsed.ok) return parsed.response

  const { storyboard_id: storyboardId, drama_id: dramaId, status, page, page_size: pageSize } = parsed.data
  const offset = (page - 1) * pageSize
  const conditions: any[] = []

  if (storyboardId) conditions.push(eq(schema.videoGenerations.storyboardId, storyboardId))
  if (dramaId) conditions.push(eq(schema.videoGenerations.dramaId, dramaId))
  if (status) conditions.push(eq(schema.videoGenerations.status, status))

  const whereClause = conditions.length ? and(...conditions) : undefined
  const [countRow] = whereClause
    ? db.select({ count: sql<number>`count(*)` })
      .from(schema.videoGenerations)
      .where(whereClause)
      .all()
    : db.select({ count: sql<number>`count(*)` })
      .from(schema.videoGenerations)
      .all()

  const rows = whereClause
    ? db.select().from(schema.videoGenerations)
      .where(whereClause)
      .orderBy(desc(schema.videoGenerations.id))
      .limit(pageSize)
      .offset(offset)
      .all()
    : db.select().from(schema.videoGenerations)
      .orderBy(desc(schema.videoGenerations.id))
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

// DELETE /videos/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.delete(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).run()
  return success(c)
})

export default app
