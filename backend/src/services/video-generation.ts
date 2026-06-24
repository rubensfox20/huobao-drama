import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { getActiveConfig, getConfigById } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, readImageAsCompressedDataUrl, saveUploadedFile } from '../utils/storage.js'
import { getVideoAdapter } from './adapters/registry'
import type { AIConfig } from './adapters/types'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'
import { sanitizeVisualPrompt } from './storyboard-prompts.js'
import { buildAssetGenerationCacheKey, findAssetGenerationCacheByKey, touchAssetGenerationCache, upsertAssetGenerationCache } from './asset-generation-cache.js'
import { completeWorkflowJob, createWorkflowJob, failWorkflowJob, startWorkflowJob } from './workflow-jobs.js'
import { runProviderOperation } from './provider-execution.js'
import { ensureStoryboardVideoFrames } from './media-frames.js'

interface GenerateVideoParams {
  storyboardId?: number
  dramaId?: number
  episodeId?: number
  prompt: string
  model?: string
  referenceMode?: string
  imageUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[]
  duration?: number
  aspectRatio?: string
  configId?: number
  workflowJobId?: number
}

type VideoPollState = {
  taskId: string
  startedAt: number
}

const ACTIVE_VIDEO_POLLS_KEY = Symbol.for('huobao-drama.activeVideoPolls')
const VIDEO_POLL_INTERVAL_MS = readPositiveIntEnv('VIDEO_POLL_INTERVAL_MS', 10_000)
const VIDEO_POLL_MAX_DURATION_MS = readPositiveIntEnv('VIDEO_POLL_MAX_DURATION_MS', 30 * 60_000)
const VIDEO_POLL_FETCH_TIMEOUT_MS = readPositiveIntEnv('VIDEO_POLL_FETCH_TIMEOUT_MS', 30_000)

function getActiveVideoPolls() {
  const root = globalThis as typeof globalThis & {
    [ACTIVE_VIDEO_POLLS_KEY]?: Map<number, VideoPollState>
  }
  if (!root[ACTIVE_VIDEO_POLLS_KEY]) {
    root[ACTIVE_VIDEO_POLLS_KEY] = new Map()
  }
  return root[ACTIVE_VIDEO_POLLS_KEY]!
}

function readPositiveIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function generateVideo(params: GenerateVideoParams): Promise<{ id: number; workflowJobId: number; cacheHit: boolean }> {
  const ts = now()
  const sanitizedPrompt = sanitizeVisualPrompt(params.prompt)
  const resolvedEpisodeId = params.episodeId
    || (params.storyboardId
      ? db.select({ episodeId: schema.storyboards.episodeId }).from(schema.storyboards).where(eq(schema.storyboards.id, params.storyboardId)).all()[0]?.episodeId
      : undefined)
  const config = params.configId
    ? getConfigById(params.configId)
    : getActiveConfig('video')
  if (!config) throw new Error('No active video AI config')

  const workflowJob = params.workflowJobId
    ? { id: params.workflowJobId }
    : createWorkflowJob({
      kind: 'video_generate',
      relatedEntityType: params.storyboardId ? 'storyboard' : 'video_generation',
      relatedEntityId: params.storyboardId || null,
      dramaId: params.dramaId ?? null,
      episodeId: resolvedEpisodeId ?? null,
      provider: config.provider,
      model: params.model || config.model,
      inputSummary: sanitizedPrompt.slice(0, 200),
      metadata: {
        storyboardId: params.storyboardId,
        referenceMode: params.referenceMode || 'none',
        duration: params.duration || 5,
      },
    })
  const workflowJobId = Number(workflowJob?.id)
  startWorkflowJob(workflowJobId, { provider: config.provider, model: params.model || config.model })

  const cacheKey = buildAssetGenerationCacheKey({
    assetType: 'video',
    provider: config.provider || 'unknown',
    model: params.model || config.model || '',
    prompt: sanitizedPrompt,
    referenceMode: params.referenceMode || 'none',
    inputs: {
      storyboardId: params.storyboardId,
      imageUrl: params.imageUrl,
      firstFrameUrl: params.firstFrameUrl,
      lastFrameUrl: params.lastFrameUrl,
      referenceImageUrls: params.referenceImageUrls || [],
      duration: params.duration || 5,
      aspectRatio: params.aspectRatio || '16:9',
    },
  })
  const cacheHit = findAssetGenerationCacheByKey(cacheKey)
  if (cacheHit && cacheHit.status === 'completed' && (cacheHit.localPath || cacheHit.videoUrl)) {
    touchAssetGenerationCache(cacheHit.id)
    const cachedInsert = db.insert(schema.videoGenerations).values({
      storyboardId: params.storyboardId,
      dramaId: params.dramaId,
      prompt: sanitizedPrompt,
      model: params.model || config.model,
      provider: config.provider,
      referenceMode: params.referenceMode || 'none',
      imageUrl: params.imageUrl,
      firstFrameUrl: params.firstFrameUrl,
      lastFrameUrl: params.lastFrameUrl,
      referenceImageUrls: params.referenceImageUrls ? JSON.stringify(params.referenceImageUrls) : null,
      duration: params.duration || 5,
      aspectRatio: params.aspectRatio || '16:9',
      videoUrl: cacheHit.videoUrl,
      localPath: cacheHit.localPath,
      workflowJobId,
      status: 'completed',
      createdAt: ts,
      updatedAt: ts,
      completedAt: ts,
    }).run()
    const cachedId = Number(cachedInsert.lastInsertRowid)
    if (params.storyboardId) {
      db.update(schema.storyboards).set({
        videoUrl: cacheHit.localPath || cacheHit.videoUrl || null,
        duration: params.duration || 5,
        updatedAt: ts,
      }).where(eq(schema.storyboards.id, params.storyboardId)).run()
    }
    completeWorkflowJob(workflowJobId, {
      outputSummary: `cache-hit:${cachedId}`,
      metadata: { cacheHit: true, generationId: cachedId, cacheKey },
    })
    return { id: cachedId, workflowJobId, cacheHit: true }
  }

  const res = db.insert(schema.videoGenerations).values({
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    prompt: sanitizedPrompt,
    model: params.model || config.model,
    provider: config.provider,
    referenceMode: params.referenceMode || 'none',
    imageUrl: params.imageUrl,
    firstFrameUrl: params.firstFrameUrl,
    lastFrameUrl: params.lastFrameUrl,
    referenceImageUrls: params.referenceImageUrls ? JSON.stringify(params.referenceImageUrls) : null,
    duration: params.duration || 5,
    aspectRatio: params.aspectRatio || '16:9',
    workflowJobId,
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const lastId = Number(res.lastInsertRowid)
  logTaskStart('VideoTask', 'enqueue', {
    id: lastId,
    provider: config.provider,
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    referenceMode: params.referenceMode || 'none',
    duration: params.duration || 5,
    workflowJobId,
  })
  logTaskPayload('VideoTask', 'enqueue params', {
    id: lastId,
    workflowJobId,
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    params,
  })

  if (params.storyboardId && sanitizedPrompt !== String(params.prompt || '').trim()) {
    const [storyboard] = db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.id, params.storyboardId)).all()
    if (storyboard && String(storyboard.videoPrompt || '').trim() === String(params.prompt || '').trim()) {
      db.update(schema.storyboards)
        .set({ videoPrompt: sanitizedPrompt, updatedAt: now() })
        .where(eq(schema.storyboards.id, params.storyboardId))
        .run()
    }
  }

  processVideoGeneration(lastId, config, workflowJobId, cacheKey).catch(err => {
    logTaskError('VideoTask', 'process', { id: lastId, error: err.message })
    console.error(`Video generation ${lastId} failed:`, err)
  })
  return { id: lastId, workflowJobId, cacheHit: false }
}

