export type VoiceGender = 'male' | 'female' | 'neutral'

export interface CharacterVoiceTarget {
  name?: string | null
  role?: string | null
  description?: string | null
  personality?: string | null
  appearance?: string | null
}

export interface VoiceCandidate {
  id: string
  name?: string | null
  description?: string[] | null
  language?: string | null
  provider?: string | null
  gender?: VoiceGender | string | null
}

const GEMINI_VOICE_GENDER: Record<string, VoiceGender> = {
  zephyr: 'male',
  puck: 'female',
  charon: 'male',
  kore: 'female',
  fenrir: 'male',
  leda: 'female',
  orus: 'male',
  aoede: 'female',
  callirrhoe: 'female',
  autonoe: 'female',
  enceladus: 'neutral',
  iapetus: 'male',
  umbriel: 'neutral',
  algieba: 'neutral',
  despina: 'female',
  erinome: 'female',
  algenib: 'male',
  rasalgethi: 'neutral',
  laomedeia: 'female',
  achernar: 'neutral',
  alnilam: 'male',
  schedar: 'neutral',
  gacrux: 'male',
  pulcherrima: 'female',
  achird: 'neutral',
  zubenelgenubi: 'neutral',
  vindemiatrix: 'female',
  sadachbia: 'neutral',
  sadaltager: 'neutral',
  sulafat: 'female',
}

const PREFERRED_PROVIDER_VOICES: Record<string, Record<VoiceGender, string>> = {
  gemini: {
    male: 'Iapetus',
    female: 'Sulafat',
    neutral: 'Achird',
  },
}

const LEGACY_PROVIDER_VOICES: Record<string, Set<string>> = {
  gemini: new Set(['zephyr', 'puck', 'kore']),
}

const MALE_PATTERNS = [
  /\bmale\b/g,
  /\bman\b/g,
  /\bboy\b/g,
  /\bmasculin(?:a|o)?\b/g,
  /\bhomem\b/g,
  /\bmasculino\b/g,
  /\bmasculina\b/g,
  /\bum jovem\b/g,
  /\bum rapaz\b/g,
  /\bum garoto\b/g,
  /\bum menino\b/g,
  /\bum heroi\b/g,
  /\bum guerreiro\b/g,
  /\bo irmao\b/g,
  /\bgaroto\b/g,
  /\bmenino\b/g,
  /\brapaz\b/g,
  /\bpai\b/g,
  /\bsenhor\b/g,
  /\brei\b/g,
  /\bprincipe\b/g,
  /\bheroi\b/g,
  /\bprotagonista masculino\b/g,
  /\bele\b/g,
  /\bdele\b/g,
]

const FEMALE_PATTERNS = [
  /\bfemale\b/g,
  /\bwoman\b/g,
  /\bgirl\b/g,
  /\bfeminin(?:a|o)?\b/g,
  /\bmulher\b/g,
  /\bfeminino\b/g,
  /\bfeminina\b/g,
  /\buma jovem\b/g,
  /\buma garota\b/g,
  /\buma menina\b/g,
  /\buma heroina\b/g,
  /\buma guerreira\b/g,
  /\ba irma\b/g,
  /\bgarota\b/g,
  /\bmenina\b/g,
  /\bmae\b/g,
  /\bsenhora\b/g,
  /\brainha\b/g,
  /\bprincesa\b/g,
  /\bheroina\b/g,
  /\bprotagonista feminina\b/g,
  /\bela\b/g,
  /\bdela\b/g,
]

