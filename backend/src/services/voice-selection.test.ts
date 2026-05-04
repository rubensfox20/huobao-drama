import { describe, expect, it } from 'vitest'
import {
  describeVoiceGender,
  getPreferredVoiceIdForGender,
  inferCharacterGender,
  inferVoiceGender,
  isLegacyCharacterVoice,
  isVoiceCompatibleWithCharacter,
  pickVoiceForCharacter,
  shouldRefreshCharacterVoiceAssignment,
} from './voice-selection.js'

describe('voice selection helpers', () => {
  it('infers gender for Gemini builtin voices from curated metadata', () => {
    expect(inferVoiceGender({ id: 'Zephyr', provider: 'gemini' })).toBe('male')
    expect(inferVoiceGender({ id: 'Puck', provider: 'gemini' })).toBe('female')
    expect(describeVoiceGender(inferVoiceGender({ id: 'Kore', provider: 'gemini' }))).toBe('Feminina')
  })

  it('infers character gender from portuguese descriptions', () => {
    expect(inferCharacterGender({
      name: 'Kai',
      description: 'Kai, um jovem de dezessete anos, protege sua irmã mais nova durante o caos.',
    })).toBe('male')

    expect(inferCharacterGender({
      name: 'Luna',
      description: 'Kai, em pânico, procura por sua irmã mais nova, Luna. Ele a encontra antes do ataque final.',
    })).toBe('female')
  })

  it('keeps only compatible voices for existing assignments', () => {
    expect(isVoiceCompatibleWithCharacter(
      { id: 'Zephyr', provider: 'gemini', gender: 'male' },
      { name: 'Kai', description: 'Um jovem heroi determinado.' },
    )).toBe(true)

    expect(isVoiceCompatibleWithCharacter(
      { id: 'Puck', provider: 'gemini', gender: 'female' },
      { name: 'Kai', description: 'Um jovem heroi determinado.' },
    )).toBe(false)
  })

  it('prefers a matching voice gender during fallback assignment', () => {
    const voices = [
      { id: 'Puck', provider: 'gemini', gender: 'female', description: ['Upbeat'] },
      { id: 'Zephyr', provider: 'gemini', gender: 'male', description: ['Bright'] },
      { id: 'Iapetus', provider: 'gemini', gender: 'male', description: ['Clear'] },
      { id: 'Sulafat', provider: 'gemini', gender: 'female', description: ['Warm'] },
    ]

    expect(pickVoiceForCharacter(
      { name: 'Kai', description: 'Um jovem rapaz determinado a proteger a vila.' },
      voices,
      'Achird',
    )).toBe('Iapetus')

    expect(pickVoiceForCharacter(
      { name: 'Luna', description: 'Uma garota jovem e empatica que tenta salvar o irmao.' },
      voices,
      'Achird',
    )).toBe('Sulafat')
  })

  it('marks provisional Gemini character voices for refresh', () => {
    expect(getPreferredVoiceIdForGender('gemini', 'male')).toBe('Iapetus')
    expect(getPreferredVoiceIdForGender('gemini', 'female')).toBe('Sulafat')
    expect(isLegacyCharacterVoice('gemini', 'Zephyr')).toBe(true)
    expect(isLegacyCharacterVoice('gemini', 'Iapetus')).toBe(false)

    expect(shouldRefreshCharacterVoiceAssignment(
      'gemini',
      'Zephyr',
      { name: 'Kai', description: 'Um jovem heroi determinado.' },
    )).toBe(true)

    expect(shouldRefreshCharacterVoiceAssignment(
      'gemini',
      'Sulafat',
      { name: 'Lina', description: 'Uma jovem sensivel e corajosa.' },
    )).toBe(false)
  })
})
