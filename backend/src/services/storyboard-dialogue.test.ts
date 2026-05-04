import { describe, expect, it } from 'vitest'
import { dedupeAdjacentStoryboardDialogues, normalizeDialogueText } from './storyboard-dialogue.js'

describe('storyboard dialogue helpers', () => {
  it('normalizes speaker prefixes for comparison', () => {
    expect(normalizeDialogueText('Narracao: (grave) O ceu caiu…')).toBe('O ceu caiu...')
  })

  it('removes exact adjacent duplicate dialogues from later shots', () => {
    const result = dedupeAdjacentStoryboardDialogues([
      { shot_number: 1, dialogue: 'Kai: Se eu nao fizer nada, tudo acaba.', ttsAudioUrl: 'a.wav' },
      { shot_number: 2, dialogue: 'Se eu nao fizer nada, tudo acaba.', ttsAudioUrl: 'b.wav', subtitleUrl: 'b.srt' },
      { shot_number: 3, dialogue: '' },
      { shot_number: 4, dialogue: 'Lina: Ainda ha esperanca.' },
      { shot_number: 5, dialogue: 'Lina: Ainda ha esperanca.' },
    ])

    expect(result[0]?.dialogue).toBe('Kai: Se eu nao fizer nada, tudo acaba.')
    expect(result[1]?.dialogue).toBe('')
    expect(result[1]?.ttsAudioUrl).toBeNull()
    expect(result[1]?.subtitleUrl).toBeNull()
    expect(result[4]?.dialogue).toBe('')
  })
})
