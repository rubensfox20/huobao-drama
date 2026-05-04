export type ParsedScreenplayScene = {
  index: number
  headingRaw: string
  location: string
  time: string
  body: string
  lines: string[]
  sourceQuote: string
}

export type ScreenplayMention = {
  name: string
  sourceQuote: string
  sceneIndex: number
  location: string
  time: string
}

const INTERNAL_SCENE_HEADER_RE = /^##\s*S\d+\s*\|\s*(.+?)\s*\|\s*(.+)$/i
const STANDARD_SCENE_HEADER_RE = /^(INT\.?|EXT\.?|INT\/EXT\.?|EXT\/INT\.?|I\/E\.?|INTERIOR|EXTERIOR)\s+(.+)$/i
const DIALOGUE_LINE_RE = /^([^#\n:：]{2,60})[:：]\s*(.+)$/
const FULL_NAME_RE = /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]{2,}\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]{2,}(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]{2,})?\b/g
const NAMED_SHIP_RE = /\b(?:HMS|USS|RMS|SS|MV|MS)\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*){0,2}\b/g
const OBJECT_PATTERN_RE = /\b(?:navio|barco|carro|autom[oó]vel|caminh[aã]o|moto|motocicleta|avi[aã]o|helic[oó]ptero|nave|submarino|artefato|amuleto|espada|pistola|rifle|arma|anel|livro|telefone|r[aá]dio|mapa|chave|ship|boat|vehicle|artifact|amulet|sword|weapon|ring|book|phone|radio|map|key)\s+(?:[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*){0,2})/g
const TIME_HINT_RE = /\b(day|night|dawn|dusk|morning|afternoon|evening|continuous|later|same time|dia|noite|amanhecer|entardecer|tarde|manh[aã]|madrugada|logo depois|mais tarde|cont[ií]nuo)\b/i
const HUMAN_CONTEXT_RE = /\b(capit[aã]o|captain|oficial|officer|marinheiro|sailor|soldado|soldier|tripula[cç][aã]o|crew|marine|marines|homem|homens|woman|women|mulher|mulheres|comandante|commander)\b/i
const HUMAN_ACTION_RE = /\b(tenta|tentam|assume|assumem|encontra|encontram|observa|observam|ordena|ordenam|cai|caem|ferido|ferida|doente|adoece|adoecem|mede|medem|destaca|destacam|comanda|comandam|trabalha|trabalham|reza|rezam|delira|deliram|tries|try|assumes|finds|orders|falls|watches|observes|measures|commands|stands|leads)\b/i
const NON_PERSON_TOKENS = new Set([
  'atlantico', 'atlântico', 'patagonia', 'patagônia', 'costa', 'praia', 'ilha', 'ilhas', 'oceano', 'mar',
  'coroa', 'reino', 'companhia', 'indias', 'índias', 'america', 'américa', 'pacifico', 'pacífico',
  'marinha', 'real', 'cabo', 'horn', 'esquadra',
  'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro', 'janeiro', 'fevereiro', 'marco', 'março',
])

