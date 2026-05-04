export const STORYBOARD_MOTION_PRESETS = ['hold', 'drift', 'slow_push', 'slow_pull'] as const

export type StoryboardMotionPreset = typeof STORYBOARD_MOTION_PRESETS[number]

export const DEFAULT_STORYBOARD_MOTION_PRESET: StoryboardMotionPreset = 'drift'

function evenDimension(value: number | null | undefined, fallback: number) {
  const safe = Number(value || 0)
  if (!Number.isFinite(safe) || safe <= 0) return fallback
  const rounded = Math.max(2, Math.round(safe))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

export function isStoryboardMotionPreset(value: unknown): value is StoryboardMotionPreset {
  return STORYBOARD_MOTION_PRESETS.includes(String(value || '').trim() as StoryboardMotionPreset)
}

export function normalizeStoryboardMotionPreset(
  value: unknown,
  fallback: StoryboardMotionPreset = DEFAULT_STORYBOARD_MOTION_PRESET,
): StoryboardMotionPreset {
  return isStoryboardMotionPreset(value) ? value : fallback
}

export function resolveStoryboardMotionPreset(
  episodeDefaultPreset?: unknown,
  storyboardOverridePreset?: unknown,
): StoryboardMotionPreset {
  if (isStoryboardMotionPreset(storyboardOverridePreset)) {
    return storyboardOverridePreset
  }
  return normalizeStoryboardMotionPreset(episodeDefaultPreset)
}

type BuildImageMotionFiltersParams = {
  preset?: unknown
  sourceWidth?: number | null
  sourceHeight?: number | null
  targetDurationSeconds: number
  frameRate?: number
}

export function buildImageMotionFilters({
  preset,
  sourceWidth,
  sourceHeight,
  targetDurationSeconds,
  frameRate = 24,
}: BuildImageMotionFiltersParams) {
  const resolvedPreset = normalizeStoryboardMotionPreset(preset)
  const width = evenDimension(sourceWidth, 1280)
  const height = evenDimension(sourceHeight, 720)
  const duration = Math.max(0.1, Number(targetDurationSeconds || 0.1))
  const durationArg = duration.toFixed(3)
  const frameCount = Math.max(2, Math.round(duration * frameRate))

  if (resolvedPreset === 'hold') {
    return [
      `fps=${frameRate}`,
      `scale='${width}':'${height}'`,
    ]
  }

  if (resolvedPreset === 'drift') {
    const overscan = 1.08
    const scaledWidth = evenDimension(width * overscan, width)
    const scaledHeight = evenDimension(height * overscan, height)
    return [
      `fps=${frameRate}`,
      `scale='${scaledWidth}':'${scaledHeight}'`,
      `crop='${width}':'${height}':x='(in_w-out_w)/2+sin(t*0.33)*((in_w-out_w)/6)':y='(in_h-out_h)/2+cos(t*0.21)*((in_h-out_h)/8)'`,
    ]
  }

  if (resolvedPreset === 'slow_push') {
    const overscan = 1.08
    const scaledWidth = evenDimension(width * overscan, width)
    const scaledHeight = evenDimension(height * overscan, height)
    const easing = `0.5-0.5*cos(PI*min(on/${frameCount - 1},1))`
    return [
      `scale='${scaledWidth}':'${scaledHeight}'`,
      `zoompan=z='1+0.06*(${easing})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${frameRate}`,
    ]
  }

  const overscan = 1.08
  const scaledWidth = evenDimension(width * overscan, width)
  const scaledHeight = evenDimension(height * overscan, height)
  const easing = `0.5-0.5*cos(PI*min(on/${frameCount - 1},1))`
  return [
    `scale='${scaledWidth}':'${scaledHeight}'`,
    `zoompan=z='1.06-0.06*(${easing})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${frameRate}`,
  ]
}
