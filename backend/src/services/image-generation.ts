import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { getActiveConfig, getConfigById } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, readImageAsCompressedDataUrl, saveBase64Image, saveUploadedFile } from '../utils/storage.js'
import { getImageAdapter } from './adapters/registry'
import type { AIConfig } from './adapters/types'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'
import { sanitizeVisualPrompt } from './storyboard-prompts.js'
import { buildAssetGenerationCacheKey, findAssetGenerationCacheByKey, touchAssetGenerationCache, upsertAssetGenerationCache } from './asset-generation-cache.js'
import { completeWorkflowJob, createWorkflowJob, failWorkflowJob, startWorkflowJob } from './workflow-jobs.js'
import { runProviderOperation } from './provider-execution.js'

interface GenerateImageParams {
  storyboardId?: number
  dramaId?: number
  episodeId?: number
  sceneId?: number
  characterId?: number
  prompt: string
  model?: string
  size?: string
  seed?: number
  referenceImages?: string[]
  frameType?: string
  configId?: number
  workflowJobId?: number
}

export async function generateImage(params: GenerateImageParams): Promise<{ id: number; workflowJobId: number; cacheHit: boolean }> {
  const ts = now()
  const prompt = sanitizeVisualPrompt(params.prompt)
  const resolvedEpisodeId = params.episodeId
    || (params.storyboardId
      ? db.select({ episodeId: schema.storyboards.episodeId }).from(schema.storyboards).where(eq(schema.storyboards.id, params.storyboardId)).all()[0]?.episodeId
      : undefined)
    || (params.sceneId
      ? db.select({ episodeId: schema.scenes.episodeId }).from(schema.scenes).where(eq(schema.scenes.id, params.sceneId)).all()[0]?.episodeId
      : undefined)
  const config = params.configId
    ? getConfigById(params.configId)
    : getActiveConfig('image')
  if (!config) throw new Error('No active image AI config')

  const seedJob = params.workflowJobId
    ? { id: params.workflowJobId }
    : createWorkflowJob({
      kind: 'image_generate',
      relatedEntityType: params.characterId ? 'character' : params.sceneId ? 'scene' : params.storyboardId ? 'storyboard' : 'image_generation',
      relatedEntityId: params.characterId || params.sceneId || params.storyboardId || null,
      dramaId: params.dramaId ?? null,
      episodeId: resolvedEpisodeId ?? null,
      provider: config.provider,
      model: params.model || config.model,
      inputSummary: prompt.slice(0, 200),
      metadata: {
        storyboardId: params.storyboardId,
        sceneId: params.sceneId,
        characterId: params.characterId,
        frameType: params.frameType,
        seed: params.seed,
      },
    })
  const workflowJobId = Number(seedJob?.id)
  startWorkflowJob(workflowJobId, { provider: config.provider, model: params.model || config.model })

  const cacheKey = buildAssetGenerationCacheKey({
    assetType: 'image',
    provider: config.provider || 'unknown',
    model: params.model || config.model || '',
    prompt,
    inputs: {
      storyboardId: params.storyboardId,
      sceneId: params.sceneId,
      characterId: params.characterId,
      frameType: params.frameType,
      referenceImages: params.referenceImages || [],
      size: params.size || '1920x1080',
      seed: params.seed ?? null,
    },
  })

  const cacheHit = findAssetGenerationCacheByKey(cacheKey)
  if (cacheHit && cacheHit.status === 'completed' && (cacheHit.localPath || cacheHit.imageUrl)) {
    touchAssetGenerationCache(cacheHit.id)
    const cachedInsert = db.insert(schema.imageGenerations).values({
      storyboardId: params.storyboardId,
      dramaId: params.dramaId,
      sceneId: params.sceneId,
      characterId: params.characterId,
      prompt,
      model: params.model || config.model,
      provider: config.provider,
      size: params.size || '1920x1080',
      seed: params.seed ?? null,
      frameType: params.frameType,
      referenceImages: params.referenceImages ? JSON.stringify(params.referenceImages) : null,
      imageUrl: cacheHit.imageUrl,
      localPath: cacheHit.localPath,
      workflowJobId,
      status: 'completed',
      createdAt: ts,
      updatedAt: ts,
      completedAt: ts,
    }).run()
    const cachedId = Number(cachedInsert.lastInsertRowid)
    finalizeImageGeneration(cachedId, config.provider, cacheHit.localPath || '', cacheHit.imageUrl || '')
    completeWorkflowJob(workflowJobId, {
      outputSummary: `cache-hit:${cachedId}`,
      metadata: { cacheHit: true, generationId: cachedId, cacheKey },
    })
    return { id: cachedId, workflowJobId, cacheHit: true }
  }

  const res = db.insert(schema.imageGenerations).values({
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    prompt,
    model: params.model || config.model,
    provider: config.provider,
    size: params.size || '1920x1080',
    seed: params.seed ?? null,
    frameType: params.frameType,
    referenceImages: params.referenceImages ? JSON.stringify(params.referenceImages) : null,
    workflowJobId,
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const lastId = Number(res.lastInsertRowid)
  logTaskStart('ImageTask', 'enqueue', {
    id: lastId,
    provider: config.provider,
    storyboardId: params.storyboardId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    frameType: params.frameType,
    model: params.model || config.model,
    workflowJobId,
  })
  logTaskPayload('ImageTask', 'enqueue params', {
    id: lastId,
    workflowJobId,
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    params,
  })

  processImageGeneration(lastId, config, workflowJobId, cacheKey).catch(err => {
    logTaskError('ImageTask', 'process', { id: lastId, error: err.message })
    console.error(`Image generation ${lastId} failed:`, err)
  })
  return { id: lastId, workflowJobId, cacheHit: false }
}

async function processImageGeneration(id: number, config: AIConfig, workflowJobId: number, cacheKey: string) {
  const adapter = getImageAdapter(config.provider)

  try {
    const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
    const record = rows[0]
    if (!record) return
    logTaskProgress('ImageTask', 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      sceneId: record.sceneId,
      characterId: record.characterId,
      frameType: record.frameType,
    })

    const resolvedReferenceImages = await normalizeReferenceImages(record.referenceImages)
    const { url, method, headers, body } = await adapter.buildGenerateRequest(config, {
      id: record.id,
      model: record.model,
      prompt: record.prompt,
      size: record.size,
      seed: record.seed,
      frameType: record.frameType,
      referenceImages: resolvedReferenceImages ? JSON.stringify(resolvedReferenceImages) : null,
    })
    logTaskProgress('ImageTask', 'request', {
      id,
      provider: config.provider,
      method,
      url: redactUrl(url),
      model: record.model,
    })
    logTaskPayload('ImageTask', 'request payload', {
      id,
      method,
      url,
      headers,
      body,
    })

    const resp = await runProviderOperation({
      workflowJobId,
      serviceType: 'image',
      provider: config.provider,
      model: record.model,
      operation: 'generate',
      requestHash: cacheKey,
      metadata: { generationId: id, url: redactUrl(url) },
    }, async () => fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600_000),
    }))

    if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`)
    const contentType = String(resp.headers.get('content-type') || '').toLowerCase()

    if (contentType.startsWith('image/') || contentType.includes('application/octet-stream')) {
      const buffer = await resp.arrayBuffer()
      logTaskProgress('ImageTask', 'sync-binary-complete', { id, provider: config.provider, contentType })
      await handleImageCompleteBinary(id, config.provider, buffer, contentType || 'image/png')
      persistImageCache(id, cacheKey)
      completeWorkflowJob(workflowJobId, { outputSummary: `image_generation:${id}`, metadata: { cacheHit: false } })
      return
    }

    const result = await resp.json() as any
    logTaskPayload('ImageTask', 'response payload', {
      id,
      provider: config.provider,
      result,
    })

    const { isAsync, taskId, imageUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && imageUrl) {
      logTaskProgress('ImageTask', 'sync-complete', { id, imageUrl })
      await handleImageComplete(id, config.provider, imageUrl)
      persistImageCache(id, cacheKey)
      completeWorkflowJob(workflowJobId, { outputSummary: `image_generation:${id}`, metadata: { cacheHit: false } })
      return
    }

    if (!isAsync && !imageUrl) {
      const b64 = adapter.extractImageBase64(result)
      if (b64) {
        logTaskProgress('ImageTask', 'sync-base64-complete', { id, mimeType: b64.mimeType })
        await handleImageCompleteBase64(id, config.provider, b64.data, b64.mimeType)
        persistImageCache(id, cacheKey)
        completeWorkflowJob(workflowJobId, { outputSummary: `image_generation:${id}`, metadata: { cacheHit: false } })
        return
      }
      throw new Error('No image URL or base64 data in response')
    }

    db.update(schema.imageGenerations)
      .set({ taskId, status: 'processing', updatedAt: now() })
      .where(eq(schema.imageGenerations.id, id))
      .run()
    logTaskProgress('ImageTask', 'poll-start', { id, taskId, provider: config.provider })
    pollImageTask(id, config, taskId!, workflowJobId, cacheKey)
  } catch (err: any) {
    logTaskError('ImageTask', 'process', { id, provider: config.provider, error: err.message })
    db.update(schema.imageGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.imageGenerations.id, id))
      .run()
    failWorkflowJob(workflowJobId, err.message, { metadata: { generationId: id } })
  }
}

async function normalizeReferenceImages(raw: string | null | undefined): Promise<string[]> {
  if (!raw) return []
  let refs: string[] = []
  try {
    refs = JSON.parse(raw)
  } catch {
    refs = []
  }

  const deduped = Array.from(
    new Set(
      refs
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )

  const normalized = await Promise.all(deduped.map(async (value) => {
    if (value.startsWith('data:image/')) return value
    if (value.startsWith('static/') || value.startsWith('/static/')) {
      const localPath = value.startsWith('/static/') ? value.slice(1) : value
      try {
        return await readImageAsCompressedDataUrl(localPath, {
          maxWidth: 768,
          maxHeight: 768,
          quality: 68,
        })
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
        return null
      }
    }
    return value
  }))

  return normalized.filter((item): item is string => !!item).slice(0, 6)
}

async function pollImageTask(id: number, config: AIConfig, taskId: string, workflowJobId: number, cacheKey: string) {
  const adapter = getImageAdapter(config.provider)
  const startedAt = Date.now()
  const maxDurationMs = 600_000

  for (let i = 0; i < 120; i++) {
    if (Date.now() - startedAt >= maxDurationMs) {
      logTaskError('ImageTask', 'poll-timeout', { id, taskId, error: 'Polling exceeded 10 minutes' })
      db.update(schema.imageGenerations)
        .set({ status: 'failed', errorMsg: 'Timeout: Polling exceeded 10 minutes', updatedAt: now() })
        .where(eq(schema.imageGenerations.id, id))
        .run()
      failWorkflowJob(workflowJobId, 'Timeout: Polling exceeded 10 minutes', { metadata: { generationId: id, taskId } })
      return
    }
    await new Promise(r => setTimeout(r, 5000))
    if (Date.now() - startedAt >= maxDurationMs) {
      logTaskError('ImageTask', 'poll-timeout', { id, taskId, error: 'Polling exceeded 10 minutes' })
      db.update(schema.imageGenerations)
        .set({ status: 'failed', errorMsg: 'Timeout: Polling exceeded 10 minutes', updatedAt: now() })
        .where(eq(schema.imageGenerations.id, id))
        .run()
      failWorkflowJob(workflowJobId, 'Timeout: Polling exceeded 10 minutes', { metadata: { generationId: id, taskId } })
      return
    }
    try {
      const { url, method, headers } = adapter.buildPollRequest(config, taskId)
      logTaskProgress('ImageTask', 'poll-request', {
        id,
        taskId,
        provider: config.provider,
        method,
        url: redactUrl(url),
        attempt: i + 1,
      })
      const remainingMs = Math.max(1_000, maxDurationMs - (Date.now() - startedAt))
      const resp = await fetch(url, {
        method,
        headers,
        signal: AbortSignal.timeout(remainingMs),
      })
      if (!resp.ok) continue
      const result = await resp.json() as any

      const pollResp = adapter.parsePollResponse(result)

      if (pollResp.status === 'completed' && pollResp.imageUrl) {
        logTaskSuccess('ImageTask', 'poll-complete', { id, taskId, imageUrl: pollResp.imageUrl })
        await handleImageComplete(id, config.provider, pollResp.imageUrl)
        persistImageCache(id, cacheKey)
        completeWorkflowJob(workflowJobId, { outputSummary: `image_generation:${id}`, metadata: { cacheHit: false } })
        return
      }
      if (pollResp.status === 'completed' && adapter.provider === 'gemini') {
        const b64 = adapter.extractImageBase64(result)
        if (b64) {
          logTaskSuccess('ImageTask', 'poll-base64-complete', { id, taskId, mimeType: b64.mimeType })
          await handleImageCompleteBase64(id, config.provider, b64.data, b64.mimeType)
          persistImageCache(id, cacheKey)
          completeWorkflowJob(workflowJobId, { outputSummary: `image_generation:${id}`, metadata: { cacheHit: false } })
          return
        }
      }
      if (pollResp.status === 'failed') {
        logTaskError('ImageTask', 'poll-failed', { id, taskId, error: pollResp.error || 'Generation failed' })
        throw new Error(pollResp.error || 'Generation failed')
      }
    } catch (err: any) {
      if (i === 119 || Date.now() - startedAt >= maxDurationMs) {
        logTaskError('ImageTask', 'poll-timeout', { id, taskId, error: err.message })
        db.update(schema.imageGenerations)
          .set({ status: 'failed', errorMsg: `Timeout: ${err.message}`, updatedAt: now() })
          .where(eq(schema.imageGenerations.id, id))
          .run()
        failWorkflowJob(workflowJobId, `Timeout: ${err.message}`, { metadata: { generationId: id, taskId } })
        return
      }
      logTaskWarn('ImageTask', 'poll-retry', { id, taskId, attempt: i + 1, error: err.message })
    }
  }
}

async function handleImageComplete(id: number, provider: string, imageUrl: string) {
  const localPath = await downloadFile(imageUrl, 'images')
  finalizeImageGeneration(id, provider, localPath, imageUrl)
  logTaskSuccess('ImageTask', 'downloaded', { id, provider, localPath })
}

async function handleImageCompleteBinary(id: number, provider: string, buffer: ArrayBuffer, mimeType: string) {
  const extension = mimeTypeToExtension(mimeType)
  const localPath = await saveUploadedFile(buffer, 'images', `generated.${extension}`)
  finalizeImageGeneration(id, provider, localPath, '')
  logTaskSuccess('ImageTask', 'saved-binary', { id, provider, mimeType, localPath })
}

async function handleImageCompleteBase64(id: number, provider: string, base64Data: string, mimeType: string) {
  const localPath = await saveBase64Image(base64Data, mimeType, 'images')
  finalizeImageGeneration(id, provider, localPath, '')
  logTaskSuccess('ImageTask', 'saved-base64', { id, provider, mimeType, localPath })
}

function finalizeImageGeneration(id: number, provider: string, localPath: string, imageUrl: string) {
  const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  const record = rows[0]

  db.update(schema.imageGenerations)
    .set({ imageUrl, localPath, status: 'completed', updatedAt: now(), completedAt: now() })
    .where(eq(schema.imageGenerations.id, id))
    .run()

  if (record?.storyboardId) {
    const sbUpdate: Record<string, any> = { updatedAt: now() }
    if (record.frameType === 'first_frame') sbUpdate.firstFrameImage = localPath
    else if (record.frameType === 'last_frame') sbUpdate.lastFrameImage = localPath
    else sbUpdate.composedImage = localPath
    db.update(schema.storyboards).set(sbUpdate).where(eq(schema.storyboards.id, record.storyboardId)).run()
  }
  if (record?.characterId) {
    db.update(schema.characters).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId)).run()
  }
  if (record?.sceneId) {
    db.update(schema.scenes).set({ imageUrl: localPath, status: 'completed', updatedAt: now() }).where(eq(schema.scenes.id, record.sceneId)).run()
  }
}

function persistImageCache(id: number, cacheKey: string) {
  const record = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()[0]
  if (!record || record.status !== 'completed') return
  upsertAssetGenerationCache({
    assetType: 'image',
    cacheKey,
    provider: record.provider || 'unknown',
    model: record.model,
    prompt: record.prompt || '',
    referenceMode: record.frameType || '',
    sourceImageGenerationId: record.id,
    imageUrl: record.imageUrl,
    localPath: record.localPath,
    metadata: {
      storyboardId: record.storyboardId,
      sceneId: record.sceneId,
      characterId: record.characterId,
      frameType: record.frameType,
      seed: record.seed,
    },
  })
}

function mimeTypeToExtension(mimeType: string) {
  const normalized = String(mimeType || '').toLowerCase()
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('jpeg')) return 'jpeg'
  if (normalized.includes('jpg')) return 'jpg'
  return 'png'
}