async function processVideoGeneration(id: number, config: AIConfig, workflowJobId: number, cacheKey: string) {
  const adapter = getVideoAdapter(config.provider)

  try {
    const rows = db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()
    const record = rows[0]
    if (!record) return
    logTaskProgress('VideoTask', 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      referenceMode: record.referenceMode,
    })

    const resolvedImageUrl = await normalizeVideoReferenceUrl(record.imageUrl)
    const resolvedFirstFrameUrl = await normalizeVideoReferenceUrl(record.firstFrameUrl)
    const resolvedLastFrameUrl = await normalizeVideoReferenceUrl(record.lastFrameUrl)
    const resolvedReferenceImageUrls = await normalizeVideoReferenceUrls(record.referenceImageUrls)
    const requestRecord = {
      id: record.id,
      model: record.model,
      prompt: record.prompt,
      referenceMode: record.referenceMode,
      imageUrl: resolvedImageUrl,
      firstFrameUrl: resolvedFirstFrameUrl,
      lastFrameUrl: resolvedLastFrameUrl,
      referenceImageUrls: resolvedReferenceImageUrls ? JSON.stringify(resolvedReferenceImageUrls) : null,
      duration: record.duration,
      aspectRatio: record.aspectRatio,
    }

    if (adapter.executeGenerate) {
      logTaskProgress('VideoTask', 'sdk-request', {
        id,
        provider: config.provider,
        model: record.model,
        referenceMode: record.referenceMode,
      })
      const execution = await runProviderOperation({
        workflowJobId,
        serviceType: 'video',
        provider: config.provider,
        model: record.model,
        operation: 'generate',
        requestHash: cacheKey,
        metadata: { generationId: id, mode: 'sdk' },
      }, async () => adapter.executeGenerate!(config, requestRecord))

      if (execution.kind === 'binary' && execution.binary) {
        logTaskProgress('VideoTask', 'sync-binary-complete', {
          id,
          provider: config.provider,
          mimeType: execution.binary.mimeType,
        })
        await handleVideoCompleteBinary(
          id,
          execution.binary.data,
          execution.binary.mimeType || 'video/mp4',
          execution.binary.filename || 'generated.mp4',
          record.duration,
          record.storyboardId,
        )
        persistVideoCache(id, cacheKey)
        completeWorkflowJob(workflowJobId, { outputSummary: `video_generation:${id}`, metadata: { cacheHit: false } })
        return
      }

      const sdkResponse = execution.response
      if (!sdkResponse) {
        throw new Error('Provider did not return a binary payload or response metadata')
      }

      if (!sdkResponse.isAsync && sdkResponse.videoUrl) {
        logTaskProgress('VideoTask', 'sync-complete', { id, videoUrl: sdkResponse.videoUrl })
        await handleVideoComplete(id, sdkResponse.videoUrl, record.duration, record.storyboardId)
        persistVideoCache(id, cacheKey)
        completeWorkflowJob(workflowJobId, { outputSummary: `video_generation:${id}`, metadata: { cacheHit: false } })
        return
      }

      db.update(schema.videoGenerations)
        .set({ taskId: sdkResponse.taskId, status: 'processing', updatedAt: now() })
        .where(eq(schema.videoGenerations.id, id))
        .run()
      logTaskProgress('VideoTask', 'poll-start', { id, taskId: sdkResponse.taskId, provider: config.provider })

      void pollVideoTask(id, config, sdkResponse.taskId!, record.storyboardId, workflowJobId, cacheKey)
      return
    }

    const { url, method, headers, body } = await adapter.buildGenerateRequest(config, requestRecord)
    logTaskProgress('VideoTask', 'request', {
      id,
      provider: config.provider,
      method,
      url: redactUrl(url),
      model: record.model,
      referenceMode: record.referenceMode,
    })
    logTaskPayload('VideoTask', 'request payload', {
      id,
      method,
      url,
      headers,
      body,
    })

    const resp = await runProviderOperation({
      workflowJobId,
      serviceType: 'video',
      provider: config.provider,
      model: record.model,
      operation: 'generate',
      requestHash: cacheKey,
      metadata: { generationId: id, url: redactUrl(url) },
    }, async () => fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
    }))

    if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`)
    const contentType = String(resp.headers.get('content-type') || '').toLowerCase()

    if (contentType.startsWith('video/') || contentType.includes('application/octet-stream')) {
      const buffer = await resp.arrayBuffer()
      logTaskProgress('VideoTask', 'sync-binary-complete', { id, provider: config.provider, contentType })
      await handleVideoCompleteBinary(id, buffer, contentType || 'video/mp4', 'generated.mp4', record.duration, record.storyboardId)
      persistVideoCache(id, cacheKey)
      completeWorkflowJob(workflowJobId, { outputSummary: `video_generation:${id}`, metadata: { cacheHit: false } })
      return
    }

    const result = await resp.json() as any
    const { isAsync, taskId, videoUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && videoUrl) {
      logTaskProgress('VideoTask', 'sync-complete', { id, videoUrl })
      await handleVideoComplete(id, videoUrl, record.duration, record.storyboardId)
      persistVideoCache(id, cacheKey)
      completeWorkflowJob(workflowJobId, { outputSummary: `video_generation:${id}`, metadata: { cacheHit: false } })
      return
    }

    db.update(schema.videoGenerations)
      .set({ taskId, status: 'processing', updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
    logTaskProgress('VideoTask', 'poll-start', { id, taskId, provider: config.provider })

    if (adapter.provider === 'vidu') {
      logTaskProgress('VideoTask', 'webhook-wait', { id, taskId, provider: adapter.provider })
      return
    }

    void pollVideoTask(id, config, taskId!, record.storyboardId, workflowJobId, cacheKey)
  } catch (err: any) {
    logTaskError('VideoTask', 'process', { id, provider: config.provider, error: err.message })
    db.update(schema.videoGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
    failWorkflowJob(workflowJobId, err.message, { metadata: { generationId: id } })
  }
}

async function normalizeVideoReferenceUrl(value: string | null | undefined): Promise<string | null> {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('data:image/')) return raw
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const localPath = raw.startsWith('/static/') ? raw.slice(1) : raw
    try {
      return await readImageAsCompressedDataUrl(localPath, {
        maxWidth: 768,
        maxHeight: 768,
        quality: 68,
      })
    } catch (err) {
      logTaskWarn('VideoTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
      return null
    }
  }
  return raw
}

async function normalizeVideoReferenceUrls(raw: string | null | undefined): Promise<string[]> {
  if (!raw) return []
  let refs: string[] = []
  try {
    refs = JSON.parse(raw)
  } catch {
    refs = []
  }
  const normalized = await Promise.all(
    Array.from(new Set(refs.map((item) => String(item || '').trim()).filter(Boolean))).map((item) => normalizeVideoReferenceUrl(item)),
  )
  return normalized.filter((item): item is string => !!item)
}

async function pollVideoTask(id: number, config: AIConfig, taskId: string, storyboardId: number | null | undefined, workflowJobId: number, cacheKey: string) {
  const activePolls = getActiveVideoPolls()
  const existingPoll = activePolls.get(id)
  if (existingPoll) {
    logTaskWarn('VideoTask', 'poll-duplicate-skip', { id, taskId, existingTaskId: existingPoll.taskId })
    return
  }

  activePolls.set(id, { taskId, startedAt: Date.now() })
  const adapter = getVideoAdapter(config.provider)
  const startedAt = Date.now()
  const maxAttempts = Math.ceil(VIDEO_POLL_MAX_DURATION_MS / VIDEO_POLL_INTERVAL_MS)

  try {
    for (let i = 0; i < maxAttempts; i++) {
      if (Date.now() - startedAt >= VIDEO_POLL_MAX_DURATION_MS) {
        failVideoGeneration(id, workflowJobId, 'Timeout: Polling exceeded maximum duration', taskId)
        return
      }

      await sleep(VIDEO_POLL_INTERVAL_MS)

      const current = db.select({
        status: schema.videoGenerations.status,
        taskId: schema.videoGenerations.taskId,
      }).from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()[0]
      if (!current || current.status !== 'processing' || current.taskId !== taskId) {
        logTaskWarn('VideoTask', 'poll-stopped', { id, taskId, status: current?.status, currentTaskId: current?.taskId })
        return
      }

      try {
        const { url, method, headers } = adapter.buildPollRequest(config, taskId)
        logTaskProgress('VideoTask', 'poll-request', {
          id,
          taskId,
          provider: config.provider,
          method,
          url: redactUrl(url),
          attempt: i + 1,
        })
        const resp = await fetch(url, {
          method,
          headers,
          signal: AbortSignal.timeout(VIDEO_POLL_FETCH_TIMEOUT_MS),
        })
        if (!resp.ok) continue
        const result = await resp.json() as any

        const pollResp = adapter.parsePollResponse(result)

        if (pollResp.status === 'completed' && pollResp.videoUrl) {
          logTaskSuccess('VideoTask', 'poll-complete', { id, taskId, videoUrl: pollResp.videoUrl })
          await handleVideoComplete(id, pollResp.videoUrl, null, storyboardId)
          persistVideoCache(id, cacheKey)
          completeWorkflowJob(workflowJobId, { outputSummary: `video_generation:${id}`, metadata: { cacheHit: false } })
          return
        }
        if (pollResp.status === 'failed') {
          const message = pollResp.error || 'Video generation failed'
          logTaskError('VideoTask', 'poll-failed', { id, taskId, error: message })
          failVideoGeneration(id, workflowJobId, message, taskId)
          return
        }
      } catch (err: any) {
        if (i === maxAttempts - 1 || Date.now() - startedAt >= VIDEO_POLL_MAX_DURATION_MS) {
          const message = `Timeout: ${err.message}`
          logTaskError('VideoTask', 'poll-timeout', { id, taskId, error: err.message })
          failVideoGeneration(id, workflowJobId, message, taskId)
          return
        }
        logTaskWarn('VideoTask', 'poll-retry', { id, taskId, attempt: i + 1, error: err.message })
      }
    }
    failVideoGeneration(id, workflowJobId, 'Timeout: Polling exceeded maximum attempts', taskId)
  } finally {
    activePolls.delete(id)
  }
}

function failVideoGeneration(id: number, workflowJobId: number, message: string, taskId?: string) {
  db.update(schema.videoGenerations)
    .set({ status: 'failed', errorMsg: message, updatedAt: now() })
    .where(eq(schema.videoGenerations.id, id))
    .run()
  failWorkflowJob(workflowJobId, message, { metadata: { generationId: id, taskId } })
}

async function handleVideoComplete(id: number, videoUrl: string, duration: number | null | undefined, storyboardId?: number | null) {
  const localPath = await downloadFile(videoUrl, 'videos')
  db.update(schema.videoGenerations)
    .set({ videoUrl, localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(eq(schema.videoGenerations.id, id))
    .run()
  logTaskSuccess('VideoTask', 'downloaded', { id, localPath, storyboardId, duration })

  if (storyboardId) {
    db.update(schema.storyboards)
      .set({ videoUrl: localPath, duration: duration || undefined, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()

    try {
      await ensureStoryboardVideoFrames(storyboardId, localPath)
    } catch (err) {
      logTaskWarn('VideoTask', 'frame-extraction-failed', {
        id,
        storyboardId,
        path: localPath,
        error: (err as Error).message,
      })
    }
  }
}

async function handleVideoCompleteBinary(
  id: number,
  buffer: ArrayBuffer,
  mimeType: string,
  filename: string,
  duration: number | null | undefined,
  storyboardId?: number | null,
) {
  const localPath = await saveUploadedFile(buffer, 'videos', filenameWithExtension(filename, mimeType))
  db.update(schema.videoGenerations)
    .set({ videoUrl: localPath, localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(eq(schema.videoGenerations.id, id))
    .run()
  logTaskSuccess('VideoTask', 'saved-binary', { id, mimeType, localPath, storyboardId, duration })

  if (storyboardId) {
    db.update(schema.storyboards)
      .set({ videoUrl: localPath, duration: duration || undefined, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()

    try {
      await ensureStoryboardVideoFrames(storyboardId, localPath)
    } catch (err) {
      logTaskWarn('VideoTask', 'frame-extraction-failed', {
        id,
        storyboardId,
        path: localPath,
        error: (err as Error).message,
      })
    }
  }
}

function persistVideoCache(id: number, cacheKey: string) {
  const record = db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()[0]
  if (!record || record.status !== 'completed') return
  upsertAssetGenerationCache({
    assetType: 'video',
    cacheKey,
    provider: record.provider || 'unknown',
    model: record.model,
    prompt: record.prompt || '',
    referenceMode: record.referenceMode || '',
    sourceVideoGenerationId: record.id,
    videoUrl: record.videoUrl,
    localPath: record.localPath,
    metadata: {
      storyboardId: record.storyboardId,
      duration: record.duration,
      aspectRatio: record.aspectRatio,
    },
  })
}

function filenameWithExtension(filename: string, mimeType: string) {
  const base = String(filename || 'generated').trim().replace(/[<>:"/\\|?*]+/g, '-') || 'generated'
  if (/\.[a-z0-9]+$/i.test(base)) return base
  return `${base}.${mimeTypeToExtension(mimeType)}`
}

function mimeTypeToExtension(mimeType: string) {
  const normalized = String(mimeType || '').toLowerCase()
  if (normalized.includes('webm')) return 'webm'
  if (normalized.includes('quicktime')) return 'mov'
  return 'mp4'
}
