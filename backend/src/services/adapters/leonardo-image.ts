import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import { joinProviderUrl } from './url'
import { parseDataUrl } from '../../utils/storage.js'

export class LeonardoImageAdapter implements ImageProviderAdapter {
  provider = 'leonardo'

  async buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): Promise<ProviderRequest> {
    const { width, height } = parseImageSize(record.size)
    const modelId = String(record.model || config.model || '7b592283-e8a7-4c5a-9ba6-d18c31f258b9').trim()
    const imagePromptIds = await this.uploadReferenceImages(config, record.referenceImages)

    const body: Record<string, any> = {
      prompt: record.prompt || 'Generate an image',
      modelId,
      width,
      height,
      num_images: 1,
      contrast: 3.5,
      alchemy: true,
      enhancePrompt: false,
      ...(typeof record.seed === 'number' ? { seed: record.seed } : {}),
    }

    if (imagePromptIds.length) {
      body.imagePrompts = imagePromptIds
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/api/rest/v1', '/generations'),
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    const taskId = result?.sdGenerationJob?.generationId
      || result?.sdGenerationJob?.id
      || result?.generationId
      || result?.id

    if (taskId) {
      return { isAsync: true, taskId }
    }

    const imageUrl = this.extractImageUrl(result)
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }

    throw new Error(result?.error || 'No generationId returned by Leonardo')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/api/rest/v1', `/generations/${taskId}`),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): ImagePollResponse {
    const generation = result?.generations_by_pk || result?.generation || result
    const rawStatus = String(generation?.status || '').toUpperCase()

    if (rawStatus === 'COMPLETE' || rawStatus === 'COMPLETED') {
      return {
        status: 'completed',
        imageUrl: generation?.generated_images?.[0]?.url || generation?.generatedImages?.[0]?.url || null,
      }
    }

    if (rawStatus === 'FAILED') {
      return {
        status: 'failed',
        error: generation?.error || generation?.errorMessage || 'Leonardo generation failed',
      }
    }

    if (rawStatus === 'PENDING' || rawStatus === 'QUEUED') {
      return { status: 'pending' }
    }

    return { status: 'processing' }
  }

  extractImageUrl(result: any): string | null {
    return result?.generations_by_pk?.generated_images?.[0]?.url
      || result?.generated_images?.[0]?.url
      || result?.image_url
      || null
  }

  extractImageBase64(_result: any): { data: string; mimeType: string } | null {
    return null
  }

  private async uploadReferenceImages(config: AIConfig, rawReferenceImages?: string | null) {
    if (!rawReferenceImages) return []

    let references: string[] = []
    try {
      references = JSON.parse(rawReferenceImages)
    } catch {
      references = []
    }

    const imageIds: string[] = []

    for (const reference of references.slice(0, 4)) {
      const parsed = parseDataUrl(String(reference || ''))
      if (!parsed) continue

      const extension = mimeTypeToExtension(parsed.mimeType)
      const initResponse = await fetch(joinProviderUrl(config.baseUrl, '/api/rest/v1', '/init-image'), {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ extension }),
      })

      if (!initResponse.ok) {
        throw new Error(`Leonardo init-image failed: ${await initResponse.text()}`)
      }

      const initResult = await initResponse.json() as any
      const upload = initResult?.uploadInitImage || initResult?.uploadDatasetImage
      const uploadId = upload?.id
      const uploadUrl = upload?.url
      const uploadFields = typeof upload?.fields === 'string' ? JSON.parse(upload.fields) : (upload?.fields || {})

      if (!uploadId || !uploadUrl) {
        throw new Error('Leonardo did not return upload details for reference image')
      }

      const formData = new FormData()
      for (const [key, value] of Object.entries(uploadFields)) {
        formData.append(key, String(value))
      }
      const fileBuffer = Buffer.from(parsed.data, 'base64')
      formData.append('file', new Blob([fileBuffer], { type: parsed.mimeType }), `reference.${extension}`)

      const uploadRequest = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      })

      if (!uploadRequest.ok) {
        throw new Error(`Leonardo reference upload failed: ${await uploadRequest.text()}`)
      }

      imageIds.push(uploadId)
    }

    return imageIds
  }
}

function parseImageSize(size?: string | null) {
  const fallback = { width: 1024, height: 1024 }
  if (!size) return fallback
  const [width, height] = String(size).split('x').map((value) => Number(value))
  if (!width || !height) return fallback
  return { width, height }
}

function mimeTypeToExtension(mimeType: string) {
  const normalized = String(mimeType || '').toLowerCase()
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('jpeg')) return 'jpeg'
  if (normalized.includes('jpg')) return 'jpg'
  return 'png'
}
