import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolveCuePlayback, type ResolvedAudioCue } from './audio-cues.js'

export type DialogueWindow = {
  startSeconds: number
  endSeconds: number
}

type PlaybackCue = Awaited<ReturnType<typeof resolveCuePlayback>> & {
  effectiveStartSeconds: number
  effectiveDurationSeconds: number
  sourceTrimSeconds: number
}

type MixAudioCuesIntoVideoOptions = {
  inputVideoPath: string
  outputVideoPath: string
  cues: ResolvedAudioCue[]
  videoDurationSeconds: number
  dialogueWindows?: DialogueWindow[]
  normalizeAudio?: boolean
  duckingRatio?: number
}

function formatSeconds(value: number, minimum = 0) {
  return Math.max(minimum, Number(value) || 0).toFixed(3)
}

function dbToLinear(db: number) {
  return Math.pow(10, (Number(db) || 0) / 20)
}

function getCueLayerType(cue: { layerType?: string | null }) {
  return String(cue?.layerType || '').trim().toLowerCase()
}

function getLayerTrimDb(layerType: string) {
  if (layerType === 'score') return -18
  if (layerType === 'ambience') return -26
  if (layerType === 'sfx') return -6
  return 0
}

function getDefaultFadeInSeconds(layerType: string, explicitSeconds: number, effectiveDurationSeconds: number) {
  if (explicitSeconds > 0.01) return Math.min(effectiveDurationSeconds, explicitSeconds)
  if (layerType === 'score') return Math.min(effectiveDurationSeconds, 1.2)
  if (layerType === 'ambience') return Math.min(effectiveDurationSeconds, 0.8)
  if (layerType === 'sfx') return Math.min(effectiveDurationSeconds, 0.05)
  return 0
}

function getDefaultFadeOutSeconds(layerType: string, explicitSeconds: number, effectiveDurationSeconds: number) {
  if (explicitSeconds > 0.01) return Math.min(effectiveDurationSeconds, explicitSeconds)
  if (layerType === 'score') return Math.min(effectiveDurationSeconds, 1.2)
  if (layerType === 'ambience') return Math.min(effectiveDurationSeconds, 0.8)
  if (layerType === 'sfx') return Math.min(effectiveDurationSeconds, 0.18)
  return 0
}

function escapeExprValue(value: string) {
  return value.replace(/,/g, '\\,')
}

function buildCueVolumeExpression(
  cue: PlaybackCue,
  dialogueWindows: DialogueWindow[],
  scoreWindows: DialogueWindow[],
  defaultDialogueRatio: number,
) {
  void dialogueWindows
  void scoreWindows
  void defaultDialogueRatio
  const layerType = getCueLayerType(cue)
  const expr = dbToLinear(Number(cue.volumeDb || 0) + getLayerTrimDb(layerType)).toFixed(6)
  return escapeExprValue(expr)
}

async function buildPlaybackCues(
  cues: ResolvedAudioCue[],
  videoDurationSeconds: number,
): Promise<PlaybackCue[]> {
  const playback = await Promise.all(cues.map((cue) => resolveCuePlayback(cue)))
  const result: PlaybackCue[] = []
  for (const cue of playback) {
    const startSeconds = Math.max(0, Number(cue.startMs || 0) / 1000)
    const sourceTrimSeconds = Math.max(0, Number((cue as any).sourceTrimMs || 0) / 1000)
    const remainingDuration = Math.max(0, videoDurationSeconds - startSeconds)
    if (!cue.absolutePath || remainingDuration <= 0.01) continue

    const rawAssetDuration = cue.durationSeconds ?? (cue.asset?.durationMs != null ? cue.asset.durationMs / 1000 : null)
    const targetDurationSeconds = cue.targetDurationMs != null
      ? Math.max(0, Number(cue.targetDurationMs || 0) / 1000)
      : cue.loop
        ? remainingDuration
        : Math.max(0, (rawAssetDuration ?? remainingDuration) - sourceTrimSeconds)

    const effectiveDurationSeconds = Math.min(
      remainingDuration,
      Math.max(0, targetDurationSeconds || Math.max(0, (rawAssetDuration || remainingDuration) - sourceTrimSeconds) || remainingDuration),
    )

    if (effectiveDurationSeconds <= 0.01) continue

    result.push({
      ...cue,
      absolutePath: cue.absolutePath,
      effectiveStartSeconds: startSeconds,
      effectiveDurationSeconds,
      sourceTrimSeconds,
    })
  }
  return result
}

