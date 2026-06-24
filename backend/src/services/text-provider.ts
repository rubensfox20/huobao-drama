import type { FetchFunction } from '@ai-sdk/provider-utils'
import { createOpenAI } from '@ai-sdk/openai'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { joinProviderUrl } from './adapters/url.js'
import { runProviderOperation } from './provider-execution.js'
import { classifyProviderIssue, type ProviderAvailabilityStatus } from './provider-classification.js'
import { AI_CONFIG_API_KEY_PURPOSE, openSecret } from '../utils/secrets.js'
import { getOpenAICodexResolvedCredential } from './provider-connections/openai-codex.js'
import { getGitHubCopilotResolvedCredential } from './provider-connections/github-copilot.js'
import {
  defaultConnectionBaseUrl,
  defaultConnectionModel,
  getGitHubCopilotFallbackModelIds,
  getGitHubCopilotRequestHeaders,
  getGitHubCopilotSafeModelId,
  getOpenAICodexFallbackModelIds,
  getOpenAICodexCompatibleModelId,
  GITHUB_COPILOT_BASE_URL,
  isConnectionBackedTextProvider,
  normalizeGitHubCopilotModelId,
  OPENAI_CODEX_BASE_URL,
} from './provider-connections/shared.js'

export type ResolvedTextConfig = {
  configId?: number | null
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  headers?: Record<string, string>
  fetch?: FetchFunction
  authSource?: string
  accountLabel?: string | null
  requiresManualApiKey: boolean
  connectionStatus?: 'connected' | 'not_configured'
  availableModels?: string[]
}

function parseModel(raw: string | null | undefined) {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? String(parsed[0] || '') : String(parsed || '')
  } catch {
    return String(raw)
  }
}

export function getActiveTextConfigRow() {
  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'text'))
    .all()
    .filter(row => row.isActive)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  return rows[0] || null
}

function getLegacyTextProviderBaseUrl(provider: string, baseUrl: string) {
  const normalized = provider.toLowerCase()
  if (normalized === 'openai' || normalized === 'openrouter' || normalized === 'chatfire') {
    return joinProviderUrl(baseUrl, '/v1', '')
  }
  if (normalized === 'gemini') {
    return joinProviderUrl(baseUrl, '/v1beta/openai', '')
  }
  if (normalized === 'volcengine' || normalized === 'ali') {
    return joinProviderUrl(baseUrl, '/api/v1', '')
  }
  return baseUrl
}

function extractTextFromContentPart(part: unknown): string {
  if (!part || typeof part !== 'object') return ''
  const record = part as Record<string, unknown>
  const textCandidate = record.text ?? record.output_text ?? record.content
  return typeof textCandidate === 'string' ? textCandidate.trim() : ''
}

function extractResponsesText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  if (Array.isArray(payload?.output)) {
    const collected = payload.output
      .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
      .map(extractTextFromContentPart)
      .filter(Boolean)
      .join('\n')
      .trim()
    if (collected) return collected
  }

  return ''
}

function extractResponsesStreamText(rawText: string): string {
  const chunks = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())
    .filter(line => line && line !== '[DONE]')

  const textParts: string[] = []

  for (const chunk of chunks) {
    try {
      const payload = JSON.parse(chunk)
      const delta = payload?.delta
      const text = payload?.text

      if (typeof delta === 'string' && delta) {
        textParts.push(delta)
        continue
      }

      if (typeof text === 'string' && text) {
        textParts.push(text)
        continue
      }

      const extracted = extractResponsesText(payload)
      if (extracted) {
        textParts.push(extracted)
      }
    } catch {
      // ignore malformed stream chunk and continue with the rest
    }
  }

  return textParts.join('').trim()
}

function extractChatCompletionsText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content.map(extractTextFromContentPart).filter(Boolean).join('').trim()
  }
  return ''
}

function shouldTryAlternateModel(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase()
  return (
    message.includes('model_not_supported')
    || message.includes('requested model is not supported')
    || message.includes('"param":"model"')
    || message.includes('unsupported model')
  )
}

