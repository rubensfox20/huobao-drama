import { describe, expect, it } from 'vitest'
import {
  getEffectiveStoryboardReviewStatus,
  normalizeStoryboardContinuityMode,
  normalizeStoryboardReviewStatus,
  storyboardHasBaseVisual,
  storyboardNeedsReview,
} from './storyboard-review.js'

describe('storyboard review helpers', () => {
  it('normalizes known review statuses', () => {
    expect(normalizeStoryboardReviewStatus('approved')).toBe('approved')
    expect(normalizeStoryboardReviewStatus('PENDING_REVIEW')).toBe('pending_review')
    expect(normalizeStoryboardReviewStatus('unknown')).toBeNull()
  })

  it('treats missing legacy review status as approved', () => {
    expect(getEffectiveStoryboardReviewStatus({ reviewStatus: null })).toBe('approved')
    expect(storyboardNeedsReview({ reviewStatus: null })).toBe(false)
  })

  it('normalizes continuity mode with auto fallback', () => {
    expect(normalizeStoryboardContinuityMode('force')).toBe('force')
    expect(normalizeStoryboardContinuityMode('OFF')).toBe('off')
    expect(normalizeStoryboardContinuityMode('')).toBe('auto')
  })

  it('detects when a storyboard has a base visual', () => {
    expect(storyboardHasBaseVisual({ firstFrameImage: 'static/frames/a.jpg' })).toBe(true)
    expect(storyboardHasBaseVisual({ lastFrameImage: 'static/frames/b.jpg' })).toBe(true)
    expect(storyboardHasBaseVisual({ composedImage: 'static/images/c.jpg' })).toBe(true)
    expect(storyboardHasBaseVisual({})).toBe(false)
  })
})
