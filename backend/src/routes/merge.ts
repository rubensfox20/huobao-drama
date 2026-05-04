import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest } from '../utils/response.js'
import { mergeDramaVideos, mergeEpisodeVideos } from '../services/ffmpeg-merge.js'
import { toSnakeCase } from '../utils/transform.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { createWorkflowJob, failWorkflowJob } from '../services/workflow-jobs.js'
import { validateEpisodeForMerge } from '../services/pipeline-validation.js'
import { getLatestMergeForDrama, getLatestMergeForEpisode } from '../services/merge-status.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())


app.post('/episodes/:id/merge', async (c) => {
  const episodeId = Number(c.req.param('id'))
  let body: Record<string, any> = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return badRequest(c, 'Episode not found')
  const validation = validateEpisodeForMerge(episodeId)
  if (validation.some(issue => issue.severity === 'error')) return badRequest(c, validation.map(issue => issue.message).join(' | '))
  const workflowJob = createWorkflowJob({
    kind: 'merge_episode',
    relatedEntityType: 'episode',
    relatedEntityId: episodeId,
    episodeId,
    dramaId: ep.dramaId,
    inputSummary: `merge:${episodeId}`,
  })

  try {
    logTaskStart('MergeAPI', 'episode-merge', { episodeId, dramaId: ep.dramaId })
    const mergeId = await mergeEpisodeVideos(episodeId, ep.dramaId, Number(workflowJob?.id), {
      transition: body.transition,
    })
    logTaskSuccess('MergeAPI', 'episode-merge', { episodeId, mergeId })
    return success(c, { merge_id: mergeId, workflow_job_id: Number(workflowJob?.id), status: 'processing', validation })
  } catch (err: any) {
    logTaskError('MergeAPI', 'episode-merge', { episodeId, error: err.message })
    failWorkflowJob(Number(workflowJob?.id), err.message, { metadata: { episodeId } })
    return badRequest(c, err.message)
  }
})


app.get('/episodes/:id/merge', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const latest = getLatestMergeForEpisode(episodeId)
  if (!latest) return success(c, null)

  return success(c, toSnakeCase(latest))
})

app.post('/dramas/:id/merge', async (c) => {
  const dramaId = Number(c.req.param('id'))
  let body: Record<string, any> = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all()
  if (!drama) return badRequest(c, 'Drama not found')

  const readyEpisodes = db.select().from(schema.episodes)
    .where(eq(schema.episodes.dramaId, dramaId))
    .all()
    .filter((episode) => !episode.deletedAt && !!episode.videoUrl)

  if (readyEpisodes.length < 2) {
    return badRequest(c, 'At least 2 finalized episodes are required to build the drama compilation')
  }

  const workflowJob = createWorkflowJob({
    kind: 'merge_drama',
    relatedEntityType: 'drama',
    relatedEntityId: dramaId,
    dramaId,
    inputSummary: `merge-drama:${dramaId}`,
  })

  try {
    logTaskStart('MergeAPI', 'drama-merge', { dramaId, readyEpisodes: readyEpisodes.length })
    const mergeId = await mergeDramaVideos(dramaId, Number(workflowJob?.id), {
      transition: body.transition,
    })
    logTaskSuccess('MergeAPI', 'drama-merge', { dramaId, mergeId })
    return success(c, {
      merge_id: mergeId,
      workflow_job_id: Number(workflowJob?.id),
      status: 'processing',
      episode_count: readyEpisodes.length,
    })
  } catch (err: any) {
    logTaskError('MergeAPI', 'drama-merge', { dramaId, error: err.message })
    failWorkflowJob(Number(workflowJob?.id), err.message, { metadata: { dramaId } })
    return badRequest(c, err.message)
  }
})

app.get('/dramas/:id/merge', async (c) => {
  const dramaId = Number(c.req.param('id'))
  const latest = getLatestMergeForDrama(dramaId)
  if (!latest) return success(c, null)
  return success(c, toSnakeCase(latest))
})

export default app