function normalizeOpenAICodexRequestPayload(
  payload: Record<string, unknown>,
  fallbackInstructions = 'You are a helpful assistant.',
) {
  const nextPayload = { ...payload }

  if (typeof nextPayload.model === 'string' && nextPayload.model.trim()) {
    nextPayload.model = getOpenAICodexCompatibleModelId(nextPayload.model)
  }

  const instructionChunks: string[] = []
  if (Array.isArray(nextPayload.input)) {
    nextPayload.input = nextPayload.input.filter((item) => {
      if (!item || typeof item !== 'object') return true
      const role = (item as { role?: unknown }).role
      if (role !== 'system' && role !== 'developer') return true

      const content = (item as { content?: unknown }).content
      if (typeof content === 'string' && content.trim()) {
        instructionChunks.push(content.trim())
      } else if (Array.isArray(content)) {
        const normalized = content.map(extractTextFromContentPart).filter(Boolean).join('\n').trim()
        if (normalized) instructionChunks.push(normalized)
      }

      return false
    })
  }

  const existingInstructions = typeof nextPayload.instructions === 'string'
    ? nextPayload.instructions.trim()
    : ''

  nextPayload.instructions = existingInstructions || instructionChunks.join('\n\n') || fallbackInstructions
  nextPayload.store = false
  delete nextPayload.max_output_tokens
  delete nextPayload.temperature

  return nextPayload
}

function createOpenAICodexFetch(fallbackInstructions: string): FetchFunction {
  return async (input, init) => {
    if (typeof init?.body === 'string') {
      const payload = JSON.parse(init.body) as Record<string, unknown>
      const normalizedPayload = normalizeOpenAICodexRequestPayload(payload, fallbackInstructions)
      return fetch(input, {
        ...init,
        body: JSON.stringify(normalizedPayload),
      })
    }

    return fetch(input, init)
  }
}

function resolveConnectionBackedTextConfig(provider: 'openai-codex' | 'github-copilot', modelOverride?: string | null, configId?: number | null): ResolvedTextConfig {
  if (provider === 'openai-codex') {
    const credential = getOpenAICodexResolvedCredential()
    if (!credential) {
      throw new Error('OpenAI Codex sem conexao ativa. Abra Configuracoes > Conexoes e conecte o provider.')
    }

    return {
      configId: configId ?? null,
      provider,
      baseUrl: OPENAI_CODEX_BASE_URL,
      apiKey: credential.accessToken,
      model: getOpenAICodexCompatibleModelId(modelOverride),
      authSource: credential.activeSource,
      accountLabel: credential.accountLabel,
      requiresManualApiKey: false,
      connectionStatus: 'connected',
      fetch: createOpenAICodexFetch('You are a helpful assistant.'),
    }
  }

  if (provider === 'github-copilot') {
    const credential = getGitHubCopilotResolvedCredential()
    if (!credential) {
      throw new Error('GitHub Copilot sem conexao ativa. Abra Configuracoes > Conexoes e conecte o provider.')
    }

    const resolvedModel = getGitHubCopilotSafeModelId(
      modelOverride || defaultConnectionModel('github-copilot'),
      credential.availableModels,
    )

    return {
      configId: configId ?? null,
      provider,
      baseUrl: GITHUB_COPILOT_BASE_URL,
      apiKey: credential.accessToken,
      model: resolvedModel,
      headers: getGitHubCopilotRequestHeaders(credential.accessToken, false),
      authSource: credential.activeSource,
      accountLabel: credential.accountLabel,
      requiresManualApiKey: false,
      connectionStatus: 'connected',
      availableModels: credential.availableModels,
    }
  }

  throw new Error(`Unsupported connection-backed provider: ${provider}`)
}

