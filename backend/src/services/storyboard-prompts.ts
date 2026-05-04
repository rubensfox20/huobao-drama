const VISUAL_DIALOGUE_TERMS = /\b(?:dialog(?:ue)?|speech|spoken|voice(?: ?over)?|subtitle(?:s)?|caption(?:s|ed)?|speech bubbles?|text overlay|on[- ]screen|lyrics?|lip[- ]?sync|lipsync|narration|narrat(?:e|es|ed|ing)|say|says|said|speak|speaks|speaking|talk|talks|talking|whisper|whispers|whispering|shout|shouts|shouting|ask|asks|asking|answer|answers|answering|dialogo|diálogo|falas?|falando|diz(?:endo)?|narra(?:cao|ção|ndo)?|sussurra(?:ndo)?|grita(?:ndo)?|pergunta(?:ndo)?|responde(?:ndo)?|voz(?:es)?|fala com|pergunta a)\b/gi
const TIMELINE_SEGMENT_RE = /(\d+\s*[-–]\s*\d+\s*(?:s|sec(?:ond)?s?))\s*(?::|\|)\s*([\s\S]*?)(?=(?:\d+\s*[-–]\s*\d+\s*(?:s|sec(?:ond)?s?))\s*(?::|\|)|$)/gi
const LOCATION_TAG_RE = /<\s*location\s*>([\s\S]*?)<\s*\/\s*location\s*>/gi
const NON_ENGLISH_MARKERS = /[ãáàâéêíóôõúç]|\b(?:de|da|do|das|dos|uma|um|para|com|sem|entre|sobre|pelo|pela|pelos|pelas|que|quando|enquanto|pois|ainda|comeca|começa|olha|segura|perde|torna|janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|tensa|silenciosa|corrosiva|desolada|miseravel|miserável|hostil|sombria|opressiva)\b/i

