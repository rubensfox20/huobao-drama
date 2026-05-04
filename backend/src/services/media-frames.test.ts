import { describe, expect, it } from 'vitest'
import { resolveVideoFrameCaptureTime } from './media-frames.js'

describe('media frame helpers', () => {
  it('captures the first frame at zero seconds', () => {
    expect(resolveVideoFrameCaptureTime(5, 'first')).toBe(0)
  })

  it('falls back to zero for very short videos when capturing the last frame', () => {
    expect(resolveVideoFrameCaptureTime(0, 'last')).toBe(0)
    expect(resolveVideoFrameCaptureTime(0.2, 'last')).toBe(0)
  })

  it('captures the last frame near the end without exceeding duration', () => {
    const captureTime = resolveVideoFrameCaptureTime(5, 'last')
    expect(captureTime).toBeGreaterThan(4.7)
    expect(captureTime).toBeLessThanOrEqual(5)
  })
})