export function getResolvedTextConfig(): ResolvedTextConfig {
  const row = getActiveTextConfigRow()
  if (!row) throw new Error('No active text AI config')

  const provider = String(row.provider || '').trim().toLowerCase()
  const model = parseModel(row.model) || (isConnectionBackedTextProvider(provider) ? defaultConnectionModel(provider) : '')

  if (provider === 'openai-codex' || provider === 'github-copilot') {
    return resolveConnectionBackedTextConfig(provider, model, row.id)
  }

  return {
    configId: row.id,
    provider,
    baseUrl: getLegacyTextProviderBaseUrl(provider, row.baseUrl),
    apiKey: openSecret(row.apiKey, AI_CONFIG_API_KEY_PURPOSE),
    model,
    requiresManualApiKey: true,
  }
}

export function createResolvedTextLanguageModel(modelOverride?: string) {
  const textConfig = getResolvedTextConfig()
  const provider = createOpenAI({
    baseURL: textConfig.baseUrl,
    apiKey: textConfig.apiKey,
    headers: textConfig.headers,
    fetch: textConfig.fetch,
  } as any)

  const modelName = textConfig.provider === 'github-copilot'
    ? getGitHubCopilotSafeModelId(modelOverride || textConfig.model, textConfig.availableModels)
    : textConfig.provider === 'openai-codex'
      ? getOpenAICodexCompatibleModelId(modelOverride || textConfig.model)
      : (modelOverride || textConfig.model)

  if (textConfig.provider === 'openai-codex') {
    return {
      model: provider.responses(modelName as any),
      config: {
        ...textConfig,
        model: modelName,
      },
    }
  }

  if (textConfig.provider === 'github-copilot' && getCopilotPreferredApiMode(modelName) === 'responses') {
    return {
      model: provider.responses(modelName as any),
      config: {
        ...textConfig,
        model: modelName,
      },
    }
  }

  return {
    model: provider.chat(modelName),
    config: {
      ...textConfig,
      model: modelName,
    },
  }
}

type TextGenerationParams = {
  system?: string
  prompt: string
  temperature?: number
  jsonOnly?: boolean
  workflowJobId?: number | null
  operation: string
}

function resolveTextRequestTimeoutMs(config: ResolvedTextConfig, params: TextGenerationParams, apiMode: 'responses' | 'chat') {
  const operation = String(params.operation || '').toLowerCase()

  if (operation.startsWith('availability:')) {
    return 15_000
  }

  if (config.provider === 'openai-codex') {
    if (operation.includes('storyboard') || operation.includes('rewrite') || operation.includes('discovery') || operation.includes('story-studio')) {
      return 120_000
    }
    if (params.jsonOnly || apiMode === 'responses') {
      return 90_000
    }
    return 60_000
  }

  if (config.provider === 'github-copilot') {
    if (operation.includes('storyboard') || operation.includes('rewrite') || operation.includes('discovery') || operation.includes('story-studio')) {
      return 90_000
    }
    return 45_000
  }

  if (operation.includes('storyboard') || operation.includes('rewrite') || operation.includes('discovery') || operation.includes('story-studio')) {
    return 60_000
  }

  return 30_000
}

function getFetchHeaders(config: ResolvedTextConfig) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    ...(config.headers || {}),
  }
}

function buildResponseMessages(system: string | undefined, prompt: string) {
  return [
    ...(system ? [{ role: 'system', content: system }] : []),
    { role: 'user', content: prompt },
  ]
}

function getCopilotPreferredApiMode(model: string) {
  const normalized = normalizeGitHubCopilotModelId(model)
  if (normalized.startsWith('gpt-5') || normalized.includes('codex')) {
    return 'responses'
  }
  return 'chat'
}