const VISUAL_TRANSLATIONS: Array<[RegExp, string]> = [
  [/\bEst[aá]tico\b/gi, 'static shot'],
  [/\bplano geral\b/gi, 'wide shot'],
  [/\bplano m[eé]dio\b/gi, 'medium shot'],
  [/\bplano detalhe\b/gi, 'detail shot'],
  [/\bOlho do n[ií]vel\b/gi, 'eye-level shot'],
  [/\bao n[ií]vel dos olhos\b/gi, 'eye-level'],
  [/\bContra[- ]plano\b/gi, 'reverse angle shot'],
  [/\bvista a[eé]rea\b/gi, 'aerial view'],
  [/\bpanor[aâ]mico\b/gi, 'panoramic shot'],
  [/\bleve zoom\b/gi, 'slow zoom'],
  [/\bc[aâ]mera quase est[aá]tica\b/gi, 'nearly static camera'],
  [/\bcamera quase estatica\b/gi, 'nearly static camera'],
  [/\bclose-up no rosto de\b/gi, 'close-up of'],
  [/\bclose-up no rosto\b/gi, 'close-up'],
  [/\bpreocupa[cç][aã]o\b/gi, 'concerned expression'],
  [/\bexpress[aã]o preocupada\b/gi, 'concerned expression'],
  [/\bexpress[aã]o ansiosa\b/gi, 'anxious expression'],
  [/\bexpress[aã]o de dor\b/gi, 'pained expression'],
  [/\bexpress[aã]o de despedida\b/gi, 'farewell expression'],
  [/\bl[aá]grimas de determined expression nos olhos\b/gi, 'tearful determined eyes'],
  [/\bdetermina[cç][aã]o\b/gi, 'determined expression'],
  [/\bl[aá]grimas de determina[cç][aã]o nos olhos\b/gi, 'tearful determined eyes'],
  [/\bl[aá]grimas de luz\b/gi, 'tears of light'],
  [/\bl[aá]grimas\b/gi, 'tears'],
  [/\bolho intenso\b/gi, 'intense gaze'],
  [/\bboca formando\b/gi, 'tight mouth close-up'],
  [/\bboca\b/gi, 'mouth'],
  [/\bluz intensa\b/gi, 'intense light'],
  [/\bluz azul\b/gi, 'blue light'],
  [/\bobservando\b/gi, 'watching'],
  [/\bluz fria\b/gi, 'cold light'],
  [/\bcontraste\b/gi, 'contrast'],
  [/\beterea\b/gi, 'ethereal glow'],
  [/\bdesvanecendo\b/gi, 'fading away'],
  [/\bpoeira luminosa flutuando\b/gi, 'luminous dust swirling'],
  [/\bpoeira luminosa brilhando nas nuvens\b/gi, 'luminous dust glowing through the clouds'],
  [/\bnuvens carregadas movendo(?:‑|-)?se lentamente\b/gi, 'heavy storm clouds drifting slowly'],
  [/\bpedras se deslocando\b/gi, 'rocks shifting'],
  [/\bmovimento de rota[cç][aã]o\b/gi, 'rotational movement'],
  [/\btrajeto alterado\b/gi, 'course shifting'],
  [/\bluz lunar refletindo nas rochas\b/gi, 'moonlight reflecting on the rocks'],
  [/\bpele transl[uú]cida\b/gi, 'translucent skin'],
  [/\btornando(?:‑|-)?se sombra luminosa\b/gi, 'turning into a luminous silhouette'],
  [/\bclar[aã]o explosivo\b/gi, 'explosive flash'],
  [/\bclar[aã]o final explode\b/gi, 'final flash erupting'],
  [/\bc[eé]u clareando\b/gi, 'sky clearing'],
  [/\bestrelas surgindo\b/gi, 'stars emerging'],
  [/\bnoite estrelada\b/gi, 'starry night'],
  [/\bsombra luminosa ao lado\b/gi, 'luminous silhouette nearby'],
  [/\bpele perde a cor e torna-se transl[uú]cida\b/gi, 'skin losing color and turning translucent'],
  [/\bMasculino\b/gi, 'male'],
  [/\bFeminina\b/gi, 'female'],
  [/\bjovem adult[oa]\b/gi, 'young adult'],
  [/\bporte atl[eé]tico\b/gi, 'athletic build'],
  [/\bt[uú]nica\b/gi, 'tunic'],
  [/\barmadura leve\b/gi, 'light armor'],
  [/\bquase et[eé]rea\b/gi, 'almost ethereal'],
  [/\bfeito de luz\b/gi, 'made of light'],
  [/\bcapa leve\b/gi, 'light cloak'],
  [/\bbotas resistentes\b/gi, 'sturdy boots'],
  [/\bambiente ventoso\b/gi, 'wind-swept setting'],
  [/\bProtagonista\b/gi, 'protagonist'],
  [/\bCo[-‑ ]protagonista\b/gi, 'co-protagonist'],
  [/\bIlumin[aã]c[aã]o dourada\b/gi, 'golden lighting'],
  [/\bLuz dourada\b/gi, 'golden light'],
  [/\bLuz suave\b/gi, 'soft light'],
  [/\btons quentes\b/gi, 'warm tones'],
  [/\btons cinzentos\b/gi, 'gray tones'],
  [/\bTom emocional\b/gi, 'emotional tone'],
  [/\btens[aã]o\b/gi, 'tension'],
  [/\bemo[cç][aã]o palp[aá]vel\b/gi, 'palpable emotion'],
  [/\bclima de ansiedade\b/gi, 'anxious mood'],
  [/\bclima de resolu[cç][aã]o\b/gi, 'sense of resolve'],
  [/\bsensa[cç][aã]o de poder\b/gi, 'sense of power'],
  [/\bsensa[cç][aã]o de iminente colis[aã]o\b/gi, 'sense of imminent collision'],
  [/\bLuz azul intensa\b/gi, 'intense blue light'],
  [/\bdeterminado\b/gi, 'determined'],
  [/\bsacrificial\b/gi, 'self-sacrificial'],
  [/\bcarregado de culpa\b/gi, 'burdened by guilt'],
  [/\bpreocupada\b/gi, 'concerned'],
  [/\bemp[aá]tica\b/gi, 'empathetic'],
  [/\bcorajosa\b/gi, 'brave'],
  [/\bExterior\b/gi, 'exterior'],
  [/\bInterior\b/gi, 'interior'],
  [/\bEntardecer\b/gi, 'dusk'],
  [/\bNoite\b/gi, 'night'],
  [/\bAmanhecer\b/gi, 'dawn'],
  [/\bDia\b/gi, 'daylight'],
  [/\bJaneiro\b/gi, 'January'],
  [/\bFevereiro\b/gi, 'February'],
  [/\bMar[cç]o\b/gi, 'March'],
  [/\bAbril\b/gi, 'April'],
  [/\bMaio\b/gi, 'May'],
  [/\bJunho\b/gi, 'June'],
  [/\bJulho\b/gi, 'July'],
  [/\bAgosto\b/gi, 'August'],
  [/\bSetembro\b/gi, 'September'],
  [/\bOutubro\b/gi, 'October'],
  [/\bNovembro\b/gi, 'November'],
  [/\bDezembro\b/gi, 'December'],
  [/\btensa\b/gi, 'tense'],
  [/\bsilenciosa\b/gi, 'silent'],
  [/\bcorrosiva\b/gi, 'corrosive'],
  [/\bdesolada\b/gi, 'desolate'],
  [/\bmiser[aá]vel\b/gi, 'miserable'],
  [/\bhostil\b/gi, 'hostile'],
  [/\bsombria\b/gi, 'somber'],
  [/\bopressiva\b/gi, 'oppressive'],
  [/\bmar frio\b/gi, 'cold sea'],
  [/\brochas escuras\b/gi, 'dark rocks'],
  [/\bvento duro\b/gi, 'harsh wind'],
  [/\bfloresta comprimindo a praia\b/gi, 'forest pressing against the beach'],
  [/\bfloresta\b/gi, 'forest'],
  [/\bpraia\b/gi, 'beach'],
]

