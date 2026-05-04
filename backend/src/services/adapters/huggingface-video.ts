import { InferenceClient } from '@huggingface/inference'
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
  VideoGenerateExecution,
} from './types'
import { parseDataUrl } from '../../utils/storage.js'

export class HuggingFaceVideoAdapter implements VideoProviderAdapter {
  provider = 'huggingface'

  async executeGenerate(config: AIConfig, record: VideoGenerationRecord): Promise<VideoGenerateExecution> {
    const client = new InferenceClient(config.apiKey)
    const referenceMode = String(record.referenceMode || 'none').trim()
    const model = resolveModel(referenceMode, record.model || config.model || '')

    let blob: Blob
    if (referenceMode === 'none') {
      blob = await client.textToVideo({
        model,
        inputs: record.prompt || 'Generate a cinematic video',
        parameters: buildVideoParameters(record),
      })
    } else if (referenceMode === 'single') {
      const inputImage = await readVideoInputBlob(record.imageUrl)
      if (!inputImage) {
        throw new Error('Hugging Face video requires image_url when reference_mode=single')
      }

      blob = await client.imageToVideo({
        model,
        inputs: inputImage,
        parameters: {
          ...buildVideoParameters(record),
          prompt: record.prompt || 'Animate this image cinematically',
        },
      })
    } else {
      throw new Error('Hugging Face video currently supports only reference_mode none or single')
    }

    return {
      kind: 'binary',
      binary: {
        data: await blob.arrayBuffer(),
        mimeType: blob.type || 'video/mp4',
        filename: `huggingface-video.${mimeTypeToExtension(blob.type || 'video/mp4')}`,
      },
    }
  }

  buildGenerateRequest(_config: AIConfig, _record: VideoGenerationRecord): ProviderRequest {
    throw new Error('Hugging Face video uses the official SDK execution path')
  }

  parseGenerateResponse(_result: any): VideoGenResponse {
    return { isAsync: false }
  }

  buildPollRequest(_config: AIConfig, _taskId: string): ProviderRequest {
    throw new Error('Hugging Face video does not expose polling in this adapter')
  }

  parsePollResponse(_result: any): VideoPollResponse {
    return { status: 'completed' }
  }

  extractVideoUrl(_result: any): string | null {
    return null
  }
}

function buildVideoParameters(record: VideoGenerationRecord) {
  const targetSize = parseAspectRatio(record.aspectRatio)
  return {
    guidance_scale: 7,
    num_inference_steps: 28,
    num_frames: estimateFrameCount(record.duration),
    target_size: targetSize,
  }
}

function resolveModel(referenceMode: string, configuredModel: string) {
  const normalized = String(configuredModel || '').trim()
  if (referenceMode === 'none') {
    return normalized || 'Wan-AI/Wan2.2-TI2V-5B'
  }

  if (!normalized || normalized === 'Wan-AI/Wan2.2-TI2V-5B') {
    return 'Lightricks/LTX-2'
  }

  return normalized
}

function estimateFrameCount(duration?: number | null) {
  const seconds = Math.max(2, Number(duration || 5))
  return Math.max(16, Math.min(seconds * 8, 96))
}

function parseAspectRatio(aspectRatio?: string | null) {
  const ratio = String(aspectRatio || '16:9').trim()
  if (ratio === '9:16') return { width: 576, height: 1024 }
  if (ratio === '1:1') return { width: 768, height: 768 }
  return { width: 1024, height: 576 }
}

async function readVideoInputBlob(raw: string | null | undefined) {
  const value = String(raw || '').trim()
  if (!value) return null

  if (value.startsWith('data:')) {
    const parsed = parseDataUrl(value)
    if (!parsed) return null
    return new Blob([Buffer.from(parsed.data, 'base64')], { type: parsed.mimeType })
  }

  const response = await fetch(value)
  if (!response.ok) {
    throw new Error(`Hugging Face reference image fetch failed: ${response.status}`)
  }

  return new Blob(
    [await response.arrayBuffer()],
    { type: response.headers.get('content-type') || 'image/png' },
  )
}

function mimeTypeToExtension(mimeType: string) {
  const normalized = String(mimeType || '').toLowerCase()
  if (normalized.includes('webm')) return 'webm'
  if (normalized.includes('quicktime')) return 'mov'
  return 'mp4'
}
