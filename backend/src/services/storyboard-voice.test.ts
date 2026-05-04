import { describe, expect, it } from 'vitest'
import { resolveStoryboardVoiceSelection } from './storyboard-voice.js'

describe('resolveStoryboardVoiceSelection', () => {
  it('uses narrator voice for narrator speaker labels', () => {
    expect(resolveStoryboardVoiceSelection({
      provider: 'gemini',
      speaker: 'Narrador',
    })).toEqual({
      voiceId: 'Charon',
      source: 'narrator',
    })
  })

  it('falls back to the linked character voice when there is a single character and no speaker prefix', () => {
    expect(resolveStoryboardVoiceSelection({
      provider: 'gemini',
      linkedCharacters: [{ name: 'Kai', voiceStyle: 'Zephyr' }],
    })).toEqual({
      voiceId: 'Zephyr',
      source: 'linked_character',
    })
  })

  it('matches explicit speaker names against all available characters', () => {
    expect(resolveStoryboardVoiceSelection({
      provider: 'gemini',
      speaker: 'Lina',
      linkedCharacters: [],
      allCharacters: [{ name: 'Lina', voiceStyle: 'Puck' }],
    })).toEqual({
      voiceId: 'Puck',
      source: 'speaker',
    })
  })
})
