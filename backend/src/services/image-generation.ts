import { desc, eq } from 'drizzle-orm'
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
import { reportProviderOperationFailure } from './provider-governor.js'
import { getOpenAICodexResolvedCredential, invalidateOpenAICodexCredential } from './provider-connections/openai-codex.js'
import { OPENAI_CODEX_BASE_URL } from './provider-connections/shared.js'

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

const MAX_REFERENCE_IMAGES = readPositiveIntEnv('IMAGE_REFERENCE_LIMIT', 4)
const REFERENCE_IMAGE_MAX_DIMENSION = readPositiveIntEnv('IMAGE_REFERENCE_MAX_DIMENSION', 512)
const REFERENCE_IMAGE_QUALITY = readPositiveIntEnv('IMAGE_REFERENCE_QUALITY', 58)

function readPositiveIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
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
  const config = resolveImageConfig(params.configId, params.model)
  if (!config) throw new Error('No active image AI config')
  const model = resolveImageModel(config, params.model)
  assertOpenAICodexImageNotInPersistedCooldown(config.provider)

  const seedJob = params.workflowJobId
    ? { id: params.workflowJobId }
    : createWorkflowJob({
      kind: 'image_generate',
      relatedEntityType: params.characterId ? 'character' : params.sceneId ? 'scene' : params.storyboardId ? 'storyboard' : 'image_generation',
      relatedEntityId: params.characterId || params.sceneId || params.storyboardId || null,
      dramaId: params.dramaId ?? null,
      episodeId: resolvedEpisodeId ?? null,
      provider: config.provider,
      model,
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
  startWorkflowJob(workflowJobId, { provider: config.provider, model })

  const cacheKey = buildAssetGenerationCacheKey({
    assetType: 'image',
    provider: config.provider || 'unknown',
    model,
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
      model,
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
    model,
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
    model,
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

function assertOpenAICodexImageNotInPersistedCooldown(provider: string) {
  if (String(provider || '').toLowerCase() !== 'openai-codex') return

  const nowMs = Date.now()
  const recentFailures = db.select({
    id: schema.imageGenerations.id,
    errorMsg: schema.imageGenerations.errorMsg,
    createdAt: schema.imageGenerations.createdAt,
  })
    .from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.provider, 'openai-codex'))
    .orderBy(desc(schema.imageGenerations.id))
    .limit(80)
    .all()
    .filter(row => String(row.errorMsg || '').trim())

  const resetMs = recentFailures
    .map(row => extractResetTimeMsFromMessage(String(row.errorMsg || ''), nowMs))
    .find(value => value > nowMs)
  if (resetMs) {
    throw new Error(`OpenAI Codex atingiu o limite de geração de imagem. Tente novamente apos ${new Date(resetMs).toLocaleString('pt-BR')}.`)
  }

}

function extractResetTimeMsFromMessage(message: string, nowMs: number) {
  const resetsAt = String(message).match(/"?resets_at"?\s*:\s*(\d{10,13})/i)?.[1]
  if (resetsAt) {
    const value = Number(resetsAt)
    const ms = value > 10_000_000_000 ? value : value * 1000
    if (Number.isFinite(ms) && ms > nowMs) return ms
  }

  const resetsIn = String(message).match(/"?resets_in_seconds"?\s*:\s*(\d+)/i)?.[1]
  if (resetsIn) {
    const seconds = Number(resetsIn)
    if (Number.isFinite(seconds) && seconds > 0) return nowMs + seconds * 1000
  }

  return 0
}

function getImageConfigById(configId: number): AIConfig | null {
  const [row] = db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, configId)).all()
  if (!row) return null

  const provider = String(row.provider || '').toLowerCase()
  if (provider === 'openai-codex') return getCodexImageConfigFromLogin(parseModelList(row.model) || 'gpt-5.5')
  if (!row.isActive) return null

  const serviceType = String(row.serviceType || '').toLowerCase()
  if (serviceType !== 'image') return null

  const config = getConfigById(configId)
  if (!config) return null
  if (isKnownNonImageModel(config.provider, config.model)) return null
  return config
}

