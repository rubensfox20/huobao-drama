export type TimedSubtitleCue = {
  startSeconds: number
  endSeconds: number
  text: string
}

const DEFAULT_MAX_CHUNK_CHARS = 48
const DEFAULT_MAX_CUES = 4
const DEFAULT_LEAD_IN_SECONDS = 0.2
const MIN_CUE_DURATION_SECONDS = 0.7

function normalizeSubtitleText(text: string) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
}

function splitSubtitleFragments(text: string) {
  const normalized = normalizeSubtitleText(text)
  if (!normalized) return []
  return normalized
    .split(/(?<=[.!?;:])\s+|(?<=,)\s+(?=[A-ZÀ-Ý0-9])/u)
    .map((part) => part.trim())
    .filter(Boolean)
}

function splitLongFragment(fragment: string, maxChunkChars: number) {
  if (fragment.length <= maxChunkChars) return [fragment]
  const words = fragment.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  words.forEach((word) => {
    if (!current) {
      current = word
      return
    }

    if ((current.length + 1 + word.length) <= maxChunkChars) {
      current = `${current} ${word}`
      return
    }

    chunks.push(current)
    current = word
  })

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function collapseChunks(chunks: string[], maxChunks: number) {
  const result = [...chunks]
  while (result.length > maxChunks) {
    let bestIndex = 0
    let bestLength = Number.POSITIVE_INFINITY
    for (let index = 0; index < result.length - 1; index++) {
      const combinedLength = result[index].length + result[index + 1].length
      if (combinedLength < bestLength) {
        bestLength = combinedLength
        bestIndex = index
      }
    }
    result.splice(bestIndex, 2, `${result[bestIndex]} ${result[bestIndex + 1]}`.trim())
  }
  return result
}

export function chunkSubtitleText(text: string, maxChunkChars = DEFAULT_MAX_CHUNK_CHARS, maxCues = DEFAULT_MAX_CUES) {
  const normalized = normalizeSubtitleText(text)
  if (!normalized) return []

  const fragments = splitSubtitleFragments(normalized)
    .flatMap((fragment) => splitLongFragment(fragment, maxChunkChars))
  if (!fragments.length) return []

  const chunks: string[] = []
  let current = ''

  fragments.forEach((fragment) => {
    if (!current) {
      current = fragment
      return
    }

    if ((current.length + 1 + fragment.length) <= maxChunkChars) {
      current = `${current} ${fragment}`.trim()
      return
    }

    chunks.push(current)
    current = fragment
  })

  if (current) {
    chunks.push(current)
  }

  return collapseChunks(chunks, maxCues)
}

export function buildTimedSubtitleCues(
  text: string,
  endSeconds: number,
  startOffsetSeconds = DEFAULT_LEAD_IN_SECONDS,
) {
  const chunks = chunkSubtitleText(text)
  if (!chunks.length) return [] as TimedSubtitleCue[]

  const safeStart = Math.max(0, Number(startOffsetSeconds || 0))
  const safeEnd = Math.max(safeStart + MIN_CUE_DURATION_SECONDS, Number(endSeconds || 0))
  const availableDuration = safeEnd - safeStart
  const weights = chunks.map((chunk) => Math.max(8, chunk.replace(/\s+/g, '').length))
  const totalWeight = weights.reduce((sum, value) => sum + value, 0)

  if (availableDuration <= chunks.length * MIN_CUE_DURATION_SECONDS) {
    const segmentDuration = availableDuration / chunks.length
    return chunks.map((chunk, index) => ({
      text: chunk,
      startSeconds: safeStart + (segmentDuration * index),
      endSeconds: safeStart + (segmentDuration * (index + 1)),
    }))
  }

  const extraDuration = availableDuration - (chunks.length * MIN_CUE_DURATION_SECONDS)
  let cursor = safeStart

  return chunks.map((chunk, index) => {
    const proportionalExtra = totalWeight > 0 ? (extraDuration * weights[index]) / totalWeight : 0
    const duration = MIN_CUE_DURATION_SECONDS + proportionalExtra
    const startSeconds = cursor
    const endSeconds = index === chunks.length - 1 ? safeEnd : Math.min(safeEnd, startSeconds + duration)
    cursor = endSeconds
    return { text: chunk, startSeconds, endSeconds }
  })
}
