
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { STORAGE_ROOT, resolveStoragePath } from '../utils/storage.js'
import { generateTTS } from './tts-generation.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { getAudioConfigById } from './ai.js'
import { getStoryboardComposeSource } from './storyboard-compose-source.js'
import { resolveStoryboardVoiceSelection } from './storyboard-voice.js'
import { invalidateEpisodeMerges } from './merge-status.js'
import { getStoryboardComposeDuration } from './compose-duration.js'
import { getStoryboardRenderAudioCues } from './audio-cues.js'
import { mixAudioCuesIntoVideo } from './audio-cue-mix.js'
import { getStoryboardSpokenDialogue } from './storyboard-speech.js'
import { buildTimedSubtitleCues } from './subtitle-timing.js'
import { buildImageMotionFilters, resolveStoryboardMotionPreset } from './storyboard-motion.js'
import { normalizeStoryboardSubtitleMode } from './storyboard-subtitles.js'

let subtitleFilterSupport: boolean | null = null
const IGNORE_TTS_SPEAKERS = /^(sfx|sound ?effect|bgm|ambient)$/i
const IGNORE_TTS_TEXT = /^(none|null|n\/a|na|bgm|sfx|ambient)$/i
const AMBIENT_AUDIO_VOLUME = 0.08
const AMBIENT_AUDIO_FADE_IN_SECONDS = 0.08
const AMBIENT_AUDIO_FADE_OUT_SECONDS = 0.14
const IMAGE_FALLBACK_FRAME_RATE = 24
const TTS_COMPRESS_THRESHOLD = 0.08
const TTS_COMPRESS_RATIO = 3.2
const TTS_COMPRESS_ATTACK_MS = 6
const TTS_COMPRESS_RELEASE_MS = 140
const TTS_LIMIT = 0.92
const TTS_OUTPUT_GAIN = 0.96
function toAbsPath(relativePath: string): string {
  return resolveStoragePath(relativePath)
}

function supportsSubtitleFilter(): boolean {
  if (subtitleFilterSupport != null) return subtitleFilterSupport
  try {
    const output = execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' })
    subtitleFilterSupport = /\bsubtitles\b/.test(output)
  } catch {
    subtitleFilterSupport = false
  }
  return subtitleFilterSupport
}

function parseDialogueForTTS(dialogue?: string | null) {
  const raw = dialogue?.trim() || ''
  if (!raw) return { speaker: '', pureText: '', ignorable: true }
  const speakerMatch = raw.match(/^(.+?)[:：]/)
  const speaker = speakerMatch ? speakerMatch[1].replace(/[（(].+?[)）]/g, '').trim() : ''
  const pureText = raw.replace(/^.+?[:：]\s*/, '').replace(/[（(].+?[)）]/g, '').trim()
  const ignorable = (!!speaker && IGNORE_TTS_SPEAKERS.test(speaker)) || !pureText || IGNORE_TTS_TEXT.test(pureText)
  return { speaker, pureText, ignorable }
}

function ffprobeMedia(filePath: string): Promise<{ duration: number; hasAudio: boolean; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err)
        return
      }

      const duration = Number(metadata?.format?.duration || 0)
      const videoStream = Array.isArray(metadata?.streams)
        ? metadata.streams.find((stream: any) => stream?.codec_type === 'video')
        : null
      const hasAudio = Array.isArray(metadata?.streams)
        ? metadata.streams.some((stream: any) => stream?.codec_type === 'audio')
        : false
      resolve({
        duration,
        hasAudio,
        width: Number(videoStream?.width || 0),
        height: Number(videoStream?.height || 0),
      })
    })
  })
}