const SUPPORT_PROMPT_TRANSLATIONS: Array<[RegExp, string]> = [
  [/\bm[uú]sica [ée]pica ambiental\b/gi, 'epic ambient music'],
  [/\bm[uú]sica tensa com notas de sintetizador\b/gi, 'tense music with synthesizer notes'],
  [/\bm[uú]sica dram[aá]tica, crescendo de cordas\b/gi, 'dramatic music with swelling strings'],
  [/\bmelodia suave com piano\b/gi, 'soft piano melody'],
  [/\bm[uú]sica suspense leve\b/gi, 'light suspense music'],
  [/\bm[uú]sica heroica, batidas [ée]picas\b/gi, 'heroic music with epic percussion'],
  [/\borquestra[cç][aã]o [ée]pica, crescendo\b/gi, 'epic orchestral crescendo'],
  [/\bm[uú]sica ambiental et[eé]rea, tons baixos\b/gi, 'ethereal ambient music with low tones'],
  [/\bm[uú]sica melanc[oó]lica, piano suave\b/gi, 'melancholic music with soft piano'],
  [/\bm[uú]sica de luto, notas baixas\b/gi, 'mournful music with low notes'],
  [/\bm[uú]sica triunfante, crescendo\b/gi, 'triumphant music with rising crescendo'],
  [/\bmelodia triste, cordas suaves\b/gi, 'sad melody with soft strings'],
  [/\btons sombrios\b/gi, 'dark tones'],
  [/\btons baixos\b/gi, 'low tones'],
  [/\bvento forte, poeira chiando\b/gi, 'strong wind, hissing dust'],
  [/\bzumbido de energia\b/gi, 'energy hum'],
  [/\bsussurro do vento\b/gi, 'whispering wind'],
  [/\bbrilho suave do artefato\b/gi, 'soft artifact shimmer'],
  [/\bsussurro da brisa\b/gi, 'whispering breeze'],
  [/\bcrack de energia\b/gi, 'crackling energy'],
  [/\bzumbido crescente\b/gi, 'rising energy hum'],
  [/\bsom de rochas ralando\b/gi, 'grinding rocks'],
  [/\bsussurro et[eé]reo\b/gi, 'ethereal whisper'],
  [/\beco suave\b/gi, 'soft echo'],
  [/\bexplos[aã]o de luz\b/gi, 'burst of light'],
  [/\bl[aá]grimas caindo\b/gi, 'falling tears'],
]

