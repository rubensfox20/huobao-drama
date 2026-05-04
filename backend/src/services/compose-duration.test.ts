import { describe, expect, it } from 'vitest'
import { getStoryboardComposeDuration } from './compose-duration.js'

describe('compose duration', () => {
  it('matches spoken audio duration exactly when the shot has dialogue audio', () => {
    expect(getStoryboardComposeDuration({
      sourceKind: 'video',
      plannedDuration: 12,
      sourceDuration: 12,
      ttsDuration: 6.02,
      hasSpokenAudio: true,
    })).toBe(6.02)
  })

  it('keeps the planned duration for shots without spoken audio', () => {
    expect(getStoryboardComposeDuration({
      sourceKind: 'video',
      plannedDuration: 9,
      sourceDuration: 14,
      hasSpokenAudio: false,
    })).toBe(9)
  })

  it('falls back to source duration for silent video shots without a planned duration', () => {
    expect(getStoryboardComposeDuration({
      sourceKind: 'video',
      sourceDuration: 7.4,
      hasSpokenAudio: false,
    })).toBe(7.4)
  })
})