function resolveImageConfig(configId?: number, requestedModel?: string): AIConfig | null {
  const [explicitRow] = configId
    ? db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, configId)).all()
    : []
  const explicitProvider = String(explicitRow?.provider || '').toLowerCase()
  const model = String(requestedModel || parseModelList(explicitRow?.model) || '').trim()

  if (explicitProvider === 'openai-codex' || isCodexImageModel(model)) {
    return getCodexImageConfigFromLogin(model || 'gpt-5.5')
  }

  const codexConfig = getPreferredCodexImageConfig()
  if (codexConfig) return codexConfig

  return configId
    ? getImageConfigById(configId) || getActiveImageConfig()
    : getActiveImageConfig()
}

function parseModelList(raw: string | null | undefined) {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? String(parsed[0] || '') : String(parsed || '')
  } catch {
    return String(raw)
  }
}

function isCodexImageModel(model: string) {
  return /^gpt-5(?:\.|-|$)/i.test(String(model || '').trim())
}

function isKnownNonImageModel(provider: string, model: string) {
  const normalizedProvider = String(provider || '').toLowerCase()
  const normalizedModel = String(model || '').toLowerCase()
  return normalizedProvider === 'huggingface' && /\b(?:wan|i2v|t2v|video)\b/.test(normalizedModel)
}

function resolveImageModel(config: AIConfig, requestedModel?: string) {
  const provider = String(config.provider || '').toLowerCase()
  const requested = String(requestedModel || '').trim()
  if (provider === 'openai-codex') {
    return requested.toLowerCase().startsWith('gpt-') ? requested : (config.model || 'gpt-5.5')
  }
  return requested || config.model
}

function getActiveImageConfig(): AIConfig | null {
  const codexConfig = getPreferredCodexImageConfig()
  if (codexConfig) return codexConfig

  const imageRows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'image'))
    .all()
    .filter(row => row.isActive)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))

  for (const row of imageRows) {
    const imageConfig = getImageConfigById(row.id)
    if (imageConfig) return imageConfig
  }

  return null
}

function getPreferredCodexImageConfig(): AIConfig | null {
  const codexCredential = getOpenAICodexResolvedCredential()
  if (codexCredential) return getCodexImageConfigFromLogin('gpt-5.5')

  const codexRows = db.select().from(schema.aiServiceConfigs).all()
    .filter(row => row.isActive && String(row.provider || '').toLowerCase() === 'openai-codex')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))

  if (codexRows[0]) {
    return getCodexImageConfigFromLogin(parseModelList(codexRows[0].model) || 'gpt-5.5')
  }

  return null
}

function getCodexImageConfigFromLogin(model = 'gpt-5.5'): AIConfig {
  const codexCredential = getOpenAICodexResolvedCredential()
  if (!codexCredential) {
    throw new Error('OpenAI Codex sem login ativo. Abra Configuracoes > Conexoes e conecte o Codex pelo navegador.')
  }

  return {
    provider: 'openai-codex',
    baseUrl: OPENAI_CODEX_BASE_URL,
    apiKey: codexCredential.accessToken,
    model: model || 'gpt-5.5',
  }
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
    }, async () => {
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(600_000),
      })
      if (!response.ok) {
        const errorBody = await response.text()
        if (isCodexTokenRevoked(config.provider, response.status, errorBody)) {
          invalidateOpenAICodexCredential(errorBody)
          throw new Error('Login do OpenAI Codex expirou ou foi revogado. Conecte o Codex novamente em Configuracoes > Conexoes e tente gerar a imagem de novo.')
        }
        throw new Error(`API error ${response.status}: ${errorBody}`)
      }
      return response
    })
    const contentType = String(resp.headers.get('content-type') || '').toLowerCase()

    if (contentType.startsWith('image/') || contentType.includes('application/octet-stream')) {
      const buffer = await resp.arrayBuffer()
      logTaskProgress('ImageTask', 'sync-binary-complete', { id, provider: config.provider, contentType })
      await handleImageCompleteBinary(id, config.provider, buffer, contentType || 'image/png')
      persistImageCache(id, cacheKey)
      completeWorkflowJob(workflowJobId, { outputSummary: `image_generation:${id}`, metadata: { cacheHit: false } })
      return
    }

    const rawText = await resp.text()
    const result = isProviderEventStream(contentType, rawText)
      ? parseProviderEventStream(rawText)
      : JSON.parse(rawText) as any
    logTaskPayload('ImageTask', 'response payload', {
      id,
      provider: config.provider,
      result: summarizeProviderResultForLog(result),
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
    if (isCodexImageToolUnavailableError(config.provider, err.message)) {
      reportProviderOperationFailure(config.provider, 'generate', err.message, null)
    }
    logTaskError('ImageTask', 'process', { id, provider: config.provider, error: err.message })
    db.update(schema.imageGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.imageGenerations.id, id))
      .run()
    failWorkflowJob(workflowJobId, err.message, { metadata: { generationId: id } })
  }
}

