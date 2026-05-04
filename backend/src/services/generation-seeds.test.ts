import { describe, expect, it } from 'vitest'
import { deriveGenerationSeed } from './generation-seeds.js'

describe('deriveGenerationSeed', () => {
  it('is deterministic for the same input', () => {
    const first = deriveGenerationSeed({
      kind: 'character',
      dramaId: 4,
      characterId: 11,
      frameType: 'portrait',
    })
    const second = deriveGenerationSeed({
      kind: 'character',
      dramaId: 4,
      characterId: 11,
      frameType: 'portrait',
    })

    expect(first).toBe(second)
  })

  it('changes when the entity or frame type changes', () => {
    const portrait = deriveGenerationSeed({
      kind: 'character',
      dramaId: 4,
      characterId: 11,
      frameType: 'portrait',
    })
    const alternateCharacter = deriveGenerationSeed({
      kind: 'character',
      dramaId: 4,
      characterId: 12,
      frameType: 'portrait',
    })
    const alternateFrame = deriveGenerationSeed({
      kind: 'storyboard',
      dramaId: 4,
      episodeId: 13,
      storyboardId: 68,
      frameType: 'first_frame',
    })

    expect(alternateCharacter).not.toBe(portrait)
    expect(alternateFrame).not.toBe(portrait)
  })
})
