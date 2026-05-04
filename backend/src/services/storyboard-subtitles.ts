export const STORYBOARD_SUBTITLE_MODES = ['dynamic', 'off'] as const

export type StoryboardSubtitleMode = (typeof STORYBOARD_SUBTITLE_MODES)[number]

export const DEFAULT_STORYBOARD_SUBTITLE_MODE: StoryboardSubtitleMode = 'dynamic'

export function normalizeStoryboardSubtitleMode(value?: string | null): StoryboardSubtitleMode {
  const text = String(value || '').trim().toLowerCase()
  return STORYBOARD_SUBTITLE_MODES.includes(text as StoryboardSubtitleMode)
    ? (text as StoryboardSubtitleMode)
    : DEFAULT_STORYBOARD_SUBTITLE_MODE
}