const YOUTHFUL_TERMS = /\b(young|youthful|teen|teenager|adolescente|jovem|crianca|criança|kid|child|menina|menino|garota|garoto)\b/i
const MATURE_TERMS = /\b(mature|older|elder|grave|autoritario|autoritario|pai|mae|mãe|rei|rainha|senhor|senhora|anciao|anciao|elder)\b/i
const WARM_TERMS = /\b(warm|gentle|soft|friendly|sweet|empathetic|empatica|empático|acolhedora|carinhosa)\b/i
const STRONG_TERMS = /\b(firm|deep|gravelly|strong|powerful|determined|autoritario|autoritario|villain|antagonista|imponente)\b/i

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((total, pattern) => total + (text.match(pattern)?.length || 0), 0)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function normalizeVoiceGender(value: unknown): VoiceGender | null {
  const text = normalizeText(value)
  if (!text) return null
  if (['male', 'masculina', 'masculino', 'masculine', 'male voice', 'voz masculina', 'homem'].includes(text)) return 'male'
  if (['female', 'feminina', 'feminino', 'feminine', 'female voice', 'voz feminina', 'mulher'].includes(text)) return 'female'
  if (['neutral', 'neutra', 'neutro', 'androgynous', 'androgina', 'androgino'].includes(text)) return 'neutral'
  return null
}

export function inferCharacterGender(character: CharacterVoiceTarget): VoiceGender {
  const name = normalizeText(character.name)
  const text = normalizeText([
    character.name,
    character.role,
    character.description,
    character.personality,
    character.appearance,
  ].filter(Boolean).join(' '))

  let maleScore = countMatches(text, MALE_PATTERNS)
  let femaleScore = countMatches(text, FEMALE_PATTERNS)

  if (name) {
    const safeName = escapeRegExp(name)
    const nameScopedMale = [
      new RegExp(`\\b${safeName}\\b[^.!?]{0,36}\\b(ele|dele|garoto|menino|rapaz|homem|heroi|guerreiro|principe)\\b`, 'g'),
      new RegExp(`\\bo irmao(?: mais novo)?\\b[^.!?]{0,24}\\b${safeName}\\b`, 'g'),
      new RegExp(`\\bum jovem\\b[^.!?]{0,24}\\b${safeName}\\b`, 'g'),
    ]
    const nameScopedFemale = [
      new RegExp(`\\b${safeName}\\b[^.!?]{0,36}\\b(ela|dela|garota|menina|mulher|heroina|princesa)\\b`, 'g'),
      new RegExp(`\\ba irma(?: mais nova)?\\b[^.!?]{0,24}\\b${safeName}\\b`, 'g'),
      new RegExp(`\\birma mais nova\\b[^.!?]{0,24}\\b${safeName}\\b`, 'g'),
      new RegExp(`\\buma jovem\\b[^.!?]{0,24}\\b${safeName}\\b`, 'g'),
    ]
    maleScore += countMatches(text, nameScopedMale)
    femaleScore += countMatches(text, nameScopedFemale)
  }

  if (maleScore > femaleScore) return 'male'
  if (femaleScore > maleScore) return 'female'
  if (name.endsWith('a')) return 'female'
  if (name.endsWith('o')) return 'male'
  return 'neutral'
}

export function inferVoiceGender(candidate: VoiceCandidate): VoiceGender {
  const explicit = normalizeVoiceGender(candidate.gender)
  if (explicit) return explicit

  const provider = normalizeText(candidate.provider)
  const voiceKey = normalizeText(candidate.id || candidate.name)
  if (provider === 'gemini' && GEMINI_VOICE_GENDER[voiceKey]) {
    return GEMINI_VOICE_GENDER[voiceKey]
  }

  const text = normalizeText([
    candidate.id,
    candidate.name,
    Array.isArray(candidate.description) ? candidate.description.join(' ') : '',
  ].join(' '))

  const maleScore = countMatches(text, MALE_PATTERNS)
  const femaleScore = countMatches(text, FEMALE_PATTERNS)

  if (maleScore > femaleScore) return 'male'
  if (femaleScore > maleScore) return 'female'
  return 'neutral'
}

export function describeVoiceGender(gender: VoiceGender) {
  if (gender === 'male') return 'Masculina'
  if (gender === 'female') return 'Feminina'
  return 'Neutra'
}

