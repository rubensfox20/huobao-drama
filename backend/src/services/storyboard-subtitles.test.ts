import { describe, expect, it } from 'vitest'
import { normalizeStoryboardSubtitleMode } from './storyboard-subtitles.js'

describe('storyboard-subtitles', () => {
  it('defaults to dynamic for empty values', () => {
    expect(normalizeStoryboardSubtitleMode()).toBe('dynamic')
    expect(normalizeStoryboardSubtitleMode('')).toBe('dynamic')
  })

  it('accepts supported modes', () => {
    expect(normalizeStoryboardSubtitleMode('dynamic')).toBe('dynamic')
    expect(normalizeStoryboardSubtitleMode('off')).toBe('off')
  })

  it('normalizes unknown values back to dynamic', () => {
    expect(normalizeStoryboardSubtitleMode('classic')).toBe('dynamic')
  })
})
