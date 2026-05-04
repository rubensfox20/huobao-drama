import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest } from '../utils/response.js'
import { composeStoryboard } from '../services/ffmpeg-compose.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { toSnakeCase } from '../utils/transform.js'
import { createWorkflowJob, startWorkflowJob, completeWorkflowJob, failWorkflowJob } from '../services/workflow-jobs.js'
import { validateEpisodeForCompose } from '../services/pipeline-validation.js'
import { hasStoryboardComposeSource } from '../services/storyboard-compose-source.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())


app.post('/storyboards/:id/compose', async (c) => {
  const id = Number(c.req.param('id'))
  const [storyboard] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).all()
  const [episode] = storyboard?.episodeId
    ? db.select().from(schema.episodes).where(eq(schema.episodes.id, storyboard.episodeId)).all()
    : []
  const workflowJob = createWorkflowJob({
    kind: 'compose_storyboard',
    relatedEntityType: 'storyboard',
    relatedEntityId: id,
    dramaId: episode?.dramaId ?? null,
    episodeId: storyboard?.episodeId ?? null,
    inputSummary: `storyboard:${id}`,
  })
  try {
    logTaskStart('ComposeAPI', 'single-compose', { storyboardId: id })
    startWorkflowJob(Number(workflowJob?.id))
    const composedUrl = await composeStoryboard(id)
    completeWorkflowJob(Number(workflowJob?.id), { outputSummary: composedUrl, metadata: { storyboardId: id } })
    logTaskSuccess('ComposeAPI', 'single-compose', { storyboardId: id, output: composedUrl })
    return success(c, { id, composed_video_url: composedUrl, workflow_job_id: Number(workflowJob?.id), status: 'completed' })
  } catch (err: any) {
    logTaskError('ComposeAPI', 'single-compose', { storyboardId: id, error: err.message })
    failWorkflowJob(Number(workflowJob?.id), err.message, { metadata: { storyboardId: id } })
    return badRequest(c, err.message)
  }
})


app.post('/episodes/:id/compose-all', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()
  const validation = validateEpisodeForCompose(episodeId)

  if (storyboards.length === 0) return badRequest(c, 'No storyboards found')
  if (validation.some(issue => issue.severity === 'error')) return badRequest(c, validation.map(issue => issue.message).join(' | '))

  const withComposeSource = storyboards.filter(hasStoryboardComposeSource)
  if (withComposeSource.length === 0) return badRequest(c, 'No storyboards have video or image yet')
  const workflowJob = createWorkflowJob({
    kind: 'compose_episode',
    relatedEntityType: 'episode',
    relatedEntityId: episodeId,
    dramaId: episode?.dramaId ?? null,
    episodeId,
    inputSummary: `compose:${withComposeSource.length}`,
  })
  startWorkflowJob(Number(workflowJob?.id))


  db.update(schema.storyboards)
    .set({ status: 'compose_processing' })
    .where(eq(schema.storyboards.episodeId, episodeId))
    .run()

  ;(async () => {
    for (const sb of withComposeSource) {
      try {
        await composeStoryboard(sb.id)
      } catch (err: any) {
        logTaskError('ComposeAPI', 'batch-item', { storyboardId: sb.id, episodeId, error: err.message })
      }
    }
    completeWorkflowJob(Number(workflowJob?.id), { outputSummary: `composed:${withComposeSource.length}`, metadata: { episodeId, total: withComposeSource.length } })
    logTaskSuccess('ComposeAPI', 'batch-compose', { episodeId, total: withComposeSource.length })
  })()

  logTaskStart('ComposeAPI', 'batch-compose', { episodeId, total: withComposeSource.length })
  return success(c, {
    message: `Started composing ${withComposeSource.length} storyboards`,
    total: withComposeSource.length,
    workflow_job_id: Number(workflowJob?.id),
    status: 'running',
    validation,
  })
})


app.get('/episodes/:id/compose-status', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()

  const withComposeSource = storyboards.filter(hasStoryboardComposeSource)
  const completed = withComposeSource.filter(sb => sb.status === 'compose_completed' && !!sb.composedVideoUrl)
  const failed = withComposeSource.filter(sb => sb.status === 'compose_failed')
  const processing = withComposeSource.filter(sb => sb.status === 'compose_processing')
  const idle = withComposeSource.filter(sb => !sb.status || !String(sb.status).startsWith('compose_'))

  return success(c, {
    total: withComposeSource.length,
    completed: completed.length,
    failed: failed.length,
    processing: processing.length,
    idle: idle.length,
    items: withComposeSource.map((sb) => toSnakeCase({
      id: sb.id,
      storyboardNumber: sb.storyboardNumber,
      status: sb.status || 'pending',
      composedVideoUrl: sb.composedVideoUrl,
      errorMsg: sb.status === 'compose_failed' ? 'Falha ao compor a tomada. Verifique a midia base, o TTS e a legenda.' : '',
    })),
  })
})

export default app