function normalizeWhitespace(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeTokenCase(value: string) {
  if (!value) return ''
  if (/^(HMS|USS|RMS|SS|MV|MS|II|III|IV|VI|VII|VIII|IX|X)$/i.test(value)) return value.toUpperCase()
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function cleanupLine(value: string) {
  return normalizeWhitespace(String(value || '').replace(/[`*_>#]/g, ' '))
}

function isCapitalizedToken(value: string) {
  if (!value) return false
  return /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*$/.test(value) || /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{2,}$/.test(value)
}

function normalizeLookup(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function parseInternalHeading(sceneBody: string, time: string) {
  const parts = normalizeWhitespace(sceneBody).split('·').map(part => normalizeWhitespace(part)).filter(Boolean)
  return {
    location: parts.length > 1 ? parts[parts.length - 1] : normalizeWhitespace(sceneBody),
    time: normalizeWhitespace(time),
  }
}

function parseStandardHeading(rest: string) {
  const normalized = normalizeWhitespace(String(rest || '').replace(/\s*[—–]\s*/g, ' - '))
  const parts = normalized.split(/\s+-\s+/).map(part => normalizeWhitespace(part)).filter(Boolean)
  if (parts.length < 2) {
    return { location: normalized, time: '' }
  }

  const last = parts[parts.length - 1] || ''
  if (TIME_HINT_RE.test(last) || last.length <= 32) {
    return {
      location: parts.slice(0, -1).join(' - '),
      time: last,
    }
  }

  return { location: normalized, time: '' }
}

function parseHeading(line: string) {
  const internal = line.match(INTERNAL_SCENE_HEADER_RE)
  if (internal) {
    const parsed = parseInternalHeading(internal[1] || '', internal[2] || '')
    return {
      location: parsed.location,
      time: parsed.time,
      sourceQuote: cleanupLine(line),
    }
  }

  const standard = line.match(STANDARD_SCENE_HEADER_RE)
  if (standard) {
    const parsed = parseStandardHeading(standard[2] || '')
    return {
      location: parsed.location,
      time: parsed.time,
      sourceQuote: cleanupLine(line),
    }
  }

  return null
}

export function parseScreenplayStructure(script: string): ParsedScreenplayScene[] {
  const lines = String(script || '').replace(/\r\n?/g, '\n').split('\n')
  const scenes: ParsedScreenplayScene[] = []

  let current: ParsedScreenplayScene | null = null

  const pushCurrent = () => {
    if (!current) return
    current.body = current.lines.join('\n').trim()
    scenes.push(current)
  }

  for (const rawLine of lines) {
    const line = String(rawLine || '')
    const heading = parseHeading(line.trim())
    if (heading) {
      pushCurrent()
      current = {
        index: scenes.length,
        headingRaw: line.trim(),
        location: heading.location,
        time: heading.time,
        body: '',
        lines: [],
        sourceQuote: heading.sourceQuote,
      }
      continue
    }

    if (!current) continue
    current.lines.push(line)
  }

  pushCurrent()

  if (scenes.length) return scenes

  return [{
    index: 0,
    headingRaw: '',
    location: 'Cenario principal',
    time: '',
    body: String(script || '').trim(),
    lines: String(script || '').replace(/\r\n?/g, '\n').split('\n'),
    sourceQuote: '',
  }]
}

export function extractDialogueSpeakerMentions(script: string): ScreenplayMention[] {
  const scenes = parseScreenplayStructure(script)
  const mentions: ScreenplayMention[] = []

  for (const scene of scenes) {
    for (const rawLine of scene.lines) {
      const line = cleanupLine(rawLine)
      const match = line.match(DIALOGUE_LINE_RE)
      if (!match) continue
      mentions.push({
        name: cleanupLine(match[1] || ''),
        sourceQuote: cleanupLine(`${match[1] || ''}: ${match[2] || ''}`).slice(0, 280),
        sceneIndex: scene.index,
        location: scene.location,
        time: scene.time,
      })
    }
  }

  return mentions
}

export function extractTitledCharacterMentions(script: string): ScreenplayMention[] {
  const scenes = parseScreenplayStructure(script)
  const mentions: ScreenplayMention[] = []
  const titlePattern = /\b(capit[aã]o|oficial|marinheiro|senhor|senhora|dona|dom|rei|rainha|principe|príncipe|princesa|doutor|doutora|soldado|captain|officer|sailor|mister|mr\.?|mrs\.?|ms\.?|doctor|dr\.?|king|queen|prince|princess)\b/gi

  for (const scene of scenes) {
    const body = scene.body || ''
    for (const match of body.matchAll(titlePattern)) {
      const title = normalizeTokenCase(match[1] || '')
      const tail = body.slice(Number(match.index || 0) + String(match[0] || '').length).trim()
      const rawTokens = tail
        .split(/\s+/)
        .map(token => token.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ'’.-]+$/g, ''))
        .filter(Boolean)
      const nameTokens: string[] = []
      for (const token of rawTokens) {
        if (!isCapitalizedToken(token)) break
        nameTokens.push(normalizeTokenCase(token))
        if (nameTokens.length >= 3) break
      }
      if (!nameTokens.length) continue
      const fullName = cleanupLine(`${title} ${nameTokens.join(' ')}`)
      if (!fullName) continue
      mentions.push({
        name: fullName,
        sourceQuote: fullName.slice(0, 280),
        sceneIndex: scene.index,
        location: scene.location,
        time: scene.time,
      })
    }
  }

  return mentions
}

export function extractFullNameCharacterMentions(script: string): ScreenplayMention[] {
  const scenes = parseScreenplayStructure(script)
  const counts = new Map<string, number>()

  for (const scene of scenes) {
    for (const match of scene.body.matchAll(FULL_NAME_RE)) {
      const name = cleanupLine(match[0] || '')
      if (!name || NAMED_SHIP_RE.test(name)) continue
      const tokens = name.split(/\s+/).map(normalizeLookup)
      if (tokens.some(token => NON_PERSON_TOKENS.has(token))) continue
      counts.set(name, (counts.get(name) || 0) + 1)
    }
  }

  const mentions: ScreenplayMention[] = []
  for (const scene of scenes) {
    for (const match of scene.body.matchAll(FULL_NAME_RE)) {
      const name = cleanupLine(match[0] || '')
      if (!name || NAMED_SHIP_RE.test(name)) continue

      const tokens = name.split(/\s+/).map(normalizeLookup)
      if (tokens.some(token => NON_PERSON_TOKENS.has(token))) continue

      const start = Number(match.index || 0)
      const context = scene.body.slice(Math.max(0, start - 60), Math.min(scene.body.length, start + name.length + 80))
      const hasHumanContext = HUMAN_CONTEXT_RE.test(context)
      const hasHumanAction = HUMAN_ACTION_RE.test(context)
      const repeated = (counts.get(name) || 0) >= 2
      if (!hasHumanContext && !hasHumanAction && !repeated) continue

      mentions.push({
        name,
        sourceQuote: cleanupLine(context).slice(0, 280),
        sceneIndex: scene.index,
        location: scene.location,
        time: scene.time,
      })
    }
  }

  return mentions
}

export function extractPropMentions(script: string): ScreenplayMention[] {
  const scenes = parseScreenplayStructure(script)
  const mentions: ScreenplayMention[] = []

  for (const scene of scenes) {
    const body = [scene.headingRaw, scene.body].filter(Boolean).join('\n')
    for (const match of body.matchAll(NAMED_SHIP_RE)) {
      const name = cleanupLine(match[0] || '')
      if (!name) continue
      mentions.push({
        name,
        sourceQuote: name.slice(0, 280),
        sceneIndex: scene.index,
        location: scene.location,
        time: scene.time,
      })
    }

    for (const match of body.matchAll(OBJECT_PATTERN_RE)) {
      const name = cleanupLine(match[0] || '')
      if (!name) continue
      mentions.push({
        name,
        sourceQuote: name.slice(0, 280),
        sceneIndex: scene.index,
        location: scene.location,
        time: scene.time,
      })
    }
  }

  return mentions
}
