import { describe, expect, it } from 'vitest'
import { buildAssetGenerationCacheKey } from './asset-generation-cache.js'

describe('buildAssetGenerationCacheKey', () => {
  it('is stable for equivalent payloads', () => {
    const first = buildAssetGenerationCacheKey({
      assetType: 'image',
      provider: 'gemini',
      model: 'gemini-2.5-flash-image',
      prompt: 'hero in the village',
      inputs: { size: '16:9', ref: [1, 2] },
    })
    const second = buildAssetGenerationCacheKey({
      assetType: 'image',
      provider: 'gemini',
      model: 'gemini-2.5-flash-image',
      prompt: 'hero in the village',
      inputs: { ref: [1, 2], size: '16:9' },
    })

    expect(first).toBe(second)
  })
})
