import { describe, expect, it } from 'vitest'
import {
  buildImageMotionFilters,
  normalizeStoryboardMotionPreset,
  resolveStoryboardMotionPreset,
} from './storyboard-motion.js'

describe('storyboard motion', () => {
  it('falls back to episode default when override is empty', () => {
    expect(resolveStoryboardMotionPreset('slow_push', null)).toBe('slow_push')
    expect(resolveStoryboardMotionPreset(undefined, '')).toBe('drift')
  })

  it('lets the shot-level override win', () => {
    expect(resolveStoryboardMotionPreset('drift', 'hold')).toBe('hold')
  })

  it('normalizes unknown values back to drift', () => {
    expect(normalizeStoryboardMotionPreset('unknown')).toBe('drift')
  })

  it('builds a static filter chain for hold', () => {
    const filters = buildImageMotionFilters({
      preset: 'hold',
      sourceWidth: 1345,
      sourceHeight: 769,
      targetDurationSeconds: 8.2,
    })

    expect(filters.join(',')).toContain("scale='1344':'768'")
    expect(filters.join(',')).not.toContain('sin(')
    expect(filters.join(',')).not.toContain('eval=frame')
  })

  it('builds a drift filter chain with crop motion', () => {
    const filters = buildImageMotionFilters({
      preset: 'drift',
      sourceWidth: 1280,
      sourceHeight: 720,
      targetDurationSeconds: 10,
    })

    expect(filters.join(',')).toContain("crop='1280':'720'")
    expect(filters.join(',')).toContain('sin(')
    expect(filters.join(',')).toContain('cos(')
  })

  it('builds zoom-like filters for push and pull', () => {
    const push = buildImageMotionFilters({
      preset: 'slow_push',
      sourceWidth: 1280,
      sourceHeight: 720,
      targetDurationSeconds: 11.6,
    }).join(',')
    const pull = buildImageMotionFilters({
      preset: 'slow_pull',
      sourceWidth: 1280,
      sourceHeight: 720,
      targetDurationSeconds: 11.6,
    }).join(',')

    expect(push).toContain('zoompan=')
    expect(push).toContain('cos(')
    expect(push).toContain('s=1280x720')
    expect(pull).toContain('zoompan=')
    expect(pull).toContain('cos(')
    expect(pull).toContain('s=1280x720')
  })
})
