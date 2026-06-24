import { normalizeLocationEnglish, sanitizeVisualPrompt, translateVisualText } from './storyboard-prompts.js'
import {
  buildCharacterImagePromptFromProfile,
  buildCharacterVisualProfile,
  buildSceneImagePromptFromProfile,
  buildSceneVisualProfile,
} from './visual-identity.js'

const NON_ENGLISH_MARKERS = /[ãáàâéêíóôõúç]|\b(?:de|da|do|das|dos|uma|um|para|com|sem|entre|sobre|quando|enquanto|pois|ainda|olha|segura|perde|torna|veste|possui|clima|luta|salvar|heroi|herói|artefato|braco|braço|nuvens|ilha|ilhas)\b/i

function clean(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([,;:])\s*/g, '$1 ')
    .replace(/([,;:]){2,}/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function clipText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  const sliced = value.slice(0, maxLength + 1)
  const boundary = sliced.lastIndexOf(' ')
  return clean(boundary > Math.floor(maxLength * 0.6) ? sliced.slice(0, boundary) : sliced.slice(0, maxLength))
}

function keepVisualSnippet(value: unknown, maxLength = 160) {
  const text = clipText(translateVisualText(String(value || '')), maxLength)
  if (!text) return ''
  if (NON_ENGLISH_MARKERS.test(text)) return ''
  return text
}

function pickSceneSynopsis(scene: Record<string, any>) {
  const rawPrompt = clean(scene.prompt)
  const prompt = keepVisualSnippet(scene.prompt, 120)
  if (!prompt) return ''
  const location = translateVisualText(scene.location || '')
  const time = translateVisualText(scene.time || '')
  const rawLocation = clean(scene.location || '')
  const rawTime = clean(scene.time || '')
  const variants = [
    clean(`${rawLocation} · ${rawTime}`),
    clean(`${rawLocation} · ${time}`),
    clean(`${location} · ${time}`),
  ].filter(Boolean)
  if (variants.some(value => value.toLowerCase() === rawPrompt.toLowerCase())) return ''
  if (location && time && prompt.toLowerCase() === clean(`${location} · ${time}`).toLowerCase()) return ''
  return prompt
}

function join(parts: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const items: string[] = []
  for (const part of parts) {
    const value = clean(part)
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(value)
  }
  return sanitizeVisualPrompt(items.join(', '))
}

function hasAny(source: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(source))
}

function extractCharacterVisualProfile(char: Record<string, any>) {
  const source = clean([
    translateVisualText(char.appearance),
    translateVisualText(char.description),
    translateVisualText(char.personality),
  ].filter(Boolean).join(', '))

  return join([
    hasAny(source, [/\bmale\b/i]) ? 'male' : '',
    hasAny(source, [/\bfemale\b/i]) ? 'female' : '',
    hasAny(source, [/\byoung adult\b/i]) ? 'young adult' : '',
    hasAny(source, [/\bathletic build\b/i]) ? 'athletic build' : '',
    hasAny(source, [/\bhero marked by Aether\b/i, /\bAether mark\b/i, /\bglowing blue symbol\b/i]) ? 'glowing blue Aether mark on the arm' : '',
    hasAny(source, [/\bgolden artifact\b/i]) ? 'ancient golden artifact' : '',
    hasAny(source, [/\btunic\b/i, /\blight armor\b/i]) ? 'fantasy tunic or light armor' : '',
    hasAny(source, [/\bpractical adventurer clothing\b/i]) ? 'practical adventurer clothing' : '',
    hasAny(source, [/\blight cloak\b/i]) ? 'light cloak' : '',
    hasAny(source, [/\bsturdy boots\b/i]) ? 'sturdy boots' : '',
    hasAny(source, [/\btranslucent skin\b/i, /\bethereal\b/i]) ? 'translucent skin with ethereal glow' : '',
    hasAny(source, [/\bconcerned expression\b/i]) ? 'concerned expression' : '',
    hasAny(source, [/\bdetermined\b/i]) ? 'determined expression' : '',
  ])
}

function extractCharacterEmotionalCue(char: Record<string, any>) {
  const source = clean([
    translateVisualText(char.personality),
    translateVisualText(char.description),
  ].filter(Boolean).join(', '))

  return join([
    hasAny(source, [/\bself-sacrificial\b/i]) ? 'self-sacrificial resolve' : '',
    hasAny(source, [/\bburdened by guilt\b/i]) ? 'burdened by guilt' : '',
    hasAny(source, [/\bempathetic\b/i]) ? 'empathetic' : '',
    hasAny(source, [/\bbrave\b/i]) ? 'brave' : '',
    hasAny(source, [/\banxious\b/i]) ? 'anxious' : '',
    hasAny(source, [/\bconcerned\b/i]) ? 'concerned' : '',
  ])
}

function pickCharacterSynopsis(char: Record<string, any>) {
  return extractCharacterVisualProfile(char)
    || keepVisualSnippet(char.appearance, 220)
    || keepVisualSnippet(char.role, 80)
    || ''
}

function pickCharacterMood(char: Record<string, any>) {
  return extractCharacterEmotionalCue(char)
    || keepVisualSnippet(char.personality, 120)
}

export function buildCharacterImagePrompt(char: Record<string, any>) {
  const profile = buildCharacterVisualProfile(char)
  const prompt = buildCharacterImagePromptFromProfile(
    profile,
    join([
      'cinematic character design sheet',
      clean(char.name),
      pickCharacterSynopsis(char) || 'clean character reference portrait',
      pickCharacterMood(char) ? `personality cues: ${pickCharacterMood(char)}` : '',
      'full body',
      'front view',
      'soft cinematic lighting',
      'no text',
      'no subtitles',
      'no watermark',
    ]),
  )
  return sanitizeVisualPrompt(prompt)
}

export function buildSceneImagePrompt(scene: Record<string, any>) {
  const profile = buildSceneVisualProfile(scene)
  const prompt = buildSceneImagePromptFromProfile(
    profile,
    join([
      'cinematic environment concept art',
      normalizeLocationEnglish(String(scene.location || '')),
      translateVisualText(scene.time || ''),
      pickSceneSynopsis(scene) || 'story-driven environment with strong atmosphere',
      'consistent worldbuilding',
      'atmospheric lighting',
      'no text',
      'no watermark',
    ]),
  )
  return sanitizeVisualPrompt(prompt)
}
