import { describe, expect, it } from 'vitest'
import { buildTimedSubtitleCues, chunkSubtitleText } from './subtitle-timing.js'

describe('subtitle timing', () => {
  it('splits long narration into sequential subtitle chunks', () => {
    const chunks = chunkSubtitleText('The ship breaks apart under cold rain, waves hammer the hull, and exhausted survivors stagger toward the beach as discipline collapses.')
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join(' ')).toContain('discipline collapses')
  })

  it('builds ordered subtitle timings within the requested window', () => {
    const cues = buildTimedSubtitleCues(
      'The ship breaks apart under cold rain, waves hammer the hull, and exhausted survivors stagger toward the beach as discipline collapses.',
      5.8,
    )

    expect(cues.length).toBeGreaterThan(1)
    expect(cues[0].startSeconds).toBeGreaterThanOrEqual(0.19)
    expect(cues.at(-1)?.endSeconds).toBeCloseTo(5.8, 3)
    expect(cues.every((cue, index) => index === 0 || cue.startSeconds >= cues[index - 1].endSeconds)).toBe(true)
  })
})
