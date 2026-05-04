function clean(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
        .replace(/[：]/g, ':')
    .replace(/[；]/g, ';')
    .replace(/[，]/g, ',')
    .replace(/[｜]/g, '|')
    .replace(/[。]/g, '.')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*([,;:.|])\s*/g, '$1 ')
    .replace(/([,;:.|]){2,}/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .trim()
}

function clipText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  const sliced = value.slice(0, maxLength + 1)
  const boundary = sliced.lastIndexOf(' ')
  return clean(boundary > Math.floor(maxLength * 0.6) ? sliced.slice(0, boundary) : sliced.slice(0, maxLength))
}

const NON_ENGLISH_MARKERS = /[ãáàâéêíóôõúç]|\b(?:de|da|do|das|dos|uma|um|para|com|sem|entre|sobre|pelo|pela|pelos|pelas|que|quando|enquanto|pois|ainda|comeca|começa|olha|segura|perde|torna|janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|tensa|silenciosa|corrosiva|desolada|miseravel|miserável|hostil|sombria|opressiva)\b/i
const TIMELINE_SEGMENT_RE = /(\d+\s*[-–]\s*\d+\s*(?:s|sec(?:ond)?s?))\s*(?::|\|)\s*([\s\S]*?)(?=(?:\d+\s*[-–]\s*\d+\s*(?:s|sec(?:ond)?s?))\s*(?::|\|)|$)/gi
const LOCATION_TAG_RE = /<\s*location\s*>([\s\S]*?)<\s*\/\s*location\s*>/gi

