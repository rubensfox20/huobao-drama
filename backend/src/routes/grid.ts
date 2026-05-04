import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { generateImage } from '../services/image-generation.js'
import { splitGridImage } from '../services/grid-split.js'
import {
  buildGridCellPrompts,
  buildGridPrompt,
  buildReferenceLegend,
  collectGridReferenceAssets,
  getDramaStyle,
  getStoryboardsByIds,
  tryAgentGridPrompt,
} from '../services/grid-prompting.js'
import { logTaskError, logTaskPayload, logTaskProgress } from '../utils/task-logger.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

app.post('/prompt', async (c) => {
  const body = await c.req.json()
  const {
    storyboard_ids,
    drama_id,
    episode_id,
    rows,
    cols,
    mode = 'first_frame',
  } = body

  if (!storyboard_ids?.length) return badRequest(c, 'storyboard_ids required')
  if (!rows || !cols) return badRequest(c, 'rows and cols required')

  const storyboards = getStoryboardsByIds(storyboard_ids)
  if (!storyboards.length) return badRequest(c, 'No storyboards found')

  const resolvedEpisodeId = Number(episode_id || storyboards[0]?.episodeId || 0)
  if (!resolvedEpisodeId) return badRequest(c, 'episode_id required')

  const dramaStyle = getDramaStyle(Number(drama_id || 0))
  const referenceAssets = collectGridReferenceAssets(storyboards)
  const referenceLegend = buildReferenceLegend(referenceAssets)

  try {
    const agentPayload = await tryAgentGridPrompt(
      resolvedEpisodeId,
      Number(drama_id || 0),
      storyboard_ids,
      rows,
      cols,
      mode,
      referenceLegend,
    )

    if (agentPayload?.grid_prompt) {
      logTaskProgress('GridPrompt', 'agent-success', {
        episodeId: resolvedEpisodeId,
        dramaId: drama_id,
        mode,
        rows,
        cols,
        storyboardCount: storyboard_ids.length,
      })
      logTaskPayload('GridPrompt', 'agent-result', agentPayload)
      return success(c, {
        ...agentPayload,
        source: 'agent',
        grid: { rows, cols },
        storyboard_ids,
        mode,
      })
    }
  } catch (err: any) {
    logTaskError('GridPrompt', 'agent-failed', {
      episodeId: resolvedEpisodeId,
      dramaId: drama_id,
      error: err.message,
    })
  }

  const gridPrompt = buildGridPrompt(mode, storyboards, rows, cols, dramaStyle, referenceAssets)
  const cellPrompts = buildGridCellPrompts(mode, storyboards, rows, cols, referenceAssets)
  logTaskProgress('GridPrompt', 'fallback-used', {
    episodeId: resolvedEpisodeId,
    dramaId: drama_id,
    mode,
    rows,
    cols,
    storyboardCount: storyboard_ids.length,
  })

  return success(c, {
    grid_prompt: gridPrompt,
    cell_prompts: cellPrompts,
    source: 'fallback',
    grid: { rows, cols },
    storyboard_ids,
    mode,
  })
})

app.post('/generate', async (c) => {
  const body = await c.req.json()
  const {
    storyboard_ids,
    drama_id,
    rows,
    cols,
    mode = 'first_frame',
    custom_prompt,
  } = body

  if (!storyboard_ids?.length) return badRequest(c, 'storyboard_ids required')
  if (!rows || !cols) return badRequest(c, 'rows and cols required')

  const storyboards = getStoryboardsByIds(storyboard_ids)
  if (!storyboards.length) return badRequest(c, 'No storyboards found')

  const dramaStyle = getDramaStyle(Number(drama_id || 0))
  const referenceAssets = collectGridReferenceAssets(storyboards)
  const prompt = custom_prompt || buildGridPrompt(mode, storyboards, rows, cols, dramaStyle, referenceAssets)
  const referenceImages = referenceAssets.map(asset => asset.path)

  const cellWidth = 960
  const cellHeight = 540
  const size = `${cellWidth * cols}x${cellHeight * rows}`

  try {
    const generation = await generateImage({
      dramaId: drama_id,
      prompt,
      size,
      frameType: `grid_${mode}_${rows}x${cols}`,
      referenceImages,
    })

    logTaskProgress('GridGenerate', 'reference-images', {
      dramaId: drama_id,
      mode,
      rows,
      cols,
      referenceCount: referenceImages.length,
    })

    return success(c, {
      image_generation_id: generation.id,
      workflow_job_id: generation.workflowJobId,
      grid: { rows, cols },
      mode,
      storyboard_ids,
      prompt,
      reference_images: referenceImages,
      cache_hit: generation.cacheHit,
    })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

app.post('/split', async (c) => {
  const body = await c.req.json()
  const {
    image_generation_id,
    rows,
    cols,
    assignments,
  } = body

  if (!image_generation_id) return badRequest(c, 'image_generation_id required')
  if (!rows || !cols) return badRequest(c, 'rows and cols required')
  if (!assignments?.length) return badRequest(c, 'assignments required')

  const [imgRecord] = db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.id, image_generation_id))
    .all()

  if (!imgRecord) return badRequest(c, 'Image generation not found')
  if (imgRecord.status !== 'completed') return badRequest(c, `Image status: ${imgRecord.status}`)
  if (!imgRecord.localPath) return badRequest(c, 'No local image file')

  try {
    const cells = await splitGridImage(imgRecord.localPath, rows, cols)
    const results: any[] = []

    for (let index = 0; index < assignments.length && index < cells.length; index += 1) {
      const { storyboard_id, frame_type } = assignments[index]
      const cell = cells[index]
      if (!storyboard_id) continue

      const update: Record<string, any> = { updatedAt: now() }
      if (frame_type === 'first_frame') update.firstFrameImage = cell.localPath
      else if (frame_type === 'last_frame') update.lastFrameImage = cell.localPath
      else if (frame_type === 'reference') {
        const [storyboard] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboard_id)).all()
        const existing = storyboard?.referenceImages ? JSON.parse(storyboard.referenceImages) : []
        existing.push(cell.localPath)
        update.referenceImages = JSON.stringify(existing)
      }

      db.update(schema.storyboards).set(update).where(eq(schema.storyboards.id, storyboard_id)).run()
      results.push({ storyboard_id, frame_type, local_path: cell.localPath })
    }

    return success(c, { cells: results })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

app.get('/status/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.id, id))
    .all()

  if (!row) return badRequest(c, 'Not found')

  return success(c, {
    id: row.id,
    status: row.status,
    local_path: row.localPath,
    image_url: row.imageUrl,
    error_msg: row.errorMsg,
  })
})

export default app
