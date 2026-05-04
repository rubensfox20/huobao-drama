import { getDefaultNarratorVoiceId, getDefaultVoiceId } from './voice-catalog.js'

export interface StoryboardVoiceCharacter {
  id?: number | null
  name?: string | null
  voiceStyle?: string | null
}

export interface ResolveStoryboardVoiceParams {
  provider?: string | null
  speaker?: string | null
  linkedCharacters?: StoryboardVoiceCharacter[]
  allCharacters?: StoryboardVoiceCharacter[]
}

const NARRATOR_SPEAKER_RE = /^(narrator|narrador|narração|narracao)$/i

function normalizeText(value: unknown) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function matchCharacterByName(characters: StoryboardVoiceCharacter[], speaker?: string | null) {
  const target = normalizeText(speaker)
  if (!target) return null
  return characters.find((character) => normalizeText(character.name) === target) || null
}

export function resolveStoryboardVoiceSelection(params: ResolveStoryboardVoiceParams) {
  const provider = params.provider || null
  const defaultVoiceId = getDefaultVoiceId(provider)
  const narratorVoiceId = getDefaultNarratorVoiceId(provider)
  const linkedCharacters = (params.linkedCharacters || []).filter(Boolean)
  const allCharacters = (params.allCharacters || linkedCharacters).filter(Boolean)
  const speaker = String(params.speaker || '').trim()

  if (speaker && NARRATOR_SPEAKER_RE.test(speaker)) {
    return { voiceId: narratorVoiceId, source: 'narrator' as const }
  }

  const explicitMatch = matchCharacterByName(allCharacters, speaker)
  if (explicitMatch?.voiceStyle) {
    return { voiceId: explicitMatch.voiceStyle, source: 'speaker' as const }
  }

  const voicedLinked = linkedCharacters.filter((character) => String(character.voiceStyle || '').trim())
  if (voicedLinked.length === 1) {
    return { voiceId: String(voicedLinked[0].voiceStyle), source: 'linked_character' as const }
  }

  if (speaker) {
    const linkedSpeakerMatch = matchCharacterByName(linkedCharacters, speaker)
    if (linkedSpeakerMatch?.voiceStyle) {
      return { voiceId: linkedSpeakerMatch.voiceStyle, source: 'linked_speaker' as const }
    }
  }

  return { voiceId: defaultVoiceId, source: 'default' as const }
}
