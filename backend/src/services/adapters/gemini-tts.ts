/**
 * Gemini TTS Adapter
 * API: POST /v1beta/models/{model}:generateContent
 * Docs: https://ai.google.dev/gemini-api/docs/speech-generation
 */
import type { TTSProviderAdapter } from './types'
import { joinProviderUrl } from './url'

export interface GeminiTTSParams {
  text: string
  voice: string
  model?: string
}

export class GeminiTTSAdapter implements TTSProviderAdapter {
  readonly provider = 'gemini'

  buildGenerateRequest(config: any, params: GeminiTTSParams) {
    const model = params.model || config.model || 'gemini-2.5-flash-preview-tts'
    const voiceName = params.voice || 'Kore'
    const url = new URL(joinProviderUrl(config.baseUrl, '/v1beta', `/models/${model}:generateContent`))
    url.searchParams.set('key', config.apiKey)

    return {
      url: url.toString(),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body: {
        contents: [{ parts: [{ text: params.text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
        model,
      },
    }
  }

  parseResponse(result: any) {
    if (result?.error) {
      throw new Error(result.error.message || 'Gemini TTS failed')
    }

    const parts = result?.candidates?.[0]?.content?.parts || []
    for (const part of parts) {
      const inline = part.inlineData || part.inline_data
      if (!inline?.data) continue

      const mimeType = inline.mimeType || inline.mime_type || 'audio/L16;rate=24000'
      const sampleRate = parseSampleRate(mimeType)
      const bytes = Buffer.from(inline.data, 'base64').length

      return {
        audioBase64: inline.data,
        audioLength: estimateAudioLengthMs(bytes, sampleRate, 1, 16),
        sampleRate,
        bitrate: sampleRate * 16,
        format: 'wav',
        channel: 1,
        mimeType,
      }
    }

    throw new Error('No audio data in Gemini TTS response')
  }
}

function parseSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/i)
  return match ? Number(match[1]) : 24000
}

function estimateAudioLengthMs(bytes: number, sampleRate: number, channels: number, bitsPerSample: number) {
  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8)
  if (!bytesPerSecond) return 0
  return Math.round((bytes / bytesPerSecond) * 1000)
}
