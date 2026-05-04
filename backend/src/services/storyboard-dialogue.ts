type StoryboardDialogueRecord = {
  dialogue?: string | null
  storyboardNumber?: number | null
  shot_number?: number | null
  ttsAudioUrl?: string | null
  subtitleUrl?: string | null
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeDialogueText(dialogue?: string | null) {
  const raw = collapseWhitespace(String(dialogue || ''))
  if (!raw) return ''

  return collapseWhitespace(
    raw
      .replace(/^(.+?)[:：]\s*/, '')
      .replace(/[（(].+?[)）]/g, ' ')
      .replace(/[…]+/g, '...')
  )
}

export function dedupeAdjacentStoryboardDialogues<T extends StoryboardDialogueRecord>(storyboards: T[]): T[] {
  const rows = [...storyboards]
  let previousDialogue = ''

  return rows.map((storyboard) => {
    const normalizedDialogue = normalizeDialogueText(storyboard.dialogue)
    if (!normalizedDialogue) {
      previousDialogue = ''
      return storyboard
    }

    if (previousDialogue && previousDialogue === normalizedDialogue) {
      return {
        ...storyboard,
        dialogue: '',
        ttsAudioUrl: null,
        subtitleUrl: null,
      }
    }

    previousDialogue = normalizedDialogue
    return storyboard
  })
}
