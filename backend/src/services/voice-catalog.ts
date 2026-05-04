import type { VoiceGender } from './voice-selection.js'

export interface BuiltinVoiceRecord {
  voice_id: string
  voice_name: string
  description: string[]
  language: string
  provider: string
  gender: VoiceGender
}

const GEMINI_VOICE_PAIRS: Array<[string, string, VoiceGender]> = [
  ['Zephyr', 'Bright', 'male'],
  ['Puck', 'Upbeat', 'female'],
  ['Charon', 'Informative', 'male'],
  ['Kore', 'Firm', 'female'],
  ['Fenrir', 'Excitable', 'male'],
  ['Leda', 'Youthful', 'female'],
  ['Orus', 'Firm', 'male'],
  ['Aoede', 'Breezy', 'female'],
  ['Callirrhoe', 'Easy-going', 'female'],
  ['Autonoe', 'Bright', 'female'],
  ['Enceladus', 'Breathy', 'neutral'],
  ['Iapetus', 'Clear', 'male'],
  ['Umbriel', 'Easy-going', 'neutral'],
  ['Algieba', 'Smooth', 'neutral'],
  ['Despina', 'Smooth', 'female'],
  ['Erinome', 'Clear', 'female'],
  ['Algenib', 'Gravelly', 'male'],
  ['Rasalgethi', 'Informative', 'neutral'],
  ['Laomedeia', 'Upbeat', 'female'],
  ['Achernar', 'Soft', 'neutral'],
  ['Alnilam', 'Firm', 'male'],
  ['Schedar', 'Even', 'neutral'],
  ['Gacrux', 'Mature', 'male'],
  ['Pulcherrima', 'Forward', 'female'],
  ['Achird', 'Friendly', 'neutral'],
  ['Zubenelgenubi', 'Casual', 'neutral'],
  ['Vindemiatrix', 'Gentle', 'female'],
  ['Sadachbia', 'Lively', 'neutral'],
  ['Sadaltager', 'Knowledgeable', 'neutral'],
  ['Sulafat', 'Warm', 'female'],
] as const

export const GEMINI_TTS_VOICES: BuiltinVoiceRecord[] = GEMINI_VOICE_PAIRS.map(([voiceName, trait, gender]) => ({
  voice_id: voiceName,
  voice_name: voiceName,
  description: [
    trait,
    'Gemini TTS prebuilt voice',
    'Useful for narration, dialogue, and quick voice previews',
  ],
  language: 'multilingual',
  provider: 'gemini',
  gender,
}))

export function getBuiltinVoices(provider?: string | null): BuiltinVoiceRecord[] {
  const normalized = String(provider || '').toLowerCase()
  if (normalized === 'gemini') return GEMINI_TTS_VOICES
  return []
}

export function getDefaultVoiceId(provider?: string | null): string {
  const normalized = String(provider || '').toLowerCase()
  if (normalized === 'gemini') return 'Achird'
  return 'alloy'
}

export function getDefaultNarratorVoiceId(provider?: string | null): string {
  const normalized = String(provider || '').toLowerCase()
  if (normalized === 'gemini') return 'Charon'
  return getDefaultVoiceId(provider)
}
