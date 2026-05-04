import { describe, expect, it } from 'vitest'
import { canUseMergeTransition, getSafeMergeTransitionDuration, resolveMergeTransition } from './merge-transition.js'

describe('merge transition', () => {
  it('defaults to cut for unknown values', () => {
    expect(resolveMergeTransition('unknown').kind).toBe('cut')
  })

  it('resolves fade as an xfade-based transition', () => {
    const transition = resolveMergeTransition('fade')
    expect(transition.kind).toBe('fade')
    expect(transition.xfadeTransition).toBe('fade')
    expect(transition.durationSeconds).toBeGreaterThan(0)
  })

  it('resolves additional lightweight transitions safely', () => {
    expect(resolveMergeTransition('slideright').xfadeTransition).toBe('slideright')
    expect(resolveMergeTransition('smoothleft').xfadeTransition).toBe('smoothleft')
    expect(resolveMergeTransition('circleopen').xfadeTransition).toBe('circleopen')
  })

  it('blocks transitions when clips are too short', () => {
    const transition = resolveMergeTransition('wipeleft')
    expect(canUseMergeTransition([0.2, 5], transition)).toBe(false)
  })

  it('clamps transition duration to the shorter side safely', () => {
    expect(getSafeMergeTransitionDuration(0.4, 4, 0.35)).toBeCloseTo(0.35, 5)
    expect(getSafeMergeTransitionDuration(0.2, 4, 0.35)).toBeCloseTo(0.15, 5)
  })
})
