const SCRIPT_END_MARKER_RE = /^(?:fim do roteiro|fim|the end)$/i
const GENERIC_SPEAKER_LINE_RE = /^\s*(?:voz\s+d[aoe]\s+\w+|(?:oficial|marinheiro|soldado|tripulante)\s+\d+)\s*:/im
const NON_PERSON_NAME_TOKENS = new Set([
  'patagonia', 'chilena', 'chileno', 'costa', 'praia', 'ilha', 'ilhas', 'oceano', 'mar',
  'reino', 'coroa', 'britanica', 'britânico', 'britanico', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro', 'janeiro', 'fevereiro', 'marco', 'março',
])
const HUMAN_TITLE_TOKENS = new Set([
  'capitao', 'capitão', 'oficial', 'marinheiro', 'senhor', 'senhora', 'dona', 'dom',
  'rei', 'rainha', 'principe', 'príncipe', 'princesa', 'soldado', 'tripulante',
])

function normalizeLineBreaks(value: string) {
  return value.replace(/\r\n?/g, '\n')
}

function normalizeComparisonText(value: string) {
  return normalizeLineBreaks(String(value || ''))
    .replace(/\s+/g, ' ')
    .trim()
}

function stripMarkdownFormatting(value: string) {
  return value
    .replace(/^\s*```(?:markdown|md|txt)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/^\s*\*\*([^*\n]{2,80}?)\s*:\s*\*\*\s*/gm, '$1: ')
    .replace(/^\s*\*\*([^*\n]{2,80}?)\*\*\s*:\s*/gm, '$1: ')
    .replace(/^\s*\*([^*\n]{2,80}?)\*\s*:\s*/gm, '$1: ')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
}

function normalizeSpeakerTokens(value: string) {
  const tokens = tokenizeName(value).map(normalizeLookup).filter(Boolean)
  if (tokens.length > 1 && HUMAN_TITLE_TOKENS.has(tokens[0])) return tokens.slice(1)
  return tokens
}

function isAllowedNamedSpeaker(candidate: string, allowedNames: string[]) {
  const candidateTokens = normalizeSpeakerTokens(candidate)
  if (!candidateTokens.length) return false

  return allowedNames.some((allowedName) => {
    const allowedTokens = normalizeSpeakerTokens(allowedName)
    if (!allowedTokens.length) return false
    if (candidateTokens.join(' ') === allowedTokens.join(' ')) return true

    const candidateTail = candidateTokens[candidateTokens.length - 1]
    const allowedTail = allowedTokens[allowedTokens.length - 1]
    if (!candidateTail || candidateTail !== allowedTail) return false

    const candidateJoined = candidateTokens.join(' ')
    const allowedJoined = allowedTokens.join(' ')
    return candidateJoined.endsWith(allowedJoined) || allowedJoined.endsWith(candidateJoined)
  })
}

function sanitizeSpeakerTail(value: string) {
  return String(value || '')
    .trim()
    .replace(/^\(([^)]+)\)\s*/, '')
    .replace(/^["“”'`]+/, '')
    .replace(/["“”'`]+$/, '')
    .trim()
}

function repairSpeakerLine(line: string, allowedNames: string[]) {
  const match = line.match(/^(\s*)([^#\n:：]{2,60})[:：]\s*(.+)$/)
  if (!match) return line.trimEnd()

  const speaker = String(match[2] || '').trim()
  const tail = sanitizeSpeakerTail(match[3] || '')
  const isGeneric = /^(?:voz\s+d[aoe]\s+\w+|(?:oficial|marinheiro|soldado|tripulante)\s+\d+)$/i.test(speaker)
  const isAllowed = !allowedNames.length ? false : isAllowedNamedSpeaker(speaker, allowedNames)

  if (!isGeneric && isAllowed) return line.trimEnd()
  return tail
}

function normalizeSceneBlock(value: string) {
  return normalizeComparisonText(value)
}

function dedupeRepeatedScreenplayContent(value: string) {
  const text = normalizeLineBreaks(String(value || '')).trim()
  if (!text) return ''

  const blocks = [...text.matchAll(/(^##\s*S\d+[\s\S]*?)(?=^##\s*S\d+|\s*$)/gm)]
    .map(match => String(match[1] || '').trim())
    .filter(Boolean)

  if (blocks.length >= 2 && blocks.length % 2 === 0) {
    const midpoint = blocks.length / 2
    const left = blocks.slice(0, midpoint).map(normalizeSceneBlock)
    const right = blocks.slice(midpoint).map(normalizeSceneBlock)
    const repeatedWholeScript = left.length > 0 && left.every((block, index) => block === right[index])
    if (repeatedWholeScript) {
      return blocks.slice(0, midpoint).join('\n\n').trim()
    }
  }

  const dedupedBlocks: string[] = []
  for (const block of blocks) {
    const normalizedBlock = normalizeSceneBlock(block)
    const isImmediateDuplicate = dedupedBlocks.length > 0
      && normalizeSceneBlock(dedupedBlocks[dedupedBlocks.length - 1]) === normalizedBlock
    if (isImmediateDuplicate) continue
    dedupedBlocks.push(block)
  }

  if (dedupedBlocks.length && dedupedBlocks.length !== blocks.length) {
    return dedupedBlocks.join('\n\n').trim()
  }

  const normalizedText = normalizeComparisonText(text)
  if (normalizedText.length % 2 === 0) {
    const midpoint = normalizedText.length / 2
    if (normalizedText.slice(0, midpoint) === normalizedText.slice(midpoint)) {
      return text.slice(0, Math.floor(text.length / 2)).trim()
    }
  }

  return text
}

export function sanitizeRewrittenScript(rawContent: string, rawSource = '') {
  const allowedNames = extractAllowedSpeakerNamesFromSource(rawSource)
  const hasSource = String(rawSource || '').trim().length > 0
  const cleanedLines = normalizeLineBreaks(stripMarkdownFormatting(String(rawContent || '')))
    .split('\n')
    .map(line => hasSource ? repairSpeakerLine(line, allowedNames) : line)
    .map(line => line.trimEnd())
    .filter(line => {
      const normalized = line.trim().replace(/[*_`#]+/g, '').trim()
      return !SCRIPT_END_MARKER_RE.test(normalized)
    })
    .filter(Boolean)

  return dedupeRepeatedScreenplayContent(cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim())
}

function findUnexpectedNamedSpeakers(rawContent: string, rawSource = '') {
  const allowedNames = extractAllowedSpeakerNamesFromSource(rawSource)
  if (!allowedNames.length) return []

  const unexpected = new Set<string>()
  for (const match of String(rawContent || '').matchAll(/^([^#\n:：]{2,60})[:：]/gm)) {
    const speaker = String(match[1] || '').trim()
    if (!speaker) continue
    if (/^(?:voz\s+d[aoe]\s+\w+|(?:oficial|marinheiro|soldado|tripulante)\s+\d+)$/i.test(speaker)) continue
    if (!isAllowedNamedSpeaker(speaker, allowedNames)) unexpected.add(speaker)
  }
  return [...unexpected]
}

export function filterNamedCandidatesAgainstSource<T extends { name: string }>(items: T[], rawSource = '') {
  const allowedNames = extractAllowedSpeakerNamesFromSource(rawSource)
  if (!allowedNames.length) return []
  const seen = new Set<string>()
  return items
    .filter((item) => isAllowedNamedSpeaker(item.name, allowedNames))
    .map((item) => {
      const canonicalName = resolveCanonicalAllowedName(item.name, allowedNames)
      return canonicalName ? { ...item, name: canonicalName } : item
    })
    .filter((item) => {
      const key = normalizeLookup(String(item.name || ''))
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function findScriptStructuralIssues(rawContent: string, rawSource = '') {
  const content = String(rawContent || '')
  const issues: string[] = []

  if (/\*\*/.test(content)) {
    issues.push('Roteiro contem markdown residual em negrito.')
  }

  if (/(?:^|\n)\s*[*_#` ]*(?:fim do roteiro|the end)[*_#` ]*(?:\n|$)/i.test(content)) {
    issues.push('Roteiro contem marcador editorial de encerramento.')
  }

  if (GENERIC_SPEAKER_LINE_RE.test(content)) {
    issues.push('Roteiro contem falas com rotulos genericos como "Oficial 1" ou "Voz do Oficial".')
  }

  const unexpectedSpeakers = findUnexpectedNamedSpeakers(content, rawSource)
  if (unexpectedSpeakers.length) {
    issues.push(`Roteiro contem falantes nao autorizados pelo material de origem: ${unexpectedSpeakers.join(', ')}.`)
  }

  return issues
}

function normalizeLookup(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function tokenizeName(value: string) {
  return String(value || '')
    .split(/\s+/)
    .map(token => token.replace(/[^A-Za-zÀ-ÿ'’.-]/g, ''))
    .filter(Boolean)
}

function isLikelyHumanName(value: string) {
  const tokens = tokenizeName(value).map(normalizeLookup)
  if (tokens.length < 2) return false
  if (tokens.some(token => NON_PERSON_NAME_TOKENS.has(token))) return false
  return true
}

export function extractAllowedSpeakerNamesFromSource(rawSource: string) {
  const source = String(rawSource || '')
  const candidates = new Set<string>()

  const fullNamePattern = /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]{2,}\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]{2,}(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]{2,})?\b/g
  for (const match of source.matchAll(fullNamePattern)) {
    const fullName = String(match[0] || '').trim()
    if (!isLikelyHumanName(fullName)) continue

    const startIndex = Number(match.index || 0)
    const prefixWindow = source.slice(Math.max(0, startIndex - 40), startIndex)
    const prefixNormalized = normalizeLookup(prefixWindow)
    if (/\b(?:de|da|do|dos|das)\s*$/.test(prefixNormalized)) continue
    if (/\b(?:esquadra|armada|frota|expedicao|expedição|coroa|reino|guerra)\s+de\s*$/.test(prefixNormalized)) continue

    const titleMatch = prefixWindow.match(/(?:capit[aã]o|oficial|marinheiro|senhor|senhora|dona|dom|rei|rainha|pr[ií]ncipe|princesa)\s*$/i)
    if (titleMatch?.[0]) {
      const title = titleMatch[0].trim()
      const canonicalTitle = title.charAt(0).toUpperCase() + title.slice(1).toLowerCase()
      candidates.add(`${canonicalTitle} ${fullName}`)
    }

    candidates.add(fullName)
  }

  return [...candidates]
}

function resolveCanonicalAllowedName(candidate: string, allowedNames: string[]) {
  const candidateTokens = normalizeSpeakerTokens(candidate)
  if (!candidateTokens.length) return ''

  const matches = allowedNames
    .map((allowedName) => ({
      original: allowedName,
      tokens: normalizeSpeakerTokens(allowedName),
    }))
    .filter((allowed) => {
      if (!allowed.tokens.length) return false
      if (candidateTokens.join(' ') === allowed.tokens.join(' ')) return true
      const candidateTail = candidateTokens[candidateTokens.length - 1]
      const allowedTail = allowed.tokens[allowed.tokens.length - 1]
      if (!candidateTail || candidateTail !== allowedTail) return false
      const candidateJoined = candidateTokens.join(' ')
      const allowedJoined = allowed.tokens.join(' ')
      return candidateJoined.endsWith(allowedJoined) || allowedJoined.endsWith(candidateJoined)
    })

  if (!matches.length) return ''
  return matches
    .map(match => match.original)
    .sort((left, right) => right.length - left.length)[0] || ''
}

export function buildAllowedSpeakerHint(rawSource: string) {
  const allowedNames = extractAllowedSpeakerNamesFromSource(rawSource)
  if (!allowedNames.length) {
    return 'No explicitly named human character was identified in the source material. Do not create named dialogue labels.'
  }

  return `Source-grounded named humans detected in the material: ${allowedNames.join(', ')}. This list is a hard allowlist for possible speaker labels, but it is not blanket permission to make everyone speak. Only use a speaker label when the source clearly presents that person as present and acting in the dramatic moment. If a named person is mentioned only as background context, memory, history, or distant authority, keep that person in action prose only.`
}
