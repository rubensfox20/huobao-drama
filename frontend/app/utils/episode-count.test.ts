import { describe, expect, test } from 'bun:test'
import { adjustEpisodeCount } from './episode-count'

describe('adjustEpisodeCount', () => {
  test('increments and decrements within the allowed range', () => {
    expect(adjustEpisodeCount(10, 1)).toBe(11)
    expect(adjustEpisodeCount(10, -1)).toBe(9)
  })

  test('keeps the episode count between 1 and 999', () => {
    expect(adjustEpisodeCount(999, 1)).toBe(999)
    expect(adjustEpisodeCount(1, -1)).toBe(1)
  })
})
