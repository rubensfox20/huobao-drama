
import { Hono } from 'hono'
import { timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now, serverError, unauthorized } from '../utils/response.js'
import { downloadFile } from '../utils/storage.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { completeWorkflowJob, failWorkflowJob } from '../services/workflow-jobs.js'
import { isProductionRuntime } from '../middleware/admin-auth.js'

const app = new Hono()

// POST /webhooks/vidu

function resolveWebhookToken() {
  return String(process.env.HUOBAO_WEBHOOK_TOKEN || process.env.VIDU_WEBHOOK_TOKEN || '').trim()
}

function getProvidedWebhookToken(request: Request, queryToken?: string) {
  const authHeader = request.headers.get('authorization') || ''
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim()
  }

  return request.headers.get('x-huobao-webhook-token')?.trim()
    || request.headers.get('x-webhook-token')?.trim()
    || request.headers.get('x-vidu-webhook-token')?.trim()
    || String(queryToken || '').trim()
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

app.use('*', async (c, next) => {
  const expectedToken = resolveWebhookToken()
  if (!expectedToken) {
    if (isProductionRuntime()) {
      return serverError(c, 'webhook auth is not configured')
    }
    await next()
    return
  }

  const providedToken = getProvidedWebhookToken(c.req.raw, c.req.query('token'))
  if (!providedToken || !constantTimeEquals(providedToken, expectedToken)) {
    return unauthorized(c, 'webhook authorization required')
  }

  await next()
})

app.post('/vidu', async (c) => {
  const body = await c.req.json()
  const { task_id, state, video_url, error } = body
  logTaskProgress('Webhook', 'vidu-callback', {
    taskId: task_id,
    state,
    hasVideoUrl: !!video_url,
    error,
  })

  if (!task_id) {
    logTaskWarn('Webhook', 'vidu-callback-missing-task-id', { state })
    return badRequest(c, 'Missing task_id')
  }


  const rows = db.select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.taskId, task_id))
    .all()

  if (rows.length === 0) {

    logTaskWarn('Webhook', 'vidu-task-not-found', { taskId: task_id })
    return success(c, { message: 'Task not found' })
  }

  const record = rows[0]
  const workflowJobId = Number(record.workflowJobId || 0)

  if (state === 'success' && video_url) {
    try {
      const localPath = await downloadFile(video_url, 'videos')
      const ts = now()
      db.update(schema.videoGenerations)
        .set({
          videoUrl: video_url,
          localPath,
          status: 'completed',
          updatedAt: ts,
          completedAt: ts,
        })
        .where(eq(schema.videoGenerations.id, record.id))
        .run()


      if (record.storyboardId) {
        db.update(schema.storyboards)
          .set({ videoUrl: localPath, updatedAt: ts })
          .where(eq(schema.storyboards.id, record.storyboardId))
          .run()
      }

      if (workflowJobId) {
        completeWorkflowJob(workflowJobId, {
          outputSummary: `video_generation:${record.id}`,
          metadata: { provider: 'vidu', taskId: task_id, source: 'webhook' },
        })
      }

      logTaskSuccess('Webhook', 'vidu-video-updated', {
        taskId: task_id,
        generationId: record.id,
        storyboardId: record.storyboardId,
        localPath,
      })
      return success(c, { message: 'Video updated successfully' })
    } catch (err: any) {
      logTaskError('Webhook', 'vidu-download-failed', { taskId: task_id, generationId: record.id, error: err.message })
      const ts = now()
      db.update(schema.videoGenerations)
        .set({ status: 'failed', errorMsg: `Webhook download failed: ${err.message}`, completedAt: ts, updatedAt: ts })
        .where(eq(schema.videoGenerations.id, record.id))
        .run()
      if (workflowJobId) {
        failWorkflowJob(workflowJobId, `Webhook download failed: ${err.message}`, {
          metadata: { provider: 'vidu', taskId: task_id, source: 'webhook' },
        })
      }
      return badRequest(c, err.message)
    }
  }

  if (state === 'failed') {
    logTaskError('Webhook', 'vidu-generation-failed', { taskId: task_id, generationId: record.id, error: error || 'Vidu generation failed' })
    const ts = now()
    db.update(schema.videoGenerations)
      .set({
        status: 'failed',
        errorMsg: error || 'Vidu generation failed',
        completedAt: ts,
        updatedAt: ts,
      })
      .where(eq(schema.videoGenerations.id, record.id))
      .run()
    if (workflowJobId) {
      failWorkflowJob(workflowJobId, error || 'Vidu generation failed', {
        metadata: { provider: 'vidu', taskId: task_id, source: 'webhook' },
      })
    }
    return success(c, { message: 'Error recorded' })
  }


  logTaskProgress('Webhook', 'vidu-status-noted', { taskId: task_id, generationId: record.id, state })
  return success(c, { message: 'Status noted' })
})

export default app