function isCodexTokenRevoked(provider: string, status: number, body: string) {
  return String(provider || '').toLowerCase() === 'openai-codex'
    && status === 401
    && /token_revoked|invalidated oauth token/i.test(body)
}

function isCodexImageToolUnavailableError(provider: string, message: string) {
  return String(provider || '').toLowerCase() === 'openai-codex'
    && /no image-generation tool is available|sem uma ferramenta de gera..o de imagem|codex respondeu sem imagem/i.test(String(message || ''))
}

function isProviderEventStream(contentType: string, rawText: string) {
  const text = rawText.trimStart()
  return contentType.includes('text/event-stream')
    || text.startsWith('event:')
    || text.startsWith('data:')
    || text.includes('\nevent:')
    || text.includes('\ndata:')
}

function parseProviderEventStream(rawText: string) {
  const events: any[] = []
  const chunks = rawText.split(/\r?\n\r?\n/)

  for (const chunk of chunks) {
    const data = chunk
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim())
      .filter(line => line && line !== '[DONE]')
      .join('\n')

    if (!data) continue
    try {
      events.push(JSON.parse(data))
    } catch {
      // ignore non-JSON stream chunks
    }
  }

  const completed = [...events].reverse().find(event => event?.type === 'response.completed' && event?.response)
  return {
    events,
    response: completed?.response,
    rawText: `[event stream omitted: ${events.length} events, ${rawText.length} chars]`,
  }
}

function summarizeProviderResultForLog(result: any) {
  if (!Array.isArray(result?.events)) return result
  return {
    eventCount: result.events.length,
    response: result.response,
    outputText: extractProviderOutputTextForLog(result),
    rawText: result.rawText,
  }
}

function extractProviderOutputTextForLog(result: any) {
  const events = Array.isArray(result?.events) ? result.events : []
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    const candidates = [
      event?.text,
      event?.part?.text,
      ...(Array.isArray(event?.item?.content) ? event.item.content.map((part: any) => part?.text) : []),
    ]
    const found = candidates.find(value => typeof value === 'string' && value.trim())
    if (found) return found.length > 800 ? `${found.slice(0, 800)}...` : found
  }
  return null
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

  const normalized: string[] = []
  for (const value of deduped.slice(0, MAX_REFERENCE_IMAGES)) {
    if (value.startsWith('data:image/')) {
      normalized.push(value)
      continue
    }
    if (value.startsWith('static/') || value.startsWith('/static/')) {
      const localPath = value.startsWith('/static/') ? value.slice(1) : value
      try {
        normalized.push(await readImageAsCompressedDataUrl(localPath, {
          maxWidth: REFERENCE_IMAGE_MAX_DIMENSION,
          maxHeight: REFERENCE_IMAGE_MAX_DIMENSION,
          quality: REFERENCE_IMAGE_QUALITY,
        }))
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
      }
      continue
    }
    normalized.push(value)
  }

  return normalized.filter((item): item is string => !!item)
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
      if (!resp.ok) {
        const errorBody = await resp.text()
        if (isCodexTokenRevoked(config.provider, resp.status, errorBody)) {
          invalidateOpenAICodexCredential(errorBody)
          throw new Error('Login do OpenAI Codex expirou ou foi revogado. Conecte o Codex novamente em Configuracoes > Conexoes e tente gerar a imagem de novo.')
        }
        continue
      }
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