async function callResponsesApi(config: ResolvedTextConfig, params: TextGenerationParams, model: string) {
  const timeoutMs = resolveTextRequestTimeoutMs(config, params, 'responses')
  const payload = config.provider === 'openai-codex'
    ? normalizeOpenAICodexRequestPayload({
      model,
      input: [{
        role: 'user',
        content: [{ type: 'input_text', text: params.prompt }],
      }],
      instructions: params.jsonOnly
        ? [params.system, 'Return valid JSON only. No markdown, no explanations.'].filter(Boolean).join('\n\n')
        : params.system,
      store: false,
      stream: true,
    })
    : {
      model,
      input: [params.system, params.prompt].filter(Boolean).join('\n\n'),
      temperature: params.temperature,
      ...(params.jsonOnly ? {
        instructions: [params.system, 'Return valid JSON only. No markdown, no explanations.']
          .filter(Boolean)
          .join('\n\n'),
      } : params.system ? { instructions: params.system } : {}),
    }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: getFetchHeaders(config),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(rawText || `${response.status} ${response.statusText}`)
  }

  const isEventStream = response.headers.get('content-type')?.includes('text/event-stream')
  if (isEventStream || rawText.includes('\ndata:') || rawText.startsWith('data:')) {
    const streamedText = extractResponsesStreamText(rawText)
    if (!streamedText) {
      throw new Error('Provider returned empty streamed response text')
    }
    return { text: streamedText, raw: rawText }
  }

  const parsed = JSON.parse(rawText)
  const text = extractResponsesText(parsed)
  if (!text) throw new Error('Provider returned empty response text')
  return { text, raw: parsed }
}

