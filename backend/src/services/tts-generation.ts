
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { getAudioConfigById } from './ai.js'
import { getTTSAdapter } from './adapters/registry.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, redactUrl } from '../utils/task-logger.js'
import { runProviderOperation } from './provider-execution.js'
import { STORAGE_ROOT } from '../utils/storage.js'

interface TTSParams {
  text: string
  voice: string
  model?: string
  speed?: number
  emotion?: string
  configId?: number | null
  workflowJobId?: number | null
}


export async function generateTTS(params: TTSParams): Promise<string> {
  const config = getAudioConfigById(params.configId)
  const adapter = getTTSAdapter(config.provider)

  logTaskStart('AudioTask', 'tts-generate', {
    provider: config.provider,
    voice: params.voice,
    model: params.model || config.model,
    textPreview: params.text.slice(0, 50),
    textLength: params.text.length,
  })
  logTaskPayload('AudioTask', 'tts params', {
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    params,
  })

  const { url, method, headers, body } = adapter.buildGenerateRequest(config, params)
  logTaskProgress('AudioTask', 'request', {
    provider: config.provider,
    voice: params.voice,
    method,
    url: redactUrl(url),
    model: params.model || config.model,
  })
  logTaskPayload('AudioTask', 'request payload', {
    method,
    url,
    headers,
    body,
  })

  const resp = await runProviderOperation({
    workflowJobId: params.workflowJobId,
    serviceType: 'audio',
    provider: config.provider,
    model: params.model || config.model,
    operation: 'tts-generate',
    metadata: { voice: params.voice, url: redactUrl(url) },
  }, async () => fetch(url, {
    method,
    headers,
    body: JSON.stringify(body),
  }))

  if (!resp.ok) {
    const errText = await resp.text()
    logTaskError('AudioTask', 'tts-generate', { provider: config.provider, voice: params.voice, status: resp.status, error: errText })
    throw new Error(`TTS API error ${resp.status}: ${errText}`)
  }

  const result = await resp.json()
  const parsed = adapter.parseResponse(result)

  const { buffer, extension } = normalizeTTSOutput(parsed)


  const audioDir = path.join(STORAGE_ROOT, 'audio')
  fs.mkdirSync(audioDir, { recursive: true })
  const filename = `${uuid()}.${extension}`
  const filePath = path.join(audioDir, filename)
  fs.writeFileSync(filePath, buffer)

  const relativePath = `static/audio/${filename}`
  logTaskSuccess('AudioTask', 'tts-saved', {
    provider: config.provider,
    voice: params.voice,
    path: relativePath,
    bytes: buffer.length,
    audioMs: parsed.audioLength,
  })
  return relativePath
}


export async function generateVoiceSample(characterName: string, voiceId: string, configId?: number | null, workflowJobId?: number | null): Promise<string> {
  const sampleText = `Ola, eu sou ${characterName}. Esta e uma previa da minha voz em portugues do Brasil.`
  return generateTTS({ text: sampleText, voice: voiceId, configId, workflowJobId })
}

function normalizeTTSOutput(parsed: {
  audioHex?: string
  audioBase64?: string
  sampleRate: number
  bitrate: number
  format: string
  channel: number
  mimeType?: string
}) {
  if (parsed.audioHex) {
    return {
      buffer: Buffer.from(parsed.audioHex, 'hex'),
      extension: parsed.format || 'mp3',
    }
  }

  if (!parsed.audioBase64) {
    throw new Error('No audio payload returned by TTS provider')
  }

  const rawBuffer = Buffer.from(parsed.audioBase64, 'base64')
  if (shouldWrapPcmAsWav(parsed.mimeType)) {
    return {
      buffer: wrapPcm16LeAsWav(rawBuffer, parsed.sampleRate || 24000, parsed.channel || 1),
      extension: 'wav',
    }
  }

  return {
    buffer: rawBuffer,
    extension: mimeTypeToExtension(parsed.mimeType) || parsed.format || 'wav',
  }
}

function shouldWrapPcmAsWav(mimeType?: string) {
  const normalized = String(mimeType || '').toLowerCase()
  return !normalized || normalized.includes('audio/l16') || normalized.includes('audio/pcm')
}

function mimeTypeToExtension(mimeType?: string) {
  const normalized = String(mimeType || '').toLowerCase()
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3'
  if (normalized.includes('ogg')) return 'ogg'
  return ''
}

function wrapPcm16LeAsWav(pcmBuffer: Buffer, sampleRate: number, channels: number) {
  const bitsPerSample = 16
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
  const dataSize = pcmBuffer.length
  const header = Buffer.alloc(44)

  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  return Buffer.concat([header, pcmBuffer])
}