function formatSrtTimestamp(seconds: number) {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(totalMs / 3600000)
  const minutes = Math.floor((totalMs % 3600000) / 60000)
  const secs = Math.floor((totalMs % 60000) / 1000)
  const millis = totalMs % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

function formatDuration(seconds: number) {
  return Math.max(0.1, seconds).toFixed(3)
}

function formatFadeStart(durationSeconds: number, fadeSeconds: number) {
  return Math.max(0, durationSeconds - fadeSeconds).toFixed(3)
}

function getNormalizedTtsFilter(inputLabel: string, outputLabel: string, durationArg: string) {
  return `${inputLabel}aresample=async=1:first_pts=0,apad=whole_dur=${durationArg},atrim=0:${durationArg},` +
    `acompressor=threshold=${TTS_COMPRESS_THRESHOLD}:ratio=${TTS_COMPRESS_RATIO}:attack=${TTS_COMPRESS_ATTACK_MS}:release=${TTS_COMPRESS_RELEASE_MS}:makeup=1,` +
    `volume=${TTS_OUTPUT_GAIN},alimiter=limit=${TTS_LIMIT},asetpts=N/SR/TB${outputLabel}`
}

function getBaseVideoFilter(params: {
  sourceKind: 'image' | 'video'
  sourceDuration: number
  targetDuration: number
  sourceWidth?: number
  sourceHeight?: number
  motionPreset?: string | null
}) {
  const { sourceKind, sourceDuration, targetDuration, sourceWidth, sourceHeight, motionPreset } = params
  const filters: string[] = []

  if (sourceKind === 'video') {
    filters.push("scale='trunc(iw/2)*2':'trunc(ih/2)*2'")
    const extraFreezeDuration = Math.max(0, targetDuration - sourceDuration)
    if (extraFreezeDuration > 0.01) {
      filters.push(`tpad=stop_mode=clone:stop_duration=${formatDuration(extraFreezeDuration)}`)
    }
    filters.push(`trim=0:${formatDuration(targetDuration)}`)
  } else {
    filters.push(
      ...buildImageMotionFilters({
        preset: motionPreset,
        sourceWidth,
        sourceHeight,
        targetDurationSeconds: targetDuration,
        frameRate: IMAGE_FALLBACK_FRAME_RATE,
      }),
    )
    filters.push(`trim=0:${formatDuration(targetDuration)}`)
  }

  filters.push("scale='trunc(iw/2)*2':'trunc(ih/2)*2'")
  filters.push('format=yuv420p')
  filters.push('setpts=PTS-STARTPTS')
  return `[0:v]${filters.join(',')}`
}

function createSilentWavFile(durationSeconds: number) {
  const safeDuration = Math.max(0.1, durationSeconds)
  const sampleRate = 48000
  const channelCount = 2
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const frameCount = Math.max(1, Math.ceil(safeDuration * sampleRate))
  const dataSize = frameCount * channelCount * bytesPerSample
  const byteRate = sampleRate * channelCount * bytesPerSample
  const blockAlign = channelCount * bytesPerSample

  const audioDir = path.join(STORAGE_ROOT, 'temp-audio')
  fs.mkdirSync(audioDir, { recursive: true })
  const audioPath = path.join(audioDir, `${uuid()}.wav`)

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channelCount, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  fs.writeFileSync(audioPath, Buffer.concat([header, Buffer.alloc(dataSize)]))
  return audioPath
}


export async function composeStoryboard(storyboardId: number): Promise<string> {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error(`Storyboard ${storyboardId} not found`)
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
  const composeSource = getStoryboardComposeSource(sb)
  if (!composeSource) throw new Error(`Storyboard ${storyboardId} has no video or image to compose`)
  db.update(schema.storyboards)
    .set({ status: 'compose_processing', composedVideoUrl: null, updatedAt: now() })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()

  logTaskStart('ComposeTask', 'storyboard-compose', {
    storyboardId,
    storyboardNumber: sb.storyboardNumber,
    episodeId: sb.episodeId,
    sourceKind: composeSource.kind,
    sourceField: composeSource.field,
    motionPreset: resolveStoryboardMotionPreset(ep?.defaultMotionPreset, sb.motionPresetOverride),
  })

  const sourcePath = toAbsPath(composeSource.url)
  const sourceInfo = await ffprobeMedia(sourcePath).catch(() => ({ duration: 0, hasAudio: false, width: 0, height: 0 }))
  const sourceHasAudio = composeSource.kind === 'video' && sourceInfo.hasAudio
  let audioPath: string | null = null
  let subtitlePath: string | null = null
  let generatedSilentAudioPath: string | null = null
  let baseOutputPath: string | null = null
  const parsedDialogue = parseDialogueForTTS(getStoryboardSpokenDialogue(sb))
  const effectiveMotionPreset = resolveStoryboardMotionPreset(ep?.defaultMotionPreset, sb.motionPresetOverride)
  const effectiveSubtitleMode = normalizeStoryboardSubtitleMode(ep?.defaultSubtitleMode)
  let ttsDuration = 0


  try {
    if (!parsedDialogue.ignorable) {
      if (sb.ttsAudioUrl) {
        const existingAudioPath = toAbsPath(sb.ttsAudioUrl)
        if (fs.existsSync(existingAudioPath)) {
          audioPath = existingAudioPath
        }
      }

      if (!audioPath) {
        const audioProvider = getAudioConfigById(ep?.audioConfigId ?? null)?.provider || null
        const linkedCharacterIds = db.select().from(schema.storyboardCharacters)
          .where(eq(schema.storyboardCharacters.storyboardId, storyboardId)).all()
          .map((link) => link.characterId)
        const chars = ep
          ? db.select().from(schema.characters)
            .where(eq(schema.characters.dramaId, ep.dramaId)).all()
          : []
        const linkedCharacters = chars.filter((char) => linkedCharacterIds.includes(char.id))
        const { voiceId, source: voiceSource } = resolveStoryboardVoiceSelection({
          provider: audioProvider,
          speaker: parsedDialogue.speaker,
          linkedCharacters,
          allCharacters: chars,
        })

        const pureDialogue = parsedDialogue.pureText
        if (pureDialogue) {
          logTaskProgress('ComposeTask', 'generate-inline-tts', { storyboardId, voiceId, voiceSource, textPreview: pureDialogue.slice(0, 40) })
          const ttsPath = await generateTTS({ text: pureDialogue, voice: voiceId, configId: ep?.audioConfigId ?? undefined })
          audioPath = toAbsPath(ttsPath)
          db.update(schema.storyboards).set({ ttsAudioUrl: ttsPath, updatedAt: now() })
            .where(eq(schema.storyboards.id, storyboardId)).run()
        }
      }

      if (audioPath) {
        const audioInfo = await ffprobeMedia(audioPath)
        ttsDuration = audioInfo.duration
      }
    }

    const hasSpokenAudio = !parsedDialogue.ignorable && ttsDuration > 0
    const videoDuration = getStoryboardComposeDuration({
      sourceKind: composeSource.kind,
      plannedDuration: sb.duration,
      sourceDuration: sourceInfo.duration,
      ttsDuration,
      hasSpokenAudio,
    })

    if (!sourceHasAudio && !audioPath) {
      generatedSilentAudioPath = createSilentWavFile(videoDuration)
      audioPath = generatedSilentAudioPath
    }


    if (!parsedDialogue.ignorable && effectiveSubtitleMode === 'dynamic') {
      const srtDir = path.join(STORAGE_ROOT, 'subtitles')
      fs.mkdirSync(srtDir, { recursive: true })
      const srtFilename = `${uuid()}.srt`
      subtitlePath = path.join(srtDir, srtFilename)

      const pureText = parsedDialogue.pureText
      const subtitleEnd = Math.min(
        videoDuration,
        Math.max(0.4, ttsDuration || videoDuration),
      )
      const timedSubtitleCues = buildTimedSubtitleCues(pureText, subtitleEnd)
      const srtContent = timedSubtitleCues
        .map((cue, index) => `${index + 1}\n${formatSrtTimestamp(cue.startSeconds)} --> ${formatSrtTimestamp(cue.endSeconds)}\n${cue.text}\n`)
        .join('\n')
      fs.writeFileSync(subtitlePath, srtContent, 'utf-8')

      const srtRelative = `static/subtitles/${srtFilename}`
      db.update(schema.storyboards).set({ subtitleUrl: srtRelative, updatedAt: now() })
        .where(eq(schema.storyboards.id, storyboardId)).run()
    } else if (sb.subtitleUrl) {
      db.update(schema.storyboards).set({ subtitleUrl: null, updatedAt: now() })
        .where(eq(schema.storyboards.id, storyboardId)).run()
    }


    const outputDir = path.join(STORAGE_ROOT, 'composed')
    fs.mkdirSync(outputDir, { recursive: true })
    const outputFilename = `${uuid()}.mp4`
    const outputPath = path.join(outputDir, outputFilename)
    const renderAudioCues = await getStoryboardRenderAudioCues(storyboardId)
    const needsRenderCueMix = renderAudioCues.length > 0
    baseOutputPath = needsRenderCueMix ? path.join(outputDir, `${uuid()}.base.mp4`) : outputPath
    const renderTargetPath = baseOutputPath

    await new Promise<void>((resolve, reject) => {
      let cmd = ffmpeg().input(sourcePath)

      if (composeSource.kind === 'image') {
        cmd = cmd.inputOptions([`-loop 1`, `-framerate ${IMAGE_FALLBACK_FRAME_RATE}`])
      }

      if (audioPath) {
        cmd = cmd.input(audioPath)
      }

      const complexFilters: string[] = []
      let videoMap = '[vout]'
      let audioMap: string | null = null

      const baseVideoFilter = getBaseVideoFilter({
        sourceKind: composeSource.kind,
        sourceDuration: sourceInfo.duration || 0,
        targetDuration: videoDuration,
        sourceWidth: sourceInfo.width || 0,
        sourceHeight: sourceInfo.height || 0,
        motionPreset: effectiveMotionPreset,
      })
      if (subtitlePath && supportsSubtitleFilter()) {
        const escapedPath = subtitlePath
          .replace(/\\/g, '/')
          .replace(/:/g, '\\:')
          .replace(/'/g, "\\'")
        const forceStyle = 'FontSize=20\\,PrimaryColour=&HFFFFFF&\\,OutlineColour=&H000000&\\,Outline=2'
        complexFilters.push(`${baseVideoFilter},subtitles=filename='${escapedPath}':force_style='${forceStyle}'[vout]`)
      } else if (subtitlePath) {
        logTaskProgress('ComposeTask', 'subtitle-filter-unavailable', {
          storyboardId,
          subtitlePath,
        })
        complexFilters.push(`${baseVideoFilter}[vout]`)
      } else {
        complexFilters.push(`${baseVideoFilter}[vout]`)
      }

      if (sourceHasAudio && audioPath) {
        const durationArg = formatDuration(videoDuration)
        const ambientFadeOutStart = formatFadeStart(videoDuration, AMBIENT_AUDIO_FADE_OUT_SECONDS)
        complexFilters.push(`[0:a]aresample=async=1:first_pts=0,volume=${AMBIENT_AUDIO_VOLUME},apad=whole_dur=${durationArg},atrim=0:${durationArg},afade=t=in:st=0:d=${AMBIENT_AUDIO_FADE_IN_SECONDS},afade=t=out:st=${ambientFadeOutStart}:d=${AMBIENT_AUDIO_FADE_OUT_SECONDS},asetpts=N/SR/TB[bgm]`)
        complexFilters.push(getNormalizedTtsFilter('[1:a]', '[tts]', durationArg))
        complexFilters.push('[bgm][tts]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]')
        audioMap = '[aout]'
      } else if (audioPath) {
        const durationArg = formatDuration(videoDuration)
        complexFilters.push(getNormalizedTtsFilter('[1:a]', '[aout]', durationArg))
        audioMap = '[aout]'
      } else if (sourceHasAudio) {
        const durationArg = formatDuration(videoDuration)
        const ambientFadeOutStart = formatFadeStart(videoDuration, AMBIENT_AUDIO_FADE_OUT_SECONDS)
        complexFilters.push(`[0:a]aresample=async=1:first_pts=0,volume=${AMBIENT_AUDIO_VOLUME},apad=whole_dur=${durationArg},atrim=0:${durationArg},afade=t=in:st=0:d=${AMBIENT_AUDIO_FADE_IN_SECONDS},afade=t=out:st=${ambientFadeOutStart}:d=${AMBIENT_AUDIO_FADE_OUT_SECONDS},asetpts=N/SR/TB[aout]`)
        audioMap = '[aout]'
      }

      if (complexFilters.length > 0) {
        cmd = cmd.complexFilter(complexFilters)
      }

      const outputOptions = [
        '-map', videoMap,
        '-t', formatDuration(videoDuration),
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ]

      if (composeSource.kind === 'image') {
        outputOptions.push('-r', String(IMAGE_FALLBACK_FRAME_RATE))
      }

      if (audioMap) {
        outputOptions.push('-map', audioMap, '-c:a', 'aac', '-ar', '48000', '-b:a', '192k')
      } else {
        outputOptions.push('-an')
      }

      cmd.outputOptions(outputOptions)
        .output(renderTargetPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })

    if (needsRenderCueMix) {
      await mixAudioCuesIntoVideo({
        inputVideoPath: baseOutputPath,
        outputVideoPath: outputPath,
        cues: renderAudioCues,
        videoDurationSeconds: videoDuration,
        dialogueWindows: hasSpokenAudio
          ? [{ startSeconds: 0, endSeconds: Math.min(videoDuration, Math.max(0.3, ttsDuration || videoDuration)) }]
          : [],
        normalizeAudio: false,
        duckingRatio: 0.4,
      })
      if (baseOutputPath && fs.existsSync(baseOutputPath)) fs.rmSync(baseOutputPath, { force: true })
      baseOutputPath = null
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error('FFmpeg compose finished without producing the output file')
    }

    const composedRelative = `static/composed/${outputFilename}`
    db.update(schema.storyboards).set({
      composedVideoUrl: composedRelative,
      status: 'compose_completed',
      lastComposedMotionPreset: effectiveMotionPreset,
      lastComposedSubtitleMode: effectiveSubtitleMode,
      updatedAt: now(),
    })
      .where(eq(schema.storyboards.id, storyboardId)).run()
    invalidateEpisodeMerges(sb.episodeId)

    logTaskSuccess('ComposeTask', 'storyboard-compose', {
      storyboardId,
      storyboardNumber: sb.storyboardNumber,
      output: composedRelative,
    })
    if (needsRenderCueMix && baseOutputPath && fs.existsSync(baseOutputPath)) fs.rmSync(baseOutputPath, { force: true })
    if (generatedSilentAudioPath && fs.existsSync(generatedSilentAudioPath)) fs.rmSync(generatedSilentAudioPath, { force: true })
    return composedRelative
  } catch (err) {
    db.update(schema.storyboards)
      .set({ status: 'compose_failed', composedVideoUrl: null, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
    if (baseOutputPath && fs.existsSync(baseOutputPath)) fs.rmSync(baseOutputPath, { force: true })
    if (generatedSilentAudioPath && fs.existsSync(generatedSilentAudioPath)) fs.rmSync(generatedSilentAudioPath, { force: true })
    throw err
  }
}