const VISUAL_TRANSLATIONS: Array<[RegExp, string]> = [
  [/\bArquip[eé]lago de Ilhas Flutuantes\b/gi, 'archipelago of floating islands'],
  [/\bEntre as Ilhas Flutuantes\b/gi, 'between the floating islands'],
  [/\bIlhas Flutuantes\b/gi, 'floating islands'],
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
  [/\bKai de p[eé]\b/gi, 'Kai standing'],
  [/\bKai observa o horizonte\b/gi, 'Kai watching the horizon'],
  [/\bKai levanta a m[aã]o\b/gi, 'Kai raising his hand'],
  [/\bLina segura artefato\b/gi, 'Lina holding the artifact'],
  [/\bLina olha para Kai\b/gi, 'Lina looking at Kai'],
  [/\bLina ajoelha\b/gi, 'Lina kneeling'],
  [/\bKai olha para horizonte\b/gi, 'Kai looking toward the horizon'],
  [/\bKai permanece firme\b/gi, 'Kai holds his ground'],
  [/\bartefato brilhando dourado\b/gi, 'glowing golden artifact'],
  [/\bartefato dourado\b/gi, 'golden artifact'],
  [/\bartefato brilhando\b/gi, 'artifact glowing'],
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
  [/\benergia azul ao redor\b/gi, 'blue energy surrounding him'],
  [/\bluz intensa\b/gi, 'intense light'],
  [/\barco of luz azul surgindo\b/gi, 'blue luminous arc emerging'],
  [/\biluminando as nuvens\b/gi, 'illuminating the clouds'],
  [/\barco conectando duas ilhas grandes\b/gi, 'luminous arc connecting two large islands'],
  [/\befeito of movimento nas ilhas\b/gi, 'movement across the islands'],
  [/\bcomecando a girar\b/gi, 'beginning to rotate'],
  [/\benergia do arco conectando ao nucleo\b/gi, 'arc energy connecting to the core'],
  [/\bluz azul\b/gi, 'blue light'],
  [/\bobservando\b/gi, 'watching'],
  [/\bluz fria\b/gi, 'cold light'],
  [/\bcontraste\b/gi, 'contrast'],
  [/\beterea\b/gi, 'ethereal glow'],
  [/\bluz around him intensificando\b/gi, 'light around him intensifying'],
  [/\bdesvanecendo\b/gi, 'fading away'],
  [/\bmovimento of separacao\b/gi, 'separation motion'],
  [/\benergia azul surgindo\b/gi, 'blue energy emerging'],
  [/\bs[ií]mbolo azul pulsando\b/gi, 'glowing blue symbol pulsing'],
  [/\bs[ií]mbolo brilhando intensamente\b/gi, 'symbol glowing intensely'],
  [/\barco luminoso formando\b/gi, 'luminous arc forming'],
  [/\barco se estende ao c[eé]u\b/gi, 'luminous arc extending into the sky'],
  [/\barco se expande\b/gi, 'luminous arc expanding'],
  [/\barco completo\b/gi, 'fully formed luminous arc'],
  [/\bilhas tremendo\b/gi, 'islands trembling'],
  [/\bduas ilhas se aproximando\b/gi, 'two islands closing in'],
  [/\bpoeira luminosa flutuando\b/gi, 'luminous dust swirling'],
  [/\bpoeira luminosa brilhando nas nuvens\b/gi, 'luminous dust glowing through the clouds'],
  [/\bnuvens carregadas movendo(?:‑|-)?se lentamente\b/gi, 'heavy storm clouds drifting slowly'],
  [/\bilha come[cç]a a girar lentamente\b/gi, 'island beginning to rotate slowly'],
  [/\bpedras se deslocando\b/gi, 'rocks shifting'],
  [/\bmovimento de rota[cç][aã]o\b/gi, 'rotational movement'],
  [/\btrajeto alterado\b/gi, 'course shifting'],
  [/\bluz lunar refletindo nas rochas\b/gi, 'moonlight reflecting on the rocks'],
  [/\bAether light envolvendo Kai\b/gi, 'Aether light enveloping Kai'],
  [/\bpele transl[uú]cida\b/gi, 'translucent skin'],
  [/\bKai perde cor\b/gi, 'Kai losing color'],
  [/\btornando(?:‑|-)?se sombra luminosa\b/gi, 'turning into a luminous silhouette'],
  [/\bclar[aã]o explosivo\b/gi, 'explosive flash'],
  [/\bclar[aã]o final explode\b/gi, 'final flash erupting'],
  [/\bilhas se afastando\b/gi, 'islands drifting apart'],
  [/\bc[eé]u clareando\b/gi, 'sky clearing'],
  [/\bestrelas surgindo\b/gi, 'stars emerging'],
  [/\bnoite estrelada\b/gi, 'starry night'],
  [/\bsombra luminosa ao lado\b/gi, 'luminous silhouette nearby'],
  [/\bpele perde a cor e torna-se transl[uú]cida\b/gi, 'skin losing color and turning translucent'],
  [/\bMasculino\b/gi, 'male'],
  [/\bFeminina\b/gi, 'female'],
  [/\bjovem adult[oa]\b/gi, 'young adult'],
  [/\bporte atl[eé]tico\b/gi, 'athletic build'],
  [/\bher[oó]i marcado pelo Aether\b/gi, 'hero marked by Aether'],
  [/\bmarca do Aether\b/gi, 'Aether mark'],
  [/\bt[uú]nica\b/gi, 'tunic'],
  [/\barmadura leve\b/gi, 'light armor'],
  [/\bquase et[eé]rea\b/gi, 'almost ethereal'],
  [/\bfeito de luz\b/gi, 'made of light'],
  [/\bantigo artefato dourado\b/gi, 'ancient golden artifact'],
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
  [/\bPossui um simbolo brilhante azul pulsante no braco\b/gi, 'glowing blue symbol pulsing on the arm'],
  [/\bSeu cabelo nao e descrito, mas veste roupas adequadas a um heroi de fantasia, provavelmente uma tunica ou armadura leve que reflete a energia ao seu redor\b/gi, 'hair not specified, wearing fantasy hero clothing, likely a tunic or light armor reflecting the surrounding energy'],
  [/\bDurante o climax, sua pele perde a cor e torna-se translucida, quase eterea, como se fosse feito de luz\b/gi, 'during the climax, skin losing color and turning translucent, almost ethereal, as if made of light'],
  [/\bSegura firmemente um antigo artefato dourado que emite brilho\b/gi, 'firmly holding an ancient golden artifact emitting light'],
  [/\bVeste roupas praticas de aventureira, possivelmente uma capa leve e botas resistentes, adequadas ao ambiente ventoso das ilhas\b/gi, 'wearing practical adventurer clothing, likely a light cloak and sturdy boots suited to the windy island environment'],
  [/\bSeu olhar transmite ansiedade e coragem\b/gi, 'gaze conveying anxiety and courage'],
  [/\bSeu olhar esta carregado de preocupacao\b/gi, 'gaze filled with concern'],
  [/\bluta para salvar Kai\b/gi, 'fighting to save Kai'],
  [/\bpelo poder concedido pelo Aether\b/gi, 'over the power granted by the Aether'],
  [/\bA camera foca no brilho de determinacao nos olhos dele\b/gi, 'camera focusing on the determination in his eyes'],
  [/\bO artefato brilha mais forte, refletindo a preocupacao\b/gi, 'artifact glowing brighter, reflecting her concern'],
  [/\bUm arco luminoso comeca a surgir no ceu\b/gi, 'a luminous arc beginning to appear in the sky'],
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
]