export function getPreferredVoiceIdForGender(provider: unknown, gender: VoiceGender) {
  const providerKey = normalizeText(provider)
  return PREFERRED_PROVIDER_VOICES[providerKey]?.[gender] || null
}

export function isLegacyCharacterVoice(provider: unknown, voiceId: unknown) {
  const providerKey = normalizeText(provider)
  const voiceKey = normalizeText(voiceId)
  if (!providerKey || !voiceKey) return false
  return LEGACY_PROVIDER_VOICES[providerKey]?.has(voiceKey) || false
}

export function shouldRefreshCharacterVoiceAssignment(
  provider: unknown,
  voiceId: unknown,
  character: CharacterVoiceTarget,
) {
  const currentVoiceId = normalizeText(voiceId)
  if (!currentVoiceId) return true

  const desiredGender = inferCharacterGender(character)
  const preferredVoiceId = getPreferredVoiceIdForGender(provider, desiredGender)
  if (preferredVoiceId && currentVoiceId === normalizeText(preferredVoiceId)) {
    return false
  }

  return isLegacyCharacterVoice(provider, currentVoiceId)
}

function scoreVoiceFit(character: CharacterVoiceTarget, voice: VoiceCandidate, desiredGender: VoiceGender, usedCount: number) {
  const provider = normalizeText(voice.provider)
  const preferredVoiceId = normalizeText(getPreferredVoiceIdForGender(provider, desiredGender))
  const voiceGender = inferVoiceGender(voice)
  const voiceText = normalizeText([
    voice.name,
    voice.id,
    Array.isArray(voice.description) ? voice.description.join(' ') : '',
  ].join(' '))
  const characterText = normalizeText([
    character.role,
    character.description,
    character.personality,
    character.appearance,
  ].filter(Boolean).join(' '))

  let score = 0

  if (desiredGender === 'neutral') {
    if (voiceGender === 'neutral') score += 2
  } else if (voiceGender === desiredGender) {
    score += 6
  } else if (voiceGender === 'neutral') {
    score += 2
  } else {
    score -= 5
  }

  if (preferredVoiceId && normalizeText(voice.id) === preferredVoiceId) {
    score += 4
  }

  if (isLegacyCharacterVoice(provider, voice.id) && preferredVoiceId && normalizeText(voice.id) !== preferredVoiceId) {
    score -= 1.5
  }

  if (YOUTHFUL_TERMS.test(characterText) && /\b(youthful|bright|upbeat|lively|friendly|breezy)\b/i.test(voiceText)) score += 2
  if (MATURE_TERMS.test(characterText) && /\b(mature|firm|gravelly|deep|even|informative|knowledgeable)\b/i.test(voiceText)) score += 2
  if (WARM_TERMS.test(characterText) && /\b(warm|gentle|soft|friendly|smooth)\b/i.test(voiceText)) score += 1.5
  if (STRONG_TERMS.test(characterText) && /\b(firm|strong|gravelly|mature|forward)\b/i.test(voiceText)) score += 1.5

  score -= usedCount * 0.75

  return score
}

export function isVoiceCompatibleWithCharacter(voice: VoiceCandidate | undefined, character: CharacterVoiceTarget) {
  if (!voice) return false
  const desiredGender = inferCharacterGender(character)
  if (desiredGender === 'neutral') return true
  const voiceGender = inferVoiceGender(voice)
  return voiceGender === desiredGender || voiceGender === 'neutral'
}

export function pickVoiceForCharacter(
  character: CharacterVoiceTarget,
  voices: VoiceCandidate[],
  defaultVoiceId: string,
  usage: Map<string, number> = new Map(),
) {
  if (!voices.length) return defaultVoiceId

  const desiredGender = inferCharacterGender(character)
  const ranked = [...voices]
    .map((voice, index) => ({
      voice,
      index,
      score: scoreVoiceFit(character, voice, desiredGender, usage.get(voice.id) || 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  const best = ranked[0]?.voice?.id || defaultVoiceId
  usage.set(best, (usage.get(best) || 0) + 1)
  return best
}