async function callChatCompletionsApi(config: ResolvedTextConfig, params: TextGenerationParams, model: string) {
  const timeoutMs = resolveTextRequestTimeoutMs(config, params, 'chat')
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: getFetchHeaders(config),
    body: JSON.stringify({
      model,
      temperature: params.temperature,
      messages: buildResponseMessages(
        params.jsonOnly ? [params.system, 'Return valid JSON only. No markdown, no explanations.'].filter(Boolean).join('\n\n') : params.system,
        params.prompt,
      ),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(rawText || `${response.status} ${response.statusText}`)
  }
  const parsed = JSON.parse(rawText)
  const text = extractChatCompletionsText(parsed)
  if (!text) throw new Error('Provider returned empty response text')
  return { text, raw: parsed }
}

export async function generateTextCompletion(params: TextGenerationParams) {
  const config = getResolvedTextConfig()
  const requestModel = config.provider === 'openai-codex'
    ? getOpenAICodexCompatibleModelId(config.model)
    : config.provider === 'github-copilot'
      ? getGitHubCopilotSafeModelId(config.model, config.availableModels)
      : config.model

  return runProviderOperation({
    workflowJobId: params.workflowJobId,
    serviceType: 'text',
    provider: config.provider,
    model: requestModel,
    operation: params.operation,
    metadata: {
      authSource: config.authSource || null,
      accountLabel: config.accountLabel || null,
    },
  }, async () => {
    if (config.provider === 'openai-codex') {
      const candidates = getOpenAICodexFallbackModelIds(requestModel)
      let lastError: unknown = null
      for (const candidate of candidates) {
        try {
          return await callResponsesApi(config, params, candidate)
        } catch (error) {
          lastError = error
          if (!shouldTryAlternateModel(error)) break
        }
      }
      throw lastError || new Error('OpenAI Codex failed for all fallback models')
    }

    if (config.provider === 'github-copilot') {
      const candidates = getGitHubCopilotFallbackModelIds(requestModel)
      let lastError: unknown = null
      for (const candidate of candidates) {
        const mode = getCopilotPreferredApiMode(candidate)
        try {
          return mode === 'responses'
            ? await callResponsesApi(config, params, candidate)
            : await callChatCompletionsApi(config, params, candidate)
        } catch (error) {
          lastError = error
          if (!shouldTryAlternateModel(error)) break
        }
      }
      throw lastError || new Error('GitHub Copilot failed for all fallback models')
    }

    return callChatCompletionsApi(config, params, requestModel)
  })
}

export function getTextConfigConnectionInfo(provider?: string | null) {
  const normalizedProvider = String(provider || '').trim().toLowerCase()
  if (normalizedProvider === 'openai-codex') {
    const credential = getOpenAICodexResolvedCredential()
    return {
      connection_status: credential ? 'connected' : 'not_configured',
      connection_account_label: credential?.accountLabel || null,
      resolved_auth_source: credential?.activeSource || null,
      requires_manual_api_key: false,
    }
  }

  if (normalizedProvider === 'github-copilot') {
    const credential = getGitHubCopilotResolvedCredential()
    return {
      connection_status: credential ? 'connected' : 'not_configured',
      connection_account_label: credential?.accountLabel || null,
      resolved_auth_source: credential?.activeSource || null,
      requires_manual_api_key: false,
    }
  }

  return {
    connection_status: null,
    connection_account_label: null,
    resolved_auth_source: null,
    requires_manual_api_key: true,
  }
}

export async function probeConnectionBackedTextProvider(provider: 'openai-codex' | 'github-copilot', model?: string) {
  let config: ResolvedTextConfig
  try {
    config = resolveConnectionBackedTextConfig(provider, model)
  } catch {
    return {
      provider,
      status: 'not_configured' as ProviderAvailabilityStatus,
      checkedAt: new Date().toISOString(),
      services: [],
    }
  }

  const requestModel = provider === 'openai-codex'
    ? getOpenAICodexCompatibleModelId(model || defaultConnectionModel(provider))
    : getGitHubCopilotSafeModelId(model || defaultConnectionModel(provider), config.availableModels)

  try {
    const result = await runProviderOperation({
      workflowJobId: null,
      serviceType: 'text',
      provider: config.provider,
      model: requestModel,
      operation: `availability:text:${provider}`,
      metadata: {
        authSource: config.authSource || null,
        accountLabel: config.accountLabel || null,
      },
    }, async () => {
      if (provider === 'openai-codex') {
        const candidates = getOpenAICodexFallbackModelIds(requestModel)
        let lastError: unknown = null
        for (const candidate of candidates) {
          try {
            return await callResponsesApi(config, {
              system: 'Reply with OK only.',
              prompt: 'OK',
              operation: `availability:text:${provider}`,
            }, candidate)
          } catch (error) {
            lastError = error
            if (!shouldTryAlternateModel(error)) break
          }
        }
        throw lastError || new Error('OpenAI Codex failed for all fallback models')
      }

      const candidates = getGitHubCopilotFallbackModelIds(requestModel)
      let lastError: unknown = null
      for (const candidate of candidates) {
        const mode = getCopilotPreferredApiMode(candidate)
        try {
          return mode === 'responses'
            ? await callResponsesApi(config, {
              system: 'Reply with OK only.',
              prompt: 'OK',
              operation: `availability:text:${provider}`,
            }, candidate)
            : await callChatCompletionsApi(config, {
              system: 'Reply with OK only.',
              prompt: 'OK',
              operation: `availability:text:${provider}`,
            }, candidate)
        } catch (error) {
          lastError = error
          if (!shouldTryAlternateModel(error)) break
        }
      }
      throw lastError || new Error('GitHub Copilot failed for all fallback models')
    })
    const normalizedMessage = normalizeProviderProbeMessage(result.text)
    const status = classifyProviderIssue({ status: 200, message: normalizedMessage, reachable: true })
    return {
      provider,
      status,
      checkedAt: new Date().toISOString(),
      services: [{
        configId: 0,
        serviceType: 'text',
        name: provider,
        model: requestModel,
        status,
        statusCode: 200,
        message: normalizedMessage,
        reachable: true,
        method: 'POST',
        url: `${config.baseUrl}/responses`,
      }],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = classifyProviderIssue({ message, reachable: false })
    return {
      provider,
      status,
      checkedAt: new Date().toISOString(),
      services: [{
        configId: 0,
        serviceType: 'text',
        name: provider,
        model: requestModel,
        status,
        statusCode: null,
        message,
        reachable: false,
        method: 'POST',
        url: `${config.baseUrl}/responses`,
      }],
    }
  }
}

function normalizeProviderProbeMessage(message: string) {
  const text = String(message || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''

  if (text.replace(/[^a-z]/gi, '').toLowerCase() === 'okok') return 'OK'

  return text
}
