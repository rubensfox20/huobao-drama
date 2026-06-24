import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import { joinProviderUrl } from './url'
import { getOpenAICodexCompatibleModelId } from '../provider-connections/shared.js'

export class OpenAICodexImageAdapter implements ImageProviderAdapter {
  provider = 'openai-codex'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const size = normalizeImageSize(record.size)
    const aspectRatio = imageSizeToAspectRatio(size)
    const referenceImages = parseReferenceImages(record.referenceImages)
    return {
      url: joinProviderUrl(config.baseUrl, '', '/responses'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: {
        model: getOpenAICodexCompatibleModelId(record.model || config.model),
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  `Generate an image from this prompt and return the generated image.`,
                  `Required output: ${aspectRatio} aspect ratio, ${size} resolution, PNG.`,
                  `The required aspect ratio and resolution override any conflicting words in the prompt, including horizontal, vertical, landscape, portrait, or frontal framing terms.`,
                  '',
                  record.prompt || '',
                ].join('\n'),
              },
              ...referenceImages.map(imageUrl => ({
                type: 'input_image',
                image_url: imageUrl,
              })),
            ],
          },
        ],
        tools: [{ type: 'image_generation', model: 'gpt-image-2-codex', size, quality: 'high', output_format: 'png' }],
        store: false,
        stream: true,
      },
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    const imageUrl = this.extractImageUrl(result)
    if (imageUrl) return { isAsync: false, imageUrl }

    const b64 = this.extractImageBase64(result)
    if (b64) return { isAsync: false, imageUrl: undefined }

    const error = result?.error?.message || result?.message
    const outputText = extractOutputText(result)
    throw new Error(error || formatNoImageError(outputText))
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '', `/responses/${taskId}`),
      method: 'GET',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: undefined,
    }
  }

  parsePollResponse(result: any): ImagePollResponse {
    if (this.extractImageUrl(result) || this.extractImageBase64(result)) {
      return { status: 'completed', imageUrl: this.extractImageUrl(result) || undefined }
    }
    if (result?.status === 'failed' || result?.status === 'incomplete') {
      return { status: 'failed', error: result?.error?.message || result?.incomplete_details?.reason || 'Generation failed' }
    }
    return { status: result?.status || 'processing' }
  }

  extractImageUrl(result: any): string | null {
    return findFirstString(result, ['url', 'image_url'])
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    const data = findLastString(result, ['b64_json', 'base64', 'image_base64', 'partial_image_b64', 'result'])
    if (!data || !looksLikeImageBase64(data)) return null
    return data ? { data: data.replace(/^data:image\/\w+;base64,/, ''), mimeType: 'image/png' } : null
  }
}

function formatNoImageError(outputText: string | null) {
  const text = outputText?.trim()
  if (!text) return 'Codex completou a resposta sem retornar imagem. Verifique se a ferramenta de imagem da conta esta disponivel e se o limite de uso nao foi atingido.'
  const preview = text.length > 500 ? `${text.slice(0, 500)}...` : text
  return `Codex respondeu sem imagem: ${preview}`
}

function extractOutputText(result: any): string | null {
  const events = Array.isArray(result?.events) ? result.events : []
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    const candidates = [
      event?.text,
      event?.part?.text,
      ...(Array.isArray(event?.item?.content) ? event.item.content.map((part: any) => part?.text) : []),
    ]
    const found = candidates.find(value => typeof value === 'string' && value.trim())
    if (found) return found.trim()
  }

  return null
}

function parseReferenceImages(raw?: string | null) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(item => String(item || '').trim()).filter(Boolean) : []
  } catch {
    return []
  }
}

function normalizeImageSize(size?: string | null) {
  const raw = String(size || '').trim()
  return /^\d+x\d+$/i.test(raw) ? raw.toLowerCase() : '864x1536'
}

function imageSizeToAspectRatio(size: string) {
  const [width, height] = size.split('x').map(value => Number(value))
  if (!width || !height) return '9:16'
  const divisor = gcd(width, height)
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function findFirstString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstString(item, keys)
      if (found) return found
    }
    return null
  }

  const record = value as Record<string, unknown>
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }

  for (const item of Object.values(record)) {
    const found = findFirstString(item, keys)
    if (found) return found
  }
  return null
}

function findLastString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null
  let found: string | null = null
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findLastString(item, keys)
      if (nested) found = nested
    }
    return found
  }

  const record = value as Record<string, unknown>
  for (const item of Object.values(record)) {
    const nested = findLastString(item, keys)
    if (nested) found = nested
  }
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) found = candidate.trim()
  }
  return found
}

function looksLikeImageBase64(value: string) {
  const normalized = value.replace(/^data:image\/\w+;base64,/, '').trim()
  return normalized.length > 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(normalized)
}