function normalizeLocationEnglish(value: unknown) {
  let text = clean(value)
  if (!text) return ''

  for (const [pattern, replacement] of VISUAL_TRANSLATIONS) {
    text = text.replace(pattern, replacement)
  }

  return clean(text)
    .replace(/^Ilha Desolada$/i, 'Desolate Island')
    .replace(/^Ilha desolate$/i, 'Desolate Island')
    .replace(/^Rua da Vila$/i, 'village street')
    .replace(/^Praça da Vila$/i, 'village square')
    .replace(/^Praca da Vila$/i, 'village square')
    .replace(/^Pátio da Vila$/i, 'village courtyard')
    .replace(/^Patio da Vila$/i, 'village courtyard')
    .replace(/^Centro da Vila$/i, 'village center')
    .replace(/^Ilha de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 Island')
    .replace(/^Vila de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 village')
    .replace(/^Rua de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 street')
    .replace(/^Praça de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 square')
    .replace(/^Praca de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 square')
    .replace(/^Pátio de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 courtyard')
    .replace(/^Patio de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 courtyard')
    .replace(/^Centro de ([A-Za-zÀ-ÿ' -]+)$/i, '$1 center')
}

function translateVisualText(value: unknown) {
  let text = normalizeLocationEnglish(value)
  if (!text) return ''
  for (const [pattern, replacement] of VISUAL_TRANSLATIONS) {
    text = text.replace(pattern, replacement)
  }
  return clean(text)
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
}

function keepEnglishFragments(value: string) {
  const englishHints = /\b(?:the|with|under|over|into|across|close|wide|medium|detail|shot|camera|wind|storm|historical|cinematic|survivors|cold|rocks|beach|coast|rain|expression|light|artifact|group|island|captain|authority|identity|continuity|setting|period|time|day|night|dusk|dawn|static|eye-level|tense|silent|corrosive|desolate|hostile|somber|oppressive)\b/i
  const portugueseHints = /\b(?:desobediencia|obediencia|latente|domina|dominar|grupo|praia|ilha|navio|homens|sobreviventes|capitao|capitão|autoridade|isolamento|travessia|fragil|frágil|destruicao|destruição)\b/i
  const parts = value
    .split(/\s*(?:,|;|\.|\be\b)\s*/g)
    .map(part => clean(part))
    .filter(Boolean)
  const englishOnly = parts.filter((part) => {
    if (NON_ENGLISH_MARKERS.test(part)) return false
    if (portugueseHints.test(part) && !englishHints.test(part)) return false
    return true
  })
  return clean(englishOnly.join(', '))
}

function keepVisualSnippet(value: unknown, maxLength = 180) {
  const translated = translateVisualText(value)
  const englishOnly = keepEnglishFragments(translated)
  const text = clipText(englishOnly || translated, maxLength)
  if (!text) return ''
  if (!englishOnly && (NON_ENGLISH_MARKERS.test(translated) || /\b(?:desobediencia|obediencia|latente|domina|dominar|grupo|praia|ilha|navio|homens|sobreviventes|capitao|capitão|autoridade|isolamento|travessia|fragil|frágil|destruicao|destruição)\b/i.test(translated))) return ''
  if (NON_ENGLISH_MARKERS.test(text)) return ''
  return text
}

function keepEnglishLabel(value: unknown, maxLength = 80) {
  const text = clipText(keepEnglishFragments(translateVisualText(value)), maxLength)
  if (!text) return ''
  if (NON_ENGLISH_MARKERS.test(text)) return ''
  return text
}

function unique(parts: Array<string | null | undefined>) {
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
  return items
}

function join(parts: Array<string | null | undefined>) {
  return unique(parts).join(', ')
}

function uniqueTokens(values: string[]) {
  return unique(values.map(value => clean(value)))
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
  const token = translateVisualText(value)
    .replace(/^location:\s*(.+)$/i, (_, location) => `location: ${normalizeLocationEnglish(location)}`)
    .replace(/\bclose-up on\b/gi, 'close-up of')
    .replace(/\blow angle on\b/gi, 'low-angle shot of')
    .replace(/\bcut to reaction of\b/gi, 'reaction shot of')
    .replace(/\bfade to next scene\b/gi, 'fade out')
    .replace(/\blooking terrified\b/gi, 'terrified expression')
    .replace(/\bdetermined eyes\b/gi, 'determined expression')
    .replace(/\bdetermined face\b/gi, 'determined expression')

  if (/^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{1,32}$/.test(token)) return ''
  return clean(token)
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

function normalizeTimelinePrompt(value: unknown) {
  const raw = clean(value)
  if (!raw) return ''

  const segments: string[] = []
  let matched = false
  TIMELINE_SEGMENT_RE.lastIndex = 0

  for (const match of raw.matchAll(TIMELINE_SEGMENT_RE)) {
    matched = true
    const window = clean(match[1])
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

function pickSceneSynopsis(scene: Record<string, any>) {
  const rawPrompt = clean(scene?.prompt)
  const prompt = keepVisualSnippet(scene?.prompt, 140)
  if (!prompt) return ''
  const location = translateVisualText(scene?.location || '')
  const time = translateVisualText(scene?.time || '')
  const rawLocation = clean(scene?.location || '')
  const rawTime = clean(scene?.time || '')
  const variants = [
    clean(`${rawLocation} · ${rawTime}`),
    clean(`${rawLocation} · ${time}`),
    clean(`${location} · ${time}`),
  ].filter(Boolean)
  if (variants.some(value => value.toLowerCase() === rawPrompt.toLowerCase())) return ''
  if (location && time && prompt.toLowerCase() === clean(`${location} · ${time}`).toLowerCase()) return ''
  return prompt
}

function cameraDescriptor(storyboard: Record<string, any>) {
  return join([
    keepEnglishLabel(storyboard.shot_type || storyboard.shotType || '', 80),
    keepEnglishLabel(storyboard.angle || '', 80),
    keepEnglishLabel(storyboard.movement || '', 80),
  ])
}

function characterContinuity(characters: Array<Record<string, any>>) {
  if (!characters.length) return ''
  return characters
    .map((char) => join([
      clean(char.name),
      pickCharacterSynopsis(char),
      pickCharacterMood(char) ? `emotional tone: ${pickCharacterMood(char)}` : '',
    ]))
    .filter(Boolean)
    .join(' | ')
}

function settingDescriptor(scene: Record<string, any> | null, storyboard: Record<string, any>) {
  const location = normalizeLocationEnglish(scene?.location || storyboard.location || '')
  const time = keepEnglishLabel(scene?.time || storyboard.time || '', 80)
  const timeLabel = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(time)
    || /\b\d{4}\b/.test(time)
    ? `period: ${time}`
    : (time ? `time of day: ${time}` : '')
  return join([
    location ? `setting: ${location}` : '',
    timeLabel,
    (pickSceneSynopsis(scene || {}) || keepEnglishLabel(storyboard.atmosphere || '', 120)) ? `mood: ${pickSceneSynopsis(scene || {}) || keepEnglishLabel(storyboard.atmosphere || '', 120)}` : '',
  ])
}

function shotActionDescriptor(storyboard: Record<string, any>) {
  const basePrompt = keepVisualSnippet(storyboard.image_prompt || storyboard.imagePrompt, 220)
  const imagePromptLooksComposed = /\b(?:setting|time of day|period|camera)\s*:/i.test(String(storyboard.image_prompt || storyboard.imagePrompt || ''))
  return join([
    imagePromptLooksComposed ? '' : basePrompt,
    basePrompt && !imagePromptLooksComposed ? '' : keepVisualSnippet(storyboard.action, 180),
    basePrompt && !imagePromptLooksComposed ? '' : keepVisualSnippet(storyboard.description, 160),
    basePrompt && !imagePromptLooksComposed ? '' : keepVisualSnippet(storyboard.result, 160),
  ])
}

function timelineDescriptor(storyboard: Record<string, any>) {
  return normalizeTimelinePrompt(storyboard.video_prompt || storyboard.videoPrompt || '')
}

export function buildCharacterImagePrompt(char: Record<string, any>) {
  return join([
    'cinematic character design sheet',
    clean(char.name),
    pickCharacterSynopsis(char) || 'clean character reference portrait',
    pickCharacterMood(char) ? `personality cues: ${pickCharacterMood(char)}` : '',
    'full body',
    'front view',
    'consistent facial features',
    'consistent wardrobe',
    'clean studio background',
    'high detail',
    'soft cinematic lighting',
    'no text',
    'no subtitles',
    'no watermark',
  ])
}

export function buildSceneImagePrompt(scene: Record<string, any>) {
  const effectivePrompt = clean(scene?.effective_image_prompt || scene?.effectiveImagePrompt)
  if (effectivePrompt) return effectivePrompt

  const profile = scene?.visual_profile || scene?.visualProfile || null
  if (profile && typeof profile === 'object') {
    return join([
      'cinematic environment concept art',
      profile.locationCore ? `setting: ${clean(profile.locationCore)}` : clean(profile.productionLabel),
      profile.timeVariant ? `period: ${clean(profile.timeVariant)}` : '',
      profile.setFamily ? `set family: ${clean(profile.setFamily)}` : '',
      profile.distinctiveAnchor ? `visual anchor: ${clean(profile.distinctiveAnchor)}` : '',
      Array.isArray(profile.paletteSignature) && profile.paletteSignature.length ? `palette: ${profile.paletteSignature.map((item: string) => clean(item)).filter(Boolean).join(', ')}` : '',
      Array.isArray(profile.environmentRules) && profile.environmentRules.length ? `environment: ${profile.environmentRules.map((item: string) => clean(item)).filter(Boolean).join(', ')}` : '',
      'high detail',
      'atmospheric lighting',
      'no text',
      'no watermark',
    ])
  }

  return join([
    'cinematic environment concept art',
    normalizeLocationEnglish(scene.location),
    keepEnglishLabel(scene.time, 80),
    pickSceneSynopsis(scene) || 'story-driven environment with strong atmosphere',
    'consistent worldbuilding',
    'high detail',
    'atmospheric lighting',
    'no text',
    'no watermark',
  ])
}

export function buildShotFramePrompt({
  storyboard,
  frameType,
  scene,
  characters,
}: {
  storyboard: Record<string, any>
  frameType: 'first_frame' | 'last_frame'
  scene: Record<string, any> | null
  characters: Array<Record<string, any>>
}) {
  const frameIntent = frameType === 'first_frame'
    ? 'first keyframe of the shot'
    : 'final keyframe of the shot'

  return join([
    frameIntent,
    'cinematic drama still',
    settingDescriptor(scene, storyboard),
    cameraDescriptor(storyboard) ? `camera: ${cameraDescriptor(storyboard)}` : '',
    shotActionDescriptor(storyboard),
    characterContinuity(characters) ? `character continuity: ${characterContinuity(characters)}` : '',
    'maintain consistent character identity established in this episode',
    'maintain consistent wardrobe continuity',
    'natural anatomy',
    'high detail',
    'no dialogue text',
    'no subtitles',
    'no speech bubbles',
    'no watermark',
  ])
}

export function buildShotVideoPrompt({
  storyboard,
  scene,
  characters,
}: {
  storyboard: Record<string, any>
  scene: Record<string, any> | null
  characters: Array<Record<string, any>>
}) {
  const timeline = timelineDescriptor(storyboard)
  const action = shotActionDescriptor(storyboard)

  return join([
    'cinematic drama video',
    settingDescriptor(scene, storyboard),
    cameraDescriptor(storyboard) ? `camera: ${cameraDescriptor(storyboard)}` : '',
    characterContinuity(characters) ? `character continuity: ${characterContinuity(characters)}` : '',
    action ? `story beat: ${action}` : '',
    timeline ? `timeline: ${timeline}` : '',
    `duration target: ${Number(storyboard.duration || 10)} seconds`,
    'maintain consistent character identity established in this episode',
    'maintain consistent wardrobe continuity',
    'natural motion',
    'no spoken dialogue in the visual prompt',
    'no subtitles',
    'no captions',
    'no on-screen text',
    'no speech bubbles',
    'no watermark',
  ])
}