function hasDialogueTerm(value: string) {
  VISUAL_DIALOGUE_TERMS.lastIndex = 0
  return VISUAL_DIALOGUE_TERMS.test(value)
}

function cleanupPrompt(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[：]/g, ':')
    .replace(/[；]/g, ';')
    .replace(/[，]/g, ',')
    .replace(/[｜]/g, '|')
    .replace(/[。]/g, '.')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*([,;:.])\s*/g, '$1 ')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/([,;|:.]){2,}/g, '$1')
    .replace(/,\s*,+/g, ', ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\[\s*\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .replace(/^[,;|.\s]+/, '')
    .replace(/[,;|.\s]+$/, '')
    .trim()
}

function keepEnglishFragments(value: string) {
  const englishHints = /\b(?:the|with|under|over|into|across|close|wide|medium|detail|shot|camera|wind|storm|historical|cinematic|survivors|cold|rocks|beach|coast|rain|expression|light|artifact|group|island|captain|authority|identity|continuity|setting|period|time|day|night|dusk|dawn|static|eye-level|tense|silent|corrosive|desolate|hostile|somber|oppressive)\b/i
  const portugueseHints = /\b(?:desobediencia|obediencia|latente|domina|dominar|grupo|praia|ilha|navio|homens|sobreviventes|capitao|capitão|autoridade|isolamento|travessia|fragil|frágil|destruicao|destruição)\b/i
  const parts = value
    .split(/\s*(?:,|;|\.|\be\b)\s*/g)
    .map(part => cleanupPrompt(part))
    .filter(Boolean)
  const englishOnly = parts.filter((part) => {
    if (NON_ENGLISH_MARKERS.test(part)) return false
    if (portugueseHints.test(part) && !englishHints.test(part)) return false
    return true
  })
  return cleanupPrompt(englishOnly.join(', '))
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s*;\s*/g, '; ')
}