function createFilterScriptFile(complexFilters: string[]) {
  const scriptPath = path.join(
    os.tmpdir(),
    `huobao-audio-mix-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.ffscript`,
  )
  fs.writeFileSync(scriptPath, `${complexFilters.join(';\n')}\n`, 'utf8')
  return scriptPath
}

export async function mixAudioCuesIntoVideo(options: MixAudioCuesIntoVideoOptions) {
  const dialogueWindows = options.dialogueWindows || []
  const normalizeAudio = options.normalizeAudio !== false
  const duckingRatio = Math.min(1, Math.max(0.05, Number(options.duckingRatio || 0.35)))
  const playbackCues = await buildPlaybackCues(options.cues, options.videoDurationSeconds)
  const scoreOverlapWindows: DialogueWindow[] = []

  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg().input(options.inputVideoPath)

    playbackCues.forEach((cue) => {
      cmd = cmd.input(cue.absolutePath!)
      if (cue.loop) {
        cmd = cmd.inputOptions(['-stream_loop', '-1'])
      }
    })

    const complexFilters: string[] = []
    complexFilters.push('[0:a]aformat=sample_rates=48000:channel_layouts=stereo,aresample=48000:async=1:first_pts=0[baseaudio]')

    const mixInputs = ['[baseaudio]']
    playbackCues.forEach((cue, index) => {
      const layerType = getCueLayerType(cue)
      const filterParts = [
        `[${index + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo`,
        `atrim=${formatSeconds(cue.sourceTrimSeconds, 0)}:${formatSeconds(cue.sourceTrimSeconds + cue.effectiveDurationSeconds, 0.01)}`,
        'asetpts=PTS-STARTPTS',
      ]

      const explicitFadeInSeconds = Math.max(0, Number(cue.fadeInMs || 0) / 1000)
      const explicitFadeOutSeconds = Math.max(0, Number(cue.fadeOutMs || 0) / 1000)
      const fadeInSeconds = getDefaultFadeInSeconds(layerType, explicitFadeInSeconds, cue.effectiveDurationSeconds)
      const fadeOutSeconds = getDefaultFadeOutSeconds(layerType, explicitFadeOutSeconds, cue.effectiveDurationSeconds)
      if (fadeInSeconds > 0.01) {
        filterParts.push(`afade=t=in:st=0:d=${formatSeconds(fadeInSeconds, 0.01)}`)
      }
      if (fadeOutSeconds > 0.01) {
        filterParts.push(`afade=t=out:st=${formatSeconds(Math.max(0, cue.effectiveDurationSeconds - fadeOutSeconds))}:d=${formatSeconds(fadeOutSeconds, 0.01)}`)
      }

      filterParts.push(`adelay=${Math.round(cue.effectiveStartSeconds * 1000)}|${Math.round(cue.effectiveStartSeconds * 1000)}`)

      const volumeExpr = buildCueVolumeExpression(cue, dialogueWindows, scoreOverlapWindows, duckingRatio)
      filterParts.push(`volume='${volumeExpr}'`)

      const outputLabel = `[cue${index}]`
      complexFilters.push(`${filterParts.join(',')}${outputLabel}`)
      mixInputs.push(outputLabel)
    })

    const mixedLabel = normalizeAudio ? '[mixedaudio]' : '[aout]'
    complexFilters.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0${mixedLabel}`)
    if (normalizeAudio) {
      complexFilters.push(`[mixedaudio]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`)
    }

    const filterScriptPath = createFilterScriptFile(complexFilters)

    cmd.outputOptions([
        '-filter_complex_script', filterScriptPath,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-ar', '48000',
        '-b:a', '192k',
        '-movflags', '+faststart',
      ])
      .output(options.outputVideoPath)
      .on('end', () => {
        if (fs.existsSync(filterScriptPath)) fs.rmSync(filterScriptPath, { force: true })
        resolve()
      })
      .on('error', (err) => {
        if (fs.existsSync(filterScriptPath)) fs.rmSync(filterScriptPath, { force: true })
        reject(err)
      })
      .run()
  })
}
