import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import { joinProviderUrl } from './url'

export class HuggingFaceImageAdapter implements ImageProviderAdapter {
  provider = 'huggingface'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const model = String(record.model || config.model || 'black-forest-labs/FLUX.1-schnell').trim()
    const { width, height } = parseImageSize(record.size)

    return {
      url: joinProviderUrl(config.baseUrl, '/hf-inference/models', `/${model}`),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        inputs: record.prompt || 'Generate an image',
        parameters: {
          width,
          height,
          guidance_scale: 7.5,
          num_inference_steps: 28,
          ...(typeof record.seed === 'number' ? { seed: record.seed } : {}),
        },
      },
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    const imageUrl = this.extractImageUrl(result)
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }

    if (result?.estimated_time || result?.error) {
      throw new Error(result?.error || 'Hugging Face image generation is not ready')
    }

    return { isAsync: false }
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/hf-inference/models', `/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(_result: any): ImagePollResponse {
    return { status: 'completed' }
  }

  extractImageUrl(result: any): string | null {
    return result?.image_url || result?.url || result?.data?.[0]?.url || null
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    const b64 = result?.data?.[0]?.b64_json
    if (b64) {
      return { data: b64, mimeType: 'image/png' }
    }
    return null
  }
}

function parseImageSize(size?: string | null) {
  const fallback = { width: 1024, height: 1024 }
  if (!size) return fallback
  const [width, height] = String(size).split('x').map((value) => Number(value))
  if (!width || !height) return fallback
  return { width, height }
}
