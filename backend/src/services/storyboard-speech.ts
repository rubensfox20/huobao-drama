type StoryboardSpeechLike = {
  dialogue?: string | null
  action?: string | null
  description?: string | null
  result?: string | null
  title?: string | null
}

function normalizeWhitespace(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function stripTrailingPunctuation(value: string) {
  return normalizeWhitespace(value).replace(/[.;:,!?]+$/g, '').trim()
}

function ensureSentence(value: string) {
  const text = stripTrailingPunctuation(value)
  if (!text) return ''
  return /[.!?…]$/.test(text) ? text : `${text}.`
}

function pickNarrationBase(storyboard: StoryboardSpeechLike) {
  const action = ensureSentence(String(storyboard.action || ''))
  const result = ensureSentence(String(storyboard.result || ''))
  const description = ensureSentence(String(storyboard.description || ''))

  if (action && result) {
    const combined = `${stripTrailingPunctuation(action)} ${result}`.trim()
    if (combined.length <= 220) return combined
  }

  if (action) return action
  if (description) return description
  if (result) return result
  return ''
}

export function getStoryboardSpokenDialogue(storyboard: StoryboardSpeechLike) {
  const explicitDialogue = normalizeWhitespace(String(storyboard.dialogue || ''))
  if (explicitDialogue) return explicitDialogue

  const narrationBase = pickNarrationBase(storyboard)
  if (!narrationBase) return ''

  const text = narrationBase.length > 220
    ? `${stripTrailingPunctuation(narrationBase.slice(0, 217))}...`
    : narrationBase

  return `Narrador: ${ensureSentence(text)}`
}