export function normalizeLocationEnglish(value: string) {
  let text = cleanupPrompt(value)
  if (!text) return ''

  for (const [pattern, replacement] of VISUAL_TRANSLATIONS) {
    text = text.replace(pattern, replacement)
  }

  return cleanupPrompt(text)
    .replace(/^Rua da Vila$/i, 'village street')
    .replace(/^Praça da Vila$/i, 'village square')
    .replace(/^Praca da Vila$/i, 'village square')
    .replace(/^Pátio da Vila$/i, 'village courtyard')
    .replace(/^Patio da Vila$/i, 'village courtyard')
    .replace(/^Centro da Vila$/i, 'village center')
    .replace(/^Ilha ([A-Za-zÀ-ÿ' -]+)$/i, '$1 island')
    .replace(/^Ilha de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 Island')
    .replace(/^Vila de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 village')
    .replace(/^Rua de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 street')
    .replace(/^Praça de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 square')
    .replace(/^Praca de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 square')
    .replace(/^Pátio de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 courtyard')
    .replace(/^Patio de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 courtyard')
    .replace(/^Centro de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 center')
    .replace(/^A bordo d[oa] ([A-Za-zÀ-ÿ' -]+)$/i, 'aboard the $1')
    .replace(/^Aproxima[cç][aã]o do ([A-Za-zÀ-ÿ' -]+)$/i, 'approach to $1')
    .replace(/\bPr[oó]ximo [àa]\b/gi, 'near')
    .replace(/\bProximo a\b/gi, 'near')
    .replace(/\bCosta da\b/gi, 'coast of')
    .replace(/\bCosta do\b/gi, 'coast of')
    .replace(/\bPraia da\b/gi, 'beach of')
    .replace(/\bPraia do\b/gi, 'beach of')
    .replace(/\bIlha da\b/gi, 'island of')
    .replace(/\bIlha do\b/gi, 'island of')
    .replace(/\bGolfo de\b/gi, 'Gulf of')
    .replace(/\bBa[ií]a de\b/gi, 'Bay of')
    .replace(/\bregi[aã]o do\b/gi, 'region of')
    .replace(/\bregi[aã]o da\b/gi, 'region of')
    .replace(/\bcosta oeste\b/gi, 'west coast')
    .replace(/\bcosta leste\b/gi, 'east coast')
    .replace(/\bem mar aberto\b/gi, 'in open sea')
    .replace(/\bmar aberto\b/gi, 'open sea')
    .replace(/\bCosta desolada\b/gi, 'desolate coast')
    .replace(/\bIlha desolada\b/gi, 'desolate island')
    .replace(/\bAcampamento improvisado na costa\b/gi, 'makeshift camp on the coast')
    .replace(/\bAcampamento improvisado na praia\b/gi, 'makeshift camp on the beach')
    .replace(/\bPraia e margem da floresta\b/gi, 'beach and forest edge')
    .replace(/\bCabo ([A-Za-zÀ-ÿ' -]+)\b/gi, 'Cape $1')
}

export function translateVisualText(value?: string | null) {
  let text = cleanupPrompt(String(value || ''))
  if (!text) return ''

  text = normalizeLocationEnglish(text)
  for (const [pattern, replacement] of VISUAL_TRANSLATIONS) {
    text = text.replace(pattern, replacement)
  }

  return cleanupPrompt(text)
    .replace(/\bclose-up of of\b/gi, 'close-up of')
    .replace(/\bwide shot of of\b/gi, 'wide shot of')
    .replace(/\bmedium shot of of\b/gi, 'medium shot of')
    .replace(/\bself-self-sacrificial\b/gi, 'self-sacrificial')
    .replace(/\bcontrast forte\b/gi, 'strong contrast')
    .replace(/\bblue light intensa\b/gi, 'intense blue light')
    .replace(/\bO artefato brilha mais forte, refletindo a concerned expression\b\.?/gi, 'artifact glowing brighter, reflecting her concern')
    .replace(/\bA camera foca no brilho of determined expression in the eyes dele\b\.?/gi, 'camera focusing on determination in his eyes')
    .replace(/\bnos olhos\b/gi, 'in the eyes')
    .replace(/\bao redor\b/gi, 'around him')
    .replace(/\bfim do dia\b/gi, 'late day')
    .replace(/\bfim do daylight\b/gi, 'late day')
    .replace(/\banoitecer\b/gi, 'nightfall')
    .replace(/\bin[ií]cio de (\d{4})\b/gi, 'early $1')
    .replace(/\bmeados? de (\d{4})\b/gi, 'mid $1')
    .replace(/\bfinal de (\d{4})\b/gi, 'late $1')
    .replace(/\bpouco antes de\b/gi, 'shortly before')
    .replace(/\bantes de\b/gi, 'before')
    .replace(/\bdepois de\b/gi, 'after')
    .replace(/\bde (\d{4})\b/gi, '$1')
    .replace(/\b(\d{1,2}) de ([A-Z][a-z]+) de (\d{4})\b/g, '$1 $2 $3')
    .replace(/\b(\d{1,2}) de ([A-Z][a-z]+) (\d{4})\b/g, '$1 $2 $3')
}

export function translateSupportText(value?: string | null) {
  let text = cleanupPrompt(String(value || ''))
  if (!text) return ''

  for (const [pattern, replacement] of [...VISUAL_TRANSLATIONS, ...SUPPORT_PROMPT_TRANSLATIONS]) {
    text = text.replace(pattern, replacement)
  }

  return cleanupPrompt(text)
    .replace(/\bmusica ambiental ethereal glow\b/gi, 'ethereal ambient music')
    .replace(/\btears caindo\b/gi, 'falling tears')
}

function stripSpeechAnnotations(value: string) {
  let prompt = value
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/"[^"\n]{1,240}"/g, ' ')

  prompt = prompt.replace(/\(([^)]{0,180})\)/g, (match, inner) => (hasDialogueTerm(inner) ? ' ' : match))
  prompt = prompt.replace(/\[([^\]]{0,180})\]/g, (match, inner) => (hasDialogueTerm(inner) ? ' ' : match))
  prompt = prompt.replace(VISUAL_DIALOGUE_TERMS, ' ')
  prompt = prompt.replace(/\bboca formando pergunta\b/gi, ' ')
  prompt = prompt.replace(/\b(.+?)\s*:\s*(?=,|;|\.|$)/g, '$1')

  return cleanupPrompt(prompt)
}

function hasTimelineStructure(value: string) {
  TIMELINE_SEGMENT_RE.lastIndex = 0
  return TIMELINE_SEGMENT_RE.test(value)
}

function uniqueTokens(values: string[]) {
  const seen = new Set<string>()
  const items: string[] = []

  for (const value of values) {
    const token = cleanupPrompt(value)
    if (!token) continue
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(token)
  }

  return items
}

function repairLocationQualifier(parts: string[]) {
  if (parts.length < 2) return parts
  const locationMatch = parts[0]?.match(/^location:\s*([A-Za-zÀ-ÿ' -]+)$/i)
  const tailMatch = parts[parts.length - 1]?.match(/^(.*\S)\s+(village|street|square|courtyard|center)$/i)
  if (!locationMatch || !tailMatch) return parts
  if (/\b(?:village|street|square|courtyard|center)\b/i.test(locationMatch[1])) return parts

  parts[0] = `location: ${locationMatch[1]} ${tailMatch[2].toLowerCase()}`
  parts[parts.length - 1] = tailMatch[1]
  return parts
}

function normalizeTimelineToken(value: string) {
  const translated = translateVisualText(value)
    .replace(/^location:\s*(.+)$/i, (_, location) => `location: ${normalizeLocationEnglish(location)}`)
    .replace(/\bclose-up on\b/gi, 'close-up of')
    .replace(/\blow angle on\b/gi, 'low-angle shot of')
    .replace(/\bcut to reaction of\b/gi, 'reaction shot of')
    .replace(/\bfade to next scene\b/gi, 'fade out')
    .replace(/\blooking terrified\b/gi, 'terrified expression')
    .replace(/\bdetermined eyes\b/gi, 'determined expression')
    .replace(/\bdetermined face\b/gi, 'determined expression')

  if (/^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{1,32}$/.test(translated)) return ''
  return cleanupPrompt(translated)
}

function normalizeTimelineBody(value: string) {
  const withLocation = value
    .replace(LOCATION_TAG_RE, (_, location) => `location: ${normalizeLocationEnglish(location)}`)
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\.\s*/g, ', ')
    .replace(/\s*;\s*/g, ', ')

  const parts = uniqueTokens(
    withLocation
      .split(/\s*(?:,|\|)\s*/g)
      .map(normalizeTimelineToken),
  )

  repairLocationQualifier(parts)
  return parts.join(' | ')
}

export function normalizeTimelinePrompt(value?: string | null): string {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const segments: string[] = []
  let matched = false
  TIMELINE_SEGMENT_RE.lastIndex = 0

  for (const match of raw.matchAll(TIMELINE_SEGMENT_RE)) {
    matched = true
    const window = cleanupPrompt(match[1])
      .replace(/\s*[-–]\s*/g, '-')
      .replace(/\bseconds?\b/gi, 's')
      .replace(/\bsecs?\b/gi, 's')
      .toLowerCase()
    const body = normalizeTimelineBody(match[2] || '')
    segments.push(body ? `${window} | ${body}` : window)
  }

  if (matched) {
    return segments
      .join('; ')
      .replace(/\s*\|\s*/g, ' | ')
      .replace(/\s*;\s*/g, '; ')
      .trim()
  }
  return normalizeTimelineBody(raw)
}

export function sanitizeVisualPrompt(value?: string | null): string {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const sanitized = translateVisualText(stripSpeechAnnotations(raw))
  LOCATION_TAG_RE.lastIndex = 0
  if (hasTimelineStructure(sanitized) || LOCATION_TAG_RE.test(sanitized)) {
    LOCATION_TAG_RE.lastIndex = 0
    const normalized = normalizeTimelinePrompt(sanitized) || sanitized || raw
    return keepEnglishFragments(normalized) || normalized
  }
  return keepEnglishFragments(sanitized) || sanitized || raw
}

export function sanitizeSupportPrompt(value?: string | null): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return translateSupportText(raw) || raw
}
