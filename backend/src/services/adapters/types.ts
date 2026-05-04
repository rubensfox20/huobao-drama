
export interface ImageProviderAdapter {

  provider: string


  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest | Promise<ProviderRequest>


  parseGenerateResponse(result: any): ImageGenResponse


  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest


  parsePollResponse(result: any): ImagePollResponse


  extractImageUrl(result: any): string | null


  extractImageBase64(result: any): { data: string; mimeType: string } | null
}


export interface VideoProviderAdapter {
  provider: string

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest | Promise<ProviderRequest>

  executeGenerate?(config: AIConfig, record: VideoGenerationRecord): Promise<VideoGenerateExecution>

  parseGenerateResponse(result: any): VideoGenResponse

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest

  parsePollResponse(result: any): VideoPollResponse

  extractVideoUrl(result: any): string | null
}



export interface ProviderRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: any
}

export interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

export interface ImageGenerationRecord {
  id: number
  model?: string | null
  prompt?: string | null
  size?: string | null
  frameType?: string | null
  seed?: number | null
  referenceImages?: string | null

}

export interface VideoGenerationRecord {
  id: number
  model?: string | null
  prompt?: string | null
  referenceMode?: string | null
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  referenceImageUrls?: string | null
  duration?: number | null
  aspectRatio?: string | null

}

export interface ImageGenResponse {
  isAsync: boolean
  taskId?: string

  imageUrl?: string
}

export interface ImagePollResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  imageUrl?: string
  error?: string
}

export interface VideoGenResponse {
  isAsync: boolean
  taskId?: string
  videoUrl?: string
}

export interface VideoGenerateExecution {
  kind: 'response' | 'binary'
  response?: VideoGenResponse
  binary?: {
    data: ArrayBuffer
    mimeType?: string
    filename?: string
  }
}

export interface VideoPollResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  videoUrl?: string
  error?: string
}


export interface TTSProviderAdapter {
  provider: string

  buildGenerateRequest(config: AIConfig, params: any): ProviderRequest

  parseResponse(result: any): {
    audioHex?: string
    audioBase64?: string
    audioLength: number
    sampleRate: number
    bitrate: number
    format: string
    channel: number
    mimeType?: string
  }
}
