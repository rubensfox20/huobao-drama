import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import {
  extractDialogueSpeakerMentions,
  extractFullNameCharacterMentions,
  extractPropMentions,
  extractTitledCharacterMentions,
  parseScreenplayStructure,
} from './screenplay-structure.js'

export type ExtractedCharacter = {
  name: string
  role?: string
  description?: string
  appearance?: string
  personality?: string
  sourceQuote?: string
  sourceSpan?: string
}

export type ExtractedScene = {
  location: string
  time?: string
  prompt?: string
  productionLabel?: string
  sourceQuote?: string
  sourceSpan?: string
}

export type ExtractedProp = {
  name: string
  type?: string
  description?: string
  prompt?: string
  sourceQuote?: string
  sourceSpan?: string
}

export type CharacterMentionSignal = 'dialogue' | 'title' | 'full_name'
export type SceneMentionSignal = 'heading'
export type PropMentionSignal = 'named_ship' | 'object_phrase'

export type CharacterMention = {
  kind: 'character'
  name: string
  canonicalName: string
  signal: CharacterMentionSignal
  confidence: number
  sourceQuote: string
  sourceSpan: string
  sceneIndex: number
  location: string
  time: string
}

export type SceneMention = {
  kind: 'scene'
  location: string
  canonicalLocation: string
  time?: string
  signal: SceneMentionSignal
  confidence: number
  sourceQuote: string
  sourceSpan: string
  sceneIndex: number
}

export type PropMention = {
  kind: 'prop'
  name: string
  canonicalName: string
  signal: PropMentionSignal
  confidence: number
  sourceQuote: string
  sourceSpan: string
  sceneIndex: number
  location: string
  time: string
}

export type StructuralExtractionMentions = {
  characters: CharacterMention[]
  scenes: SceneMention[]
  props: PropMention[]
}

export type StructuralExtractionResult = {
  characters: ExtractedCharacter[]
  scenes: ExtractedScene[]
  props: ExtractedProp[]
  mentions: StructuralExtractionMentions
}

const CHARACTER_IGNORE_PATTERN = /^(narrac[aã]o|narrador|off|voz off|voz over|voice ?over|ambiente|sfx|bgm|efeito|efeitos|som|trilha|musica|m[uú]sica|fim do roteiro|fim|the end)$/i
const SHIP_PREFIX_PATTERN = /^(hms|uss|rms|ss|mv|ms)\b/i
const OBJECT_NAME_PREFIXES = [
  /^(hms|uss|rms|ss|mv|ms)\b/i,
  /^(navio|barco|embarca[cç][aã]o|carro|autom[oó]vel|caminh[aã]o|moto(?:cicleta)?|avi[aã]o|helic[oó]ptero|nave|submarino|tanque|trem|bonde|artefato|amuleto|espada|lan[cç]a|escudo|pistola|rifle|rev[oó]lver|arma|anel|livro|telefone|r[aá]dio|mapa|chave|motor|m[aá]quina)\b/i,
]
const OBJECT_KEYWORDS = [
  'hms', 'uss', 'rms', 'ship', 'vessel', 'boat', 'navio', 'barco', 'embarcacao', 'embarcação',
  'carro', 'automovel', 'automóvel', 'vehicle', 'car', 'truck', 'caminhao', 'caminhão', 'van', 'moto', 'motocicleta',
  'aviao', 'avião', 'plane', 'helicoptero', 'helicóptero', 'helicopter', 'nave', 'submarino', 'tank', 'tanque',
  'artefato', 'artifact', 'amuleto', 'amulet', 'espada', 'sword', 'arma', 'weapon', 'rifle', 'pistola', 'revolver',
  'anel', 'ring', 'livro', 'book', 'telefone', 'phone', 'radio', 'rádio', 'mapa', 'map', 'chave', 'key', 'maquina', 'máquina',
]
const HUMAN_HINTS = [
  'capitao', 'capitão', 'oficial', 'marinheiro', 'soldado', 'homem', 'mulher', 'garoto', 'garota',
  'crianca', 'criança', 'senhor', 'senhora', 'rei', 'rainha', 'principe', 'príncipe', 'princesa',
  'mentor', 'irmao', 'irmão', 'irma', 'irmã', 'pai', 'mae', 'mãe', 'filho', 'filha', 'amigo', 'amiga',
]
const NON_PERSON_NAME_TOKENS = new Set([
  'patagonia', 'chilena', 'chileno', 'costa', 'praia', 'ilha', 'ilhas', 'oceano', 'mar', 'atlantico',
  'atlântico', 'america', 'américa', 'sul', 'norte', 'leste', 'oeste', 'cabo', 'horn', 'marinha', 'real',
  'companhia', 'indias', 'índias', 'pacifico', 'pacífico', 'esquadra', 'coroa',
  'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro', 'janeiro', 'fevereiro', 'marco', 'março', 'dia', 'noite',
])
const HUMAN_TITLE_HINTS = /^(capit[aã]o|oficial|marinheiro|senhor|senhora|dona|dom|rei|rainha|principe|princesa|doutor|doutora|soldado)\b/i
const CAPITALIZED_STOPWORDS = new Set([
  'Abaixo', 'Acima', 'Ali', 'Aqui', 'Com', 'Contra', 'Interior', 'Exterior', 'Interno', 'Externo',
  'Dia', 'Noite', 'Tarde', 'Manha', 'Manhã', 'Madrugada', 'Amanhecer', 'Anoitecer', 'Céu', 'Vila',
  'Cidade', 'Reino', 'Ilhas', 'Energia', 'Aether', 'Devastador', 'Todos', 'Todo', 'Toda', 'Silêncio',
  'Silencio', 'Ele', 'Ela', 'Eles', 'Elas', 'Seus', 'Suas', 'Seu', 'Sua', 'Gritos', 'De', 'Da', 'Do',
  'Das', 'Dos', 'Em', 'No', 'Na', 'Um', 'Uma', 'O', 'A', 'Os', 'As',
])
const PROP_NAME_STOPWORDS = new Set(['O', 'A', 'Os', 'As', 'Um', 'Uma', 'De', 'Do', 'Da', 'Dos', 'Das', 'No', 'Na', 'Nos', 'Nas'])
const PROP_IDENTITY_STOPWORDS = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'nao', 'não', 'not', 'sem', 'and', 'e'])
const CHARACTER_ARTIFACT_NAMES = new Set(['e', 'ou', 'mas', 'fim'])
const HUMAN_ROLE_TOKENS = new Set([
  'capitao', 'capitão', 'oficial', 'marinheiro', 'soldado', 'tripulante', 'homem', 'mulher',
  'garoto', 'garota', 'crianca', 'criança', 'senhor', 'senhora', 'rei', 'rainha', 'principe',
  'príncipe', 'princesa', 'doutor', 'doutora', 'voz', 'narrador', 'narracao', 'narração',
])
const CHARACTER_DESCRIPTOR_TOKENS = new Set([
  '1', '2', '3', '4', '5', 'ferido', 'ferida', 'enfraquecido', 'enfraquecida', 'machucado',
  'machucada', 'fraco', 'fraca', 'rouco', 'rouca', 'agitado', 'agitada', 'desesperado',
  'desesperada', 'sussurrando', 'gritando', 'ofegante', 'cansado', 'cansada', 'doente',
  'debilitado', 'debilitada', 'feridos', 'feridas', 'sobrevivente', 'sobreviventes', 'tripulacao',
  'tripulação', 'homens', 'mulheres', 'do', 'da', 'de',
])
const MALFORMED_PROP_TOKENS = new Set([
  'afundar', 'afunda', 'afundando', 'esta', 'está', 'despedaçado', 'despedaçada', 'despedacado',
  'despedacada', 'improvisado', 'improvisada', 'medo', 'herda', 'aparece', 'surge', 'dominado',
  'dominada', 'vencido', 'vencida', 'lancado', 'lançado', 'lancada', 'lançada', 'esmaga',
  'esmagam', 'revela', 'revela', 'arrasta', 'arrastam', 'enfrenta', 'enfrentam', 'avanca',
  'avança', 'avancam', 'avançam', 'chega', 'chegam',
])
const SCENE_LOCATION_STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'na', 'no', 'nas', 'nos', 'em',
  'entre', 'sobre', 'ao', 'aos', 'e',
])
const SCENE_TIME_STOPWORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'e',
])
const SCENE_CLAUSE_MARKERS = [
  ', enquanto ', ', quando ', ', onde ', ', com ', ', sob ', ', após ', ', depois ',
  ' que ', ' enquanto ', ' quando ', ' onde ',
]
const PROSE_FRAGMENT_PROP_WORDS = new Set([
  'disciplinado', 'disciplinada', 'herda', 'aparece', 'surge', 'dominado', 'dominada', 'vencido',
  'vencida', 'furioso', 'furiosa', 'remota', 'remoto', 'impoe', 'impõe', 'irreversivel',
  'irreversível', 'enfraquecidos', 'enfraquecidas', 'fragil', 'frágil',
])
const GENERIC_PROP_KEYWORDS = new Set(['navio', 'barco', 'embarcacao', 'embarcação', 'ship', 'boat', 'vessel'])
const SHIP_BOARD_LOCATION_RE = /\b(a bordo|conv[eéê]s|conves|cabine|cabine de comando|proa|popa|porao|por[aã]o)\b/i
const OPEN_SEA_LOCATION_RE = /\b(atl[aâ]ntico|oceano|mar aberto|cabo horn|extremo sul|rumo ao sul|costa oeste)\b/i

function normalizeLookup(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function tokenizeEntityName(value: string) {
  return normalizeWhitespace(value)
    .split(/\s+/)
    .map(part => part.replace(/[^A-Za-zÀ-ÿ0-9'’.-]/g, ''))
    .filter(Boolean)
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function cleanEvidenceText(value: string, maxLength = 240) {
  return normalizeWhitespace(String(value || '').replace(/[`*_>#]/g, ' ')).slice(0, maxLength)
}

function buildMentionSourceSpan(sceneIndex: number) {
  return `scene:${sceneIndex + 1}`
}

function dedupeMentionsByKey<T extends { sourceQuote: string; sourceSpan: string }>(
  items: T[],
  getKey: (item: T) => string,
) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${getKey(item)}@@${item.sourceSpan}@@${normalizeLookup(item.sourceQuote)}`
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function pickMentionEvidence<T extends { sourceQuote: string; confidence: number }>(items: T[]) {
  return [...items]
    .sort((left, right) => {
      const confidenceScore = right.confidence - left.confidence
      if (confidenceScore !== 0) return confidenceScore
      return String(right.sourceQuote || '').length - String(left.sourceQuote || '').length
    })[0] || null
}

function collectMentionSpans<T extends { sourceSpan: string }>(items: T[]) {
  return [...new Set(items.map((item) => cleanEvidenceText(item.sourceSpan || '', 80)).filter(Boolean))]
    .slice(0, 3)
    .join(', ')
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function normalizeTokenCase(value: string) {
  if (!value) return ''
  if (/^(HMS|USS|RMS|SS|MV|MS|II|III|IV|VI|VII|VIII|IX|X)$/i.test(value)) return value.toUpperCase()
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function normalizeShipTail(value: string) {
  const tokens = String(value || '')
    .split(/\s+/)
    .map(part => part.replace(/[^A-Za-zÀ-ÿ0-9'’.-]/g, ''))
    .filter(Boolean)

  const kept: string[] = []
  for (const token of tokens) {
    const normalized = normalizeTokenCase(token)
    const lookup = normalizeLookup(normalized)
    if (!normalized) continue
    if (PROP_IDENTITY_STOPWORDS.has(lookup)) break
    if (kept.length > 0 && SHIP_PREFIX_PATTERN.test(normalized)) break
    if (normalized.length <= 1 && kept.length > 0) break
    kept.push(normalized)
    if (kept.length >= 3) break
  }

  return kept.join(' ')
}

function findNamedShipInText(value: string) {
  const match = String(value || '')
    .match(/\b(?:HMS|USS|RMS|SS|MV|MS)\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*){0,2}\b/)
  return match ? match[0] : ''
}

export function normalizeCharacterName(raw: string) {
  const cleaned = normalizeWhitespace(
    String(raw || '')
      .replace(/[`*_>#]/g, ' ')
      .replace(/[（(].*?[)）]/g, ' ')
      .replace(/[^A-Za-zÀ-ÿ0-9'’ -]/g, ' '),
  )
  if (!cleaned || cleaned.length > 40) return ''
  if (CHARACTER_IGNORE_PATTERN.test(cleaned)) return ''
  if (/^s\d+$/i.test(cleaned)) return ''
  if (cleaned === cleaned.toUpperCase()) return toTitleCase(cleaned)
  return cleaned
}

export function normalizePropName(raw: string) {
  const cleaned = normalizeWhitespace(
    String(raw || '')
      .replace(/[`*_>#]/g, ' ')
      .replace(/[（(].*?[)）]/g, ' ')
      .replace(/[^A-Za-zÀ-ÿ0-9'’ -]/g, ' '),
  )
  if (!cleaned || cleaned.length > 60) return ''

  const shipWithArticleMatch = cleaned.match(/^(o|a|os|as)\s+(hms|uss|rms|ss|mv|ms)\s+(.+)$/i)
  if (shipWithArticleMatch) {
    const normalizedTail = normalizeShipTail(shipWithArticleMatch[3])
    return normalizedTail ? `${shipWithArticleMatch[2].toUpperCase()} ${normalizedTail}` : shipWithArticleMatch[2].toUpperCase()
  }

  const shipMatch = cleaned.match(/^(hms|uss|rms|ss|mv|ms)\s+(.+)$/i)
  if (shipMatch) {
    const normalizedTail = normalizeShipTail(shipMatch[2])
    return normalizedTail ? `${shipMatch[1].toUpperCase()} ${normalizedTail}` : shipMatch[1].toUpperCase()
  }
  if (/^(hms|uss|rms|ss|mv|ms)$/i.test(cleaned)) {
    return cleaned.toUpperCase()
  }

  if (cleaned === cleaned.toUpperCase()) return toTitleCase(cleaned)
  return cleaned
}

export function resolveCanonicalPropName(raw: string, description = '') {
  const directName = normalizePropName(raw)
  if (!directName) return ''

  if (/^(HMS|USS|RMS|SS|MV|MS)\s+\S+/i.test(directName)) return directName

  const shipInContext = normalizePropName(findNamedShipInText(`${raw} ${description}`))
  if (shipInContext) return shipInContext

  return directName
}

function tokenizePropIdentity(raw: string, description = '') {
  return tokenizeEntityName(resolveCanonicalPropName(raw, description))
    .map(normalizeLookup)
    .filter(Boolean)
    .filter(token => !PROP_IDENTITY_STOPWORDS.has(token))
}

function pickPreferredPropName(leftName: string, rightName: string) {
  const left = resolveCanonicalPropName(leftName)
  const right = resolveCanonicalPropName(rightName)
  if (!left) return right
  if (!right) return left

  const leftTokens = tokenizePropIdentity(left)
  const rightTokens = tokenizePropIdentity(right)
  const leftShip = leftTokens[0] && SHIP_PREFIX_PATTERN.test(leftTokens[0])
  const rightShip = rightTokens[0] && SHIP_PREFIX_PATTERN.test(rightTokens[0])

  if (leftShip && !rightShip) return left
  if (rightShip && !leftShip) return right
  if (leftTokens.length !== rightTokens.length) return rightTokens.length > leftTokens.length ? right : left
  return right.length > left.length ? right : left
}

export function isSamePropIdentity(leftName: string, rightName: string, leftDescription = '', rightDescription = '') {
  const leftCanonical = resolveCanonicalPropName(leftName, leftDescription)
  const rightCanonical = resolveCanonicalPropName(rightName, rightDescription)
  if (!leftCanonical || !rightCanonical) return false
  if (normalizeLookup(leftCanonical) === normalizeLookup(rightCanonical)) return true

  const leftTokens = tokenizePropIdentity(leftCanonical)
  const rightTokens = tokenizePropIdentity(rightCanonical)
  if (!leftTokens.length || !rightTokens.length) return false

  const leftShip = SHIP_PREFIX_PATTERN.test(leftTokens[0] || '')
  const rightShip = SHIP_PREFIX_PATTERN.test(rightTokens[0] || '')
  if (leftShip && rightShip && leftTokens[0] === rightTokens[0]) {
    const leftTail = leftTokens.slice(1).join(' ')
    const rightTail = rightTokens.slice(1).join(' ')
    if (leftTail && rightTail && (leftTail.includes(rightTail) || rightTail.includes(leftTail))) {
      return true
    }
  }

  const rightSet = new Set(rightTokens)
  const overlap = leftTokens.filter(token => rightSet.has(token)).length
  const smaller = Math.min(leftTokens.length, rightTokens.length)
  return overlap >= 2 && overlap === smaller
}

function parseTitledCharacterName(name: string) {
  const tokens = tokenizeEntityName(name)
  if (tokens.length < 2) return null
  const title = normalizeLookup(tokens[0])
  if (!HUMAN_ROLE_TOKENS.has(title)) return null
  const rest = tokens.slice(1).map(normalizeLookup)
  if (!rest.length) return null
  return {
    title,
    rest,
    lastToken: rest[rest.length - 1],
  }
}

function getCharacterIdentity(name: string) {
  const normalized = normalizeCharacterName(name)
  const tokens = tokenizeEntityName(normalized).map(normalizeLookup)
  const titled = parseTitledCharacterName(normalized)
  const coreTokens = titled ? titled.rest : tokens
  return {
    normalized,
    title: titled?.title || null,
    coreTokens,
    lastToken: coreTokens[coreTokens.length - 1] || '',
  }
}

export function isSameCharacterIdentity(leftName: string, rightName: string) {
  const left = getCharacterIdentity(leftName)
  const right = getCharacterIdentity(rightName)
  if (!left.coreTokens.length || !right.coreTokens.length) return false
  if (left.coreTokens.join(' ') === right.coreTokens.join(' ')) return true
  if (left.lastToken && left.lastToken === right.lastToken) {
    const leftCore = left.coreTokens.join(' ')
    const rightCore = right.coreTokens.join(' ')
    if (leftCore.endsWith(rightCore) || rightCore.endsWith(leftCore)) {
      return true
    }
  }
  return false
}

export function normalizeSceneLocation(raw: string) {
  const normalized = normalizeWhitespace(String(raw || ''))
    .replace(/\s*[|/]\s*/g, ' · ')
    .replace(/\s*-\s*/g, ' - ')

  if (!normalized) return ''

  const namedShip = resolveCanonicalPropName(findNamedShipInText(normalized))
  if (namedShip) {
    if (SHIP_BOARD_LOCATION_RE.test(normalized)) return `A bordo do ${namedShip}`
    if (OPEN_SEA_LOCATION_RE.test(normalized)) return `${namedShip} em mar aberto`
    return namedShip
  }

  let trimmed = normalized
  for (const marker of SCENE_CLAUSE_MARKERS) {
    const index = normalizeLookup(trimmed).indexOf(normalizeLookup(marker))
    if (index > 0) {
      trimmed = trimmed.slice(0, index).trim().replace(/[,:;.-]+$/, '')
      break
    }
  }

  if (trimmed.length > 80 && trimmed.includes(',')) {
    trimmed = trimmed.split(',')[0]?.trim() || trimmed
  }

  return trimmed
}

export function normalizeSceneTime(raw: string) {
  return normalizeWhitespace(String(raw || ''))
}

function tokenizeSceneIdentity(value: string) {
  return normalizeSceneLocation(value)
    .split(/\s+/)
    .map(part => normalizeLookup(part).replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .filter(token => !SCENE_LOCATION_STOPWORDS.has(token))
}

function tokenizeSceneTimeIdentity(value: string) {
  return normalizeSceneTime(value)
    .split(/\s+/)
    .map(part => normalizeLookup(part).replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .filter(token => !SCENE_TIME_STOPWORDS.has(token))
}

type SceneLocationKind = 'shipboard' | 'open_sea' | 'named_ship' | 'generic'

function getSceneNamedShip(locationRaw: string) {
  return resolveCanonicalPropName(findNamedShipInText(normalizeSceneLocation(locationRaw || '')))
}

function getSceneLocationKind(locationRaw: string): SceneLocationKind {
  const normalized = normalizeSceneLocation(locationRaw || '')
  const namedShip = getSceneNamedShip(normalized)
  if (!namedShip) return 'generic'
  if (/^A bordo do /i.test(normalized) || SHIP_BOARD_LOCATION_RE.test(normalized)) return 'shipboard'
  if (/ em mar aberto$/i.test(normalized) || OPEN_SEA_LOCATION_RE.test(normalized)) return 'open_sea'
  return 'named_ship'
}

function areSceneLocationFamiliesCompatible(leftLocationRaw: string, rightLocationRaw: string) {
  const leftShip = getSceneNamedShip(leftLocationRaw)
  const rightShip = getSceneNamedShip(rightLocationRaw)

  if (!leftShip && !rightShip) return true
  if (!leftShip || !rightShip) return false
  if (normalizeLookup(leftShip) !== normalizeLookup(rightShip)) return false

  const leftKind = getSceneLocationKind(leftLocationRaw)
  const rightKind = getSceneLocationKind(rightLocationRaw)
  return leftKind === rightKind
}

function isSubsetTokens(subset: string[], full: string[]) {
  const fullSet = new Set(full)
  return subset.every(token => fullSet.has(token))
}

function isSceneTimeCompatible(leftTimeRaw: string, rightTimeRaw: string) {
  const leftTime = normalizeLookup(normalizeSceneTime(leftTimeRaw || ''))
  const rightTime = normalizeLookup(normalizeSceneTime(rightTimeRaw || ''))

  if (!leftTime || !rightTime) return true
  if (leftTime === rightTime) return true

  const leftTokens = tokenizeSceneTimeIdentity(leftTimeRaw || '')
  const rightTokens = tokenizeSceneTimeIdentity(rightTimeRaw || '')
  if (!leftTokens.length || !rightTokens.length) return false

  if (isSubsetTokens(leftTokens, rightTokens) || isSubsetTokens(rightTokens, leftTokens)) return true

  return false
}

function resolveMergedSceneTime(
  left: Pick<ExtractedScene, 'location' | 'time'>,
  right: Pick<ExtractedScene, 'location' | 'time'>,
) {
  const leftTime = normalizeSceneTime(left.time || '')
  const rightTime = normalizeSceneTime(right.time || '')

  if (!leftTime) return rightTime
  if (!rightTime) return leftTime
  if (normalizeLookup(leftTime) === normalizeLookup(rightTime)) {
    return rightTime.length > leftTime.length ? rightTime : leftTime
  }

  const leftTokens = tokenizeSceneTimeIdentity(leftTime)
  const rightTokens = tokenizeSceneTimeIdentity(rightTime)
  if (leftTokens.length && rightTokens.length) {
    if (isSubsetTokens(leftTokens, rightTokens)) return leftTime
    if (isSubsetTokens(rightTokens, leftTokens)) return rightTime
  }

  const sameCanonicalLocation = normalizeLookup(normalizeSceneLocation(left.location || ''))
    === normalizeLookup(normalizeSceneLocation(right.location || ''))
  if (sameCanonicalLocation || isStrongSceneLocationMatch(left.location || '', right.location || '')) {
    return ''
  }

  return rightTime.length > leftTime.length ? rightTime : leftTime
}

function isStrongSceneLocationMatch(leftLocationRaw: string, rightLocationRaw: string) {
  if (!areSceneLocationFamiliesCompatible(leftLocationRaw, rightLocationRaw)) return false
  const leftTokens = tokenizeSceneIdentity(leftLocationRaw || '')
  const rightTokens = tokenizeSceneIdentity(rightLocationRaw || '')
  if (!leftTokens.length || !rightTokens.length) return false

  const overlap = countSceneOverlap(leftTokens, rightTokens)
  const smallerSize = Math.min(leftTokens.length, rightTokens.length)
  if (overlap === smallerSize && overlap >= 2) return true
  if (smallerSize >= 3 && overlap >= (smallerSize - 1)) return true
  return false
}

function countSceneOverlap(left: string[], right: string[]) {
  const rightSet = new Set(right)
  return left.filter(token => rightSet.has(token)).length
}

export function isSameSceneCandidate(left: Pick<ExtractedScene, 'location' | 'time'>, right: Pick<ExtractedScene, 'location' | 'time'>) {
  const leftLocation = normalizeLookup(normalizeSceneLocation(left.location || ''))
  const rightLocation = normalizeLookup(normalizeSceneLocation(right.location || ''))

  if (!leftLocation || !rightLocation) return false
  if (leftLocation === rightLocation) return true
  if (!areSceneLocationFamiliesCompatible(left.location || '', right.location || '')) return false

  const leftTokens = tokenizeSceneIdentity(left.location || '')
  const rightTokens = tokenizeSceneIdentity(right.location || '')
  if (!leftTokens.length || !rightTokens.length) return false

  const overlap = countSceneOverlap(leftTokens, rightTokens)
  const smallerSize = Math.min(leftTokens.length, rightTokens.length)
  if (!isSceneTimeCompatible(left.time || '', right.time || '')) return false
  if (overlap === smallerSize && overlap >= 2) return true
  if (smallerSize >= 3 && overlap >= (smallerSize - 1)) return true

  return false
}

function pickPreferredSceneCandidate(left: ExtractedScene, right: ExtractedScene): ExtractedScene {
  const leftLocation = normalizeSceneLocation(left.location || '')
  const rightLocation = normalizeSceneLocation(right.location || '')
  const location = rightLocation.length > leftLocation.length ? rightLocation : leftLocation
  const time = resolveMergedSceneTime(
    { location: leftLocation, time: left.time || '' },
    { location: rightLocation, time: right.time || '' },
  )
  const prompt = time
    ? pickLongestText([right.prompt, left.prompt, `${location} · ${time}`.trim()])
    : location

  return {
    location,
    time,
    prompt,
    productionLabel: pickLongestText([right.productionLabel, left.productionLabel, location]),
    sourceQuote: pickLongestText([right.sourceQuote, left.sourceQuote]),
    sourceSpan: pickLongestText([right.sourceSpan, left.sourceSpan]),
  }
}

function isLikelyReusableSceneLocation(location: string) {
  const normalized = normalizeSceneLocation(location)
  if (!normalized) return false
  if (normalized.length > 120) return false

  const lookup = normalizeLookup(normalized)
  if (SCENE_CLAUSE_MARKERS.some(marker => lookup.includes(normalizeLookup(marker)))) return false

  return tokenizeSceneIdentity(normalized).length > 0
}

export function sanitizeSceneCandidates(scenes: ExtractedScene[]) {
  const sanitized: ExtractedScene[] = []

  for (const scene of scenes) {
    const normalizedScene: ExtractedScene = {
      location: normalizeSceneLocation(scene.location || ''),
      time: normalizeSceneTime(scene.time || ''),
      prompt: normalizeWhitespace(String(scene.prompt || `${scene.location || ''} · ${scene.time || ''}`)).slice(0, 480),
      productionLabel: normalizeWhitespace(String(scene.productionLabel || scene.location || '')).slice(0, 180),
      sourceQuote: cleanEvidenceText(scene.sourceQuote || '', 280),
      sourceSpan: cleanEvidenceText(scene.sourceSpan || '', 80),
    }
    if (!normalizedScene.location || !isLikelyReusableSceneLocation(normalizedScene.location)) continue

    const existingIndex = sanitized.findIndex(item => isSameSceneCandidate(item, normalizedScene))
    if (existingIndex >= 0) {
      sanitized[existingIndex] = pickPreferredSceneCandidate(sanitized[existingIndex], normalizedScene)
      continue
    }

    sanitized.push(normalizedScene)
  }

  return sanitized
}

function pickPreferredCharacterName(leftName: string, rightName: string) {
  const left = getCharacterIdentity(leftName)
  const right = getCharacterIdentity(rightName)
  if (!left.normalized) return right.normalized
  if (!right.normalized) return left.normalized
  if (left.title && !right.title) return left.normalized
  if (right.title && !left.title) return right.normalized
  return right.normalized.length > left.normalized.length ? right.normalized : left.normalized
}

type ExistingCharacterLike = {
  id: number
  name: string
  role?: string | null
  description?: string | null
  appearance?: string | null
  personality?: string | null
  deletedAt: string | null
}

function findExistingCharacterMatch(existingCharacters: ExistingCharacterLike[], rawName: string) {
  const normalized = normalizeCharacterName(rawName)
  if (!normalized) return null
  return existingCharacters.find(item => !item.deletedAt && isSameCharacterIdentity(item.name, normalized)) || null
}

export function isGhostCharacterName(raw: string) {
  const name = normalizeCharacterName(raw)
  if (!name) return true

  const lookup = normalizeLookup(name)
  if (!lookup) return true
  if (CHARACTER_ARTIFACT_NAMES.has(lookup)) return true
  if (lookup.length <= 1) return true
  if (lookup.startsWith('voz do ') || lookup.startsWith('voz da ') || lookup.startsWith('voz de ') || lookup.startsWith('voice of ')) {
    return true
  }

  const tokens = tokenizeEntityName(name).map(normalizeLookup)
  if (!tokens.length) return true
  if (tokens.length === 1 && (HUMAN_ROLE_TOKENS.has(tokens[0]) || CHARACTER_DESCRIPTOR_TOKENS.has(tokens[0]) || CHARACTER_ARTIFACT_NAMES.has(tokens[0]))) {
    return true
  }

  const titled = parseTitledCharacterName(name)
  if (titled) {
    if (titled.rest.every(token => /^\d+$/.test(token) || HUMAN_ROLE_TOKENS.has(token) || CHARACTER_DESCRIPTOR_TOKENS.has(token))) {
      return true
    }
  }

  return false
}

function resolveCanonicalCharacterAlias(rawName: string, knownNames: string[]) {
  const normalized = normalizeCharacterName(rawName)
  if (!normalized) return ''

  const aliasTargets = knownNames
    .map(normalizeCharacterName)
    .filter(Boolean)
    .filter(candidate => normalizeLookup(candidate) !== normalizeLookup(normalized))
    .filter(candidate => isSameCharacterIdentity(candidate, normalized))
  if (!aliasTargets.length) return normalized

  return aliasTargets.reduce((best, candidate) => pickPreferredCharacterName(best, candidate), normalized)
}

function countKeywordHits(haystack: string, keywords: string[]) {
  return keywords.reduce((total, keyword) => total + (haystack.includes(keyword) ? 1 : 0), 0)
}

export function classifyEntityKind(input: { name?: string; role?: string; description?: string }) {
  const name = normalizeCharacterName(String(input.name || ''))
  if (!name) return 'ignore' as const
  if (isGhostCharacterName(name)) return 'ignore' as const
  if (/^(o|a|os|as)\s+(hms|uss|rms|ss|mv|ms)\b/i.test(name)) return 'prop' as const
  if (OBJECT_NAME_PREFIXES.some(pattern => pattern.test(name))) return 'prop' as const
  if (/^[A-Z]{2,5}$/.test(String(input.name || '').trim())) return 'prop' as const

  const nameTokens = tokenizeEntityName(name).map(normalizeLookup)
  const looksLikeHumanFullName = nameTokens.length >= 2
    && !nameTokens.some(token => NON_PERSON_NAME_TOKENS.has(token))
    && !SHIP_PREFIX_PATTERN.test(nameTokens[0] || '')
  if (looksLikeHumanFullName) return 'character' as const

  const combined = `${name} ${input.role || ''} ${input.description || ''}`.toLowerCase()
  const objectHits = countKeywordHits(combined, OBJECT_KEYWORDS)
  const humanHits = countKeywordHits(combined, HUMAN_HINTS) + (HUMAN_TITLE_HINTS.test(name) ? 2 : 0)

  if (objectHits > 0 && humanHits === 0) return 'prop' as const
  if (objectHits >= humanHits + 2) return 'prop' as const
  return 'character' as const
}

function inferPropType(name: string, description: string) {
  const combined = `${name} ${description}`.toLowerCase()
  if (/(hms|uss|rms|ss|mv|ms|navio|barco|embarca[cç][aã]o|ship|boat|vessel|submarino)/.test(combined)) return 'ship'
  if (/(carro|autom[oó]vel|caminh[aã]o|moto|motocicleta|vehicle|car|truck|van|tanque|trem)/.test(combined)) return 'vehicle'
  if (/(artefato|amuleto|anel|reliquia|rel[ií]quia|artifact|amulet|ring)/.test(combined)) return 'artifact'
  if (/(espada|lan[cç]a|escudo|pistola|rifle|arma|weapon|sword|shield)/.test(combined)) return 'weapon'
  if (/(telefone|r[aá]dio|livro|mapa|chave|m[aá]quina|device|phone|radio|book|map|key)/.test(combined)) return 'device'
  return 'object'
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildEntityDescription(script: string, name: string) {
  const paragraphs = script.split(/\n\s*\n/).map(part => normalizeWhitespace(part)).filter(Boolean)
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i')
  const hits = paragraphs.filter(paragraph => pattern.test(paragraph))
  return normalizeWhitespace(hits.slice(0, 2).join(' ')).slice(0, 480)
}

function buildEntityEvidenceQuote(script: string, rawName: string) {
  const normalizedName = normalizeCharacterName(rawName) || normalizePropName(rawName) || normalizeSceneLocation(rawName)
  if (!normalizedName) return ''

  const blocks = script
    .split(/\n\s*\n/)
    .map(part => normalizeWhitespace(part))
    .filter(Boolean)

  const directPattern = new RegExp(`\\b${escapeRegExp(normalizedName)}\\b`, 'i')
  const nameTokens = tokenizeEntityName(normalizedName).map(normalizeLookup).filter(Boolean)

  const hits = blocks.filter((block) => {
    if (directPattern.test(block)) return true
    const blockLookup = normalizeLookup(block)
    const overlap = nameTokens.filter(token => blockLookup.includes(token)).length
    return overlap >= Math.min(nameTokens.length, 2)
  })

  return cleanEvidenceText(hits.slice(0, 2).join(' '), 280)
}

function extractRecurringFullNames(script: string, sceneLocations: Set<string>) {
  const counts = new Map<string, number>()
  const pattern = /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]{2,}(?:[ \t]+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]{2,}){1,2}\b/g

  for (const match of script.matchAll(pattern)) {
    const normalized = normalizeCharacterName(match[0] || '')
    if (!normalized) continue
    if (CAPITALIZED_STOPWORDS.has(normalized)) continue
    if (sceneLocations.has(normalized)) continue
    if (isGhostCharacterName(normalized)) continue

    const tokens = tokenizeEntityName(normalized).map(normalizeLookup)
    if (tokens.some(token => NON_PERSON_NAME_TOKENS.has(token))) continue

    counts.set(normalized, (counts.get(normalized) || 0) + 1)
  }

  return new Set([...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([name]) => name))
}

function hasStrongCharacterEvidence(candidate: ExtractedCharacter) {
  const quote = cleanEvidenceText(candidate.sourceQuote || candidate.description || '', 320)
  if (!quote) return false

  const identity = getCharacterIdentity(candidate.name)
  if (!identity.coreTokens.length) return false

  const quoteLookup = normalizeLookup(quote)
  const overlap = identity.coreTokens.filter(token => quoteLookup.includes(token)).length
  if (!overlap) return false

  if (identity.title) {
    return overlap >= Math.min(identity.coreTokens.length, 1)
  }

  return overlap >= Math.min(identity.coreTokens.length, 2)
}

function isMalformedPropFragment(name: string, description = '') {
  const normalizedName = resolveCanonicalPropName(name, description)
  const tokens = tokenizeEntityName(normalizedName).map(normalizeLookup).filter(Boolean)
  if (!tokens.length) return true
  if (tokens.length >= 2 && (MALFORMED_PROP_TOKENS.has(tokens[1]) || PROSE_FRAGMENT_PROP_WORDS.has(tokens[1]))) return true
  if (GENERIC_PROP_KEYWORDS.has(tokens[0] || '') && tokens.length >= 2 && PROSE_FRAGMENT_PROP_WORDS.has(tokens[1])) return true

  const descriptionLookup = normalizeLookup(description)
  if (!SHIP_PREFIX_PATTERN.test(tokens[0] || '') && descriptionLookup.includes(' enquanto ')) return true

  return false
}

function inferCharacterRole(description: string) {
  const text = description.toLowerCase()
  if (!text) return ''
  if (/(protagonista|heroi|hero[ií]na)/.test(text)) return 'Protagonista'
  if (/(vil[aã]o|antagonista)/.test(text)) return 'Antagonista'
  if (/(irm[aã]|irm[aã]o)/.test(text)) return 'Familia'
  if (/(mestre|mentor)/.test(text)) return 'Mentor'
  return ''
}

export function buildCharacterMentions(script: string): CharacterMention[] {
  const mentions: CharacterMention[] = [
    ...extractDialogueSpeakerMentions(script).map((mention) => ({
      kind: 'character' as const,
      name: mention.name,
      canonicalName: normalizeCharacterName(mention.name),
      signal: 'dialogue' as const,
      confidence: 1,
      sourceQuote: cleanEvidenceText(mention.sourceQuote || '', 280),
      sourceSpan: buildMentionSourceSpan(mention.sceneIndex),
      sceneIndex: mention.sceneIndex,
      location: mention.location,
      time: mention.time,
    })),
    ...extractTitledCharacterMentions(script).map((mention) => ({
      kind: 'character' as const,
      name: mention.name,
      canonicalName: normalizeCharacterName(mention.name),
      signal: 'title' as const,
      confidence: 0.92,
      sourceQuote: cleanEvidenceText(mention.sourceQuote || '', 280),
      sourceSpan: buildMentionSourceSpan(mention.sceneIndex),
      sceneIndex: mention.sceneIndex,
      location: mention.location,
      time: mention.time,
    })),
    ...extractFullNameCharacterMentions(script).map((mention) => ({
      kind: 'character' as const,
      name: mention.name,
      canonicalName: normalizeCharacterName(mention.name),
      signal: 'full_name' as const,
      confidence: 0.78,
      sourceQuote: cleanEvidenceText(mention.sourceQuote || '', 280),
      sourceSpan: buildMentionSourceSpan(mention.sceneIndex),
      sceneIndex: mention.sceneIndex,
      location: mention.location,
      time: mention.time,
    })),
  ]
    .filter((mention) => mention.canonicalName)
    .filter((mention) => !CAPITALIZED_STOPWORDS.has(mention.canonicalName))
    .filter((mention) => classifyEntityKind({ name: mention.canonicalName, description: mention.sourceQuote }) === 'character')

  return dedupeMentionsByKey(mentions, (mention) => normalizeLookup(mention.canonicalName))
}

export function buildSceneMentions(script: string): SceneMention[] {
  const scenes = parseScreenplayStructure(script)
  const mentions = scenes.map((scene) => ({
    kind: 'scene' as const,
    location: scene.location,
    canonicalLocation: normalizeSceneLocation(scene.location),
    time: normalizeSceneTime(scene.time || ''),
    signal: 'heading' as const,
    confidence: 1,
    sourceQuote: cleanEvidenceText(scene.sourceQuote || scene.headingRaw || '', 280),
    sourceSpan: buildMentionSourceSpan(scene.index),
    sceneIndex: scene.index,
  }))
    .filter((mention) => mention.canonicalLocation)
    .filter((mention) => isLikelyReusableSceneLocation(mention.canonicalLocation))

  return dedupeMentionsByKey(mentions, (mention) => `${normalizeLookup(mention.canonicalLocation)}@@${normalizeLookup(mention.time || '')}`)
}

export function buildPropMentions(script: string): PropMention[] {
  const mentions = extractPropMentions(script)
    .map((mention) => {
      const canonicalName = resolveCanonicalPropName(mention.name, mention.sourceQuote || '')
      const signal: PropMentionSignal = SHIP_PREFIX_PATTERN.test(canonicalName) ? 'named_ship' : 'object_phrase'
      return {
        kind: 'prop' as const,
        name: mention.name,
        canonicalName,
        signal,
        confidence: signal === 'named_ship' ? 1 : 0.8,
        sourceQuote: cleanEvidenceText(mention.sourceQuote || '', 280),
        sourceSpan: buildMentionSourceSpan(mention.sceneIndex),
        sceneIndex: mention.sceneIndex,
        location: mention.location,
        time: mention.time,
      }
    })
    .filter((mention) => mention.canonicalName)
    .filter((mention) => !isMalformedPropFragment(mention.canonicalName, mention.sourceQuote || ''))

  return dedupeMentionsByKey(mentions, (mention) => normalizeLookup(mention.canonicalName))
}

export function buildStructuralMentions(script: string): StructuralExtractionMentions {
  return {
    characters: buildCharacterMentions(script),
    scenes: buildSceneMentions(script),
    props: buildPropMentions(script),
  }
}

export function reconcileCharacterMentions(script: string, mentions: CharacterMention[]) {
  const groups: Array<{ canonicalName: string; mentions: CharacterMention[] }> = []

  for (const mention of mentions) {
    const canonicalName = normalizeCharacterName(mention.canonicalName || mention.name)
    if (!canonicalName) continue
    const existingGroup = groups.find((group) => isSameCharacterIdentity(group.canonicalName, canonicalName))
    if (existingGroup) {
      existingGroup.canonicalName = pickPreferredCharacterName(existingGroup.canonicalName, canonicalName)
      existingGroup.mentions.push({ ...mention, canonicalName })
      continue
    }
    groups.push({ canonicalName, mentions: [{ ...mention, canonicalName }] })
  }

  return sanitizeCharacterCandidates(groups.map((group) => {
    const evidence = pickMentionEvidence(group.mentions)
    return {
      name: group.canonicalName,
      role: '',
      description: buildEntityDescription(script, group.canonicalName),
      appearance: '',
      personality: '',
      sourceQuote: evidence?.sourceQuote || buildEntityEvidenceQuote(script, group.canonicalName),
      sourceSpan: collectMentionSpans(group.mentions),
    } satisfies ExtractedCharacter
  })).characters
}

export function reconcileSceneMentions(_script: string, mentions: SceneMention[]) {
  const groups: Array<{ scene: ExtractedScene; mentions: SceneMention[] }> = []

  for (const mention of mentions) {
    const candidate: ExtractedScene = {
      location: mention.canonicalLocation,
      time: mention.time || '',
      prompt: [mention.canonicalLocation, mention.time].filter(Boolean).join(' · ') || mention.canonicalLocation,
      productionLabel: mention.canonicalLocation,
      sourceQuote: mention.sourceQuote,
      sourceSpan: mention.sourceSpan,
    }
    const existingGroup = groups.find((group) => isSameSceneCandidate(group.scene, candidate))
    if (existingGroup) {
      existingGroup.scene = pickPreferredSceneCandidate(existingGroup.scene, candidate)
      existingGroup.mentions.push(mention)
      continue
    }
    groups.push({ scene: candidate, mentions: [mention] })
  }

  return sanitizeSceneCandidates(groups.map((group) => ({
    ...group.scene,
    sourceQuote: pickMentionEvidence(group.mentions)?.sourceQuote || group.scene.sourceQuote || '',
    sourceSpan: collectMentionSpans(group.mentions),
  })))
}

export function reconcilePropMentions(script: string, mentions: PropMention[]) {
  const groups: Array<{ canonicalName: string; mentions: PropMention[] }> = []

  for (const mention of mentions) {
    const canonicalName = resolveCanonicalPropName(mention.canonicalName || mention.name, mention.sourceQuote || '')
    if (!canonicalName) continue
    const existingGroup = groups.find((group) => isSamePropIdentity(group.canonicalName, canonicalName))
    if (existingGroup) {
      existingGroup.canonicalName = pickPreferredPropName(existingGroup.canonicalName, canonicalName)
      existingGroup.mentions.push({ ...mention, canonicalName })
      continue
    }
    groups.push({ canonicalName, mentions: [{ ...mention, canonicalName }] })
  }

  return sanitizePropCandidates(groups.map((group) => {
    const evidence = pickMentionEvidence(group.mentions)
    const description = buildEntityDescription(script, group.canonicalName)
    return {
      name: group.canonicalName,
      type: inferPropType(group.canonicalName, description),
      description,
      prompt: description || group.canonicalName,
      sourceQuote: evidence?.sourceQuote || buildEntityEvidenceQuote(script, group.canonicalName),
      sourceSpan: collectMentionSpans(group.mentions),
    } satisfies ExtractedProp
  }))
}

export function extractSceneCandidates(script: string): ExtractedScene[] {
  const scenes = reconcileSceneMentions(script, buildSceneMentions(script))
  if (scenes.length) return scenes
  return [{ location: 'Cenario principal', time: '', prompt: 'Cenario principal do episodio', sourceSpan: 'scene:1' }]
}

function extractDialogueNames(script: string) {
  const names = new Set<string>()
  for (const match of script.matchAll(/^([^#\n:：]{2,60})[:：]/gm)) {
    const normalized = normalizeCharacterName(match[1] || '')
    if (!normalized) continue
    names.add(normalized)
  }
  return names
}

function extractTitledNames(script: string) {
  const names = new Set<string>()
  const pattern = /\b([Cc]apit[aã]o|[Oo]ficial|[Mm]arinheiro|[Ss]enhor|[Ss]enhora|[Dd]ona|[Dd]om|[Rr]ei|[Rr]ainha|[Pp]rincipe|[Pp]ríncipe|[Pp]rincesa|[Dd]outor|[Dd]outora|[Ss]oldado)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*){0,2}|[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{2,}(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{2,}){0,2})\b/g

  for (const match of script.matchAll(pattern)) {
    const title = normalizeTokenCase(match[1] || '')
    const namePart = toTitleCase(String(match[2] || ''))
    const normalized = normalizeCharacterName(`${title} ${namePart}`)
    if (!normalized) continue
    names.add(normalized)
  }

  return names
}

function extractActionNames(script: string, sceneLocations: Set<string>) {
  const names = new Set<string>()
  for (const match of script.matchAll(/\b([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ'’ -]{1,})\b/g)) {
    const normalized = normalizeCharacterName(match[1] || '')
    if (!normalized || sceneLocations.has(normalized)) continue
    names.add(normalized)
  }
  return names
}

export function sanitizeCharacterCandidates(characters: ExtractedCharacter[]) {
  const candidateNames = characters
    .map(candidate => normalizeCharacterName(candidate.name))
    .filter(Boolean)
    .filter(name => !isGhostCharacterName(name))

  const seenCharacters = new Set<string>()
  const seenProps = new Set<string>()
  const normalizedCharacters: ExtractedCharacter[] = []
  const divertedProps: ExtractedProp[] = []

  for (const candidate of characters) {
    const kind = classifyEntityKind(candidate)
    if (kind === 'ignore') continue

    if (kind === 'prop') {
      const propName = resolveCanonicalPropName(candidate.name, candidate.description || candidate.appearance || '')
      const propKey = propName.toLowerCase()
      if (!propName || seenProps.has(propKey)) continue
      seenProps.add(propKey)
      divertedProps.push({
        name: propName,
        type: inferPropType(propName, candidate.description || ''),
        description: candidate.description || candidate.appearance || '',
        prompt: candidate.description || propName,
        sourceQuote: cleanEvidenceText(candidate.sourceQuote || candidate.description || candidate.appearance || '', 280),
        sourceSpan: cleanEvidenceText(candidate.sourceSpan || '', 80),
      })
      continue
    }

    const name = resolveCanonicalCharacterAlias(candidate.name, candidateNames)
    const key = name.toLowerCase()
    if (!name || CAPITALIZED_STOPWORDS.has(name) || seenCharacters.has(key)) continue
    const normalizedCharacter: ExtractedCharacter = {
      name,
      role: candidate.role || inferCharacterRole(candidate.description || ''),
      description: cleanEvidenceText(candidate.description || '', 480),
      appearance: normalizeWhitespace(String(candidate.appearance || '').replace(/[`*_>#]/g, ' ')).slice(0, 320),
      personality: normalizeWhitespace(String(candidate.personality || '').replace(/[`*_>#]/g, ' ')).slice(0, 320),
      sourceQuote: cleanEvidenceText(candidate.sourceQuote || candidate.description || '', 280),
      sourceSpan: cleanEvidenceText(candidate.sourceSpan || '', 80),
    }
    if (!hasStrongCharacterEvidence(normalizedCharacter)) continue
    seenCharacters.add(key)
    normalizedCharacters.push(normalizedCharacter)
  }

  return {
    characters: normalizedCharacters.filter(character => character.name && (character.description || character.sourceQuote)),
    props: divertedProps,
  }
}

function pickLongestText(values: Array<string | null | undefined>) {
  return values
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)[0] || ''
}

function scoreLinkedCharacterRow(row: any, canonicalName: string) {
  const normalizedRowName = normalizeCharacterName(String(row?.name || ''))
  let score = 0
  if (normalizedRowName === canonicalName) score += 100
  if (isSameCharacterIdentity(normalizedRowName, canonicalName)) score += 50
  if (row?.voiceStyle || row?.voice_style) score += 10
  if (row?.voiceSampleUrl || row?.voice_sample_url) score += 5
  score += normalizedRowName.length / 100
  return score
}

export function sanitizeEpisodeCharacterRows<T extends Record<string, any>>(rows: T[]) {
  const activeRows = rows.filter(row => !row?.deletedAt && !row?.deleted_at)
  const sanitized = sanitizeCharacterCandidates(activeRows.map((row) => ({
    name: String(row?.name || ''),
    role: String(row?.role || ''),
    description: String(row?.description || ''),
    appearance: String(row?.appearance || ''),
    personality: String(row?.personality || ''),
  })))

  const characters = sanitized.characters
    .map((character) => {
      const matches = activeRows.filter((row) => isSameCharacterIdentity(String(row?.name || ''), character.name))
      const selected = [...matches]
        .sort((left, right) => scoreLinkedCharacterRow(right, character.name) - scoreLinkedCharacterRow(left, character.name))[0]
      if (!selected) return null

      return {
        ...selected,
        name: character.name,
        role: character.role || selected?.role || '',
        description: pickLongestText([character.description, ...matches.map(row => row?.description)]),
        appearance: pickLongestText([character.appearance, ...matches.map(row => row?.appearance)]),
        personality: pickLongestText([character.personality, ...matches.map(row => row?.personality)]),
      }
    })
    .filter(Boolean) as T[]

  return {
    characters,
    divertedProps: sanitized.props,
  }
}

export function sanitizePropCandidates(props: ExtractedProp[]) {
  const sanitized: ExtractedProp[] = []

  for (const prop of props) {
    const name = resolveCanonicalPropName(prop.name, prop.description || prop.prompt || '')
    const tokens = tokenizeEntityName(name).map(normalizeLookup)
    if (!name) continue
    if (isMalformedPropFragment(name, `${prop.description || ''} ${prop.sourceQuote || ''}`)) continue

    const candidate: ExtractedProp = {
      name,
      type: prop.type || inferPropType(name, prop.description || ''),
      description: cleanEvidenceText(prop.description || '', 480),
      prompt: normalizeWhitespace(String(prop.prompt || prop.description || name).replace(/[`*_>#]/g, ' ')).slice(0, 480),
      sourceQuote: cleanEvidenceText(prop.sourceQuote || prop.description || '', 280),
      sourceSpan: cleanEvidenceText(prop.sourceSpan || '', 80),
    }

    const existingIndex = sanitized.findIndex((item) => isSamePropIdentity(item.name, candidate.name, item.description || item.prompt || '', candidate.description || candidate.prompt || ''))
    if (existingIndex >= 0) {
      const existing = sanitized[existingIndex]
      sanitized[existingIndex] = {
        name: pickPreferredPropName(existing.name, candidate.name),
        type: candidate.type || existing.type,
        description: pickLongestText([existing.description, candidate.description]),
        prompt: pickLongestText([candidate.prompt, existing.prompt, candidate.description, existing.description]),
      }
      continue
    }

    sanitized.push(candidate)
  }

  return sanitized
}

export function isGhostPropName(raw: string) {
  const name = normalizePropName(raw)
  if (!name) return true
  return isMalformedPropFragment(name)
}

function findExistingPropMatch(existingProps: Array<{ id: number; name: string; type?: string | null; description?: string | null; prompt?: string | null; deletedAt?: string | null }>, candidate: ExtractedProp) {
  return existingProps.find((item) => (
    !item.deletedAt
    && isSamePropIdentity(item.name, candidate.name, item.description || item.prompt || '', candidate.description || candidate.prompt || '')
  )) || null
}

export function buildCharacterCandidates(script: string, scenes: ExtractedScene[]): ExtractedCharacter[] {
  const sceneLocations = new Set(
    scenes.flatMap(scene => scene.location.split(/\s+/).map(part => normalizeCharacterName(part)).filter(Boolean)),
  )
  const mentions = buildCharacterMentions(script)
  if (mentions.length) return reconcileCharacterMentions(script, mentions)

  const fallbackNames = [
    ...extractDialogueNames(script),
    ...extractTitledNames(script),
    ...extractActionNames(script, sceneLocations),
  ].map((name) => ({
    kind: 'character' as const,
    name,
    canonicalName: name,
    signal: 'full_name' as const,
    confidence: 0.5,
    sourceQuote: buildEntityEvidenceQuote(script, name),
    sourceSpan: 'scene:1',
    sceneIndex: 0,
    location: '',
    time: '',
  }))

  return reconcileCharacterMentions(script, fallbackNames)
}

export function buildPropCandidates(script: string, scenes: ExtractedScene[], seedCharacters: ExtractedCharacter[] = []): ExtractedProp[] {
  const sceneLocations = new Set(scenes.map(scene => scene.location.toLowerCase()))
  const candidates = new Map<string, ExtractedProp>()

  const addProp = (rawName: string, descriptionHint = '') => {
    const name = resolveCanonicalPropName(rawName, descriptionHint)
    if (!name) return
    if (sceneLocations.has(name.toLowerCase())) return
    const sourceQuote = buildEntityEvidenceQuote(script, name) || cleanEvidenceText(descriptionHint, 280)
    const description = buildEntityDescription(script, name) || normalizeWhitespace(descriptionHint)
    if (isMalformedPropFragment(name, `${description} ${sourceQuote}`)) return
    const key = name.toLowerCase()
    if (candidates.has(key)) return
    candidates.set(key, {
      name,
      type: inferPropType(name, description),
      description,
      prompt: description || name,
      sourceQuote,
    })
  }

  const rerouted = sanitizeCharacterCandidates(seedCharacters).props
  rerouted.forEach((prop) => addProp(prop.name, prop.description || ''))

  for (const mention of extractPropMentions(script)) {
    addProp(mention.name, mention.sourceQuote || '')
  }

  const shipPattern = /\b(?:HMS|USS|RMS|SS|MV|MS)\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*){0,2}\b/g
  for (const match of script.match(shipPattern) || []) addProp(match)

  const objectPattern = /\b(?:navio|barco|carro|autom[oó]vel|caminh[aã]o|moto|motocicleta|avi[aã]o|helic[oó]ptero|nave|submarino|artefato|amuleto|espada|pistola|rifle|arma|anel|livro|telefone|r[aá]dio|mapa|chave)\s+(?:[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’.-]*){0,2})/g
  for (const match of script.match(objectPattern) || []) addProp(match)

  const hasNamedShip = [...candidates.values()].some(candidate => candidate.type === 'ship' && /^HMS\b|^USS\b|^RMS\b|^SS\b|^MV\b|^MS\b/i.test(candidate.name))
  const genericObjectHits = new Map<string, number>()
  for (const keyword of ['navio', 'barco', 'carro', 'caminhão', 'caminhao', 'moto', 'avião', 'aviao', 'artefato', 'amuleto']) {
    const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'gi')
    const hits = script.match(pattern)?.length || 0
    if (hits >= 2) genericObjectHits.set(keyword, hits)
  }
  genericObjectHits.forEach((_hits, keyword) => {
    if (hasNamedShip && (keyword === 'navio' || keyword === 'barco')) return
    addProp(keyword)
  })

  const mentions = buildPropMentions(script)
  if (mentions.length) {
    return sanitizePropCandidates([
      ...reconcilePropMentions(script, mentions),
      ...[...candidates.values()],
    ])
  }

  return sanitizePropCandidates([...candidates.values()])
}

export function buildStructuralExtraction(script: string): StructuralExtractionResult {
  const mentions = buildStructuralMentions(script)
  const scenes = mentions.scenes.length ? reconcileSceneMentions(script, mentions.scenes) : extractSceneCandidates(script)
  const characters = mentions.characters.length ? reconcileCharacterMentions(script, mentions.characters) : buildCharacterCandidates(script, scenes)
  const props = mentions.props.length ? reconcilePropMentions(script, mentions.props) : buildPropCandidates(script, scenes, characters)
  return { scenes, characters, props, mentions }
}

export function reconcileCharactersAgainstExisting(
  characters: ExtractedCharacter[],
  existingCharacters: ExistingCharacterLike[],
) {
  return sanitizeCharacterCandidates(characters.map((character) => {
    const existing = findExistingCharacterMatch(existingCharacters, character.name)
    if (!existing) return character
    return {
      ...character,
      name: pickPreferredCharacterName(existing.name, character.name),
      role: character.role || existing.role || '',
      description: pickLongestText([character.description, existing.description]),
      appearance: pickLongestText([character.appearance, existing.appearance]),
      personality: pickLongestText([character.personality, existing.personality]),
    } satisfies ExtractedCharacter
  })).characters
}

export function reconcileScenesAgainstExisting(
  scenes: ExtractedScene[],
  existingScenes: Array<{ location: string; time?: string | null; prompt?: string | null; deletedAt?: string | null }>,
) {
  const activeExistingScenes = existingScenes.filter((scene) => !scene.deletedAt)
  return sanitizeSceneCandidates(scenes.map((scene) => {
    const existing = activeExistingScenes.find((row) => isSameSceneCandidate({
      location: row.location,
      time: String(row.time || ''),
    }, scene))
    if (!existing) return scene
    return pickPreferredSceneCandidate({
      location: existing.location,
      time: String(existing.time || ''),
      prompt: String(existing.prompt || existing.location || ''),
    }, scene)
  }))
}

export function reconcilePropsAgainstExisting(
  props: ExtractedProp[],
  existingProps: Array<{ id?: number; name: string; type?: string | null; description?: string | null; prompt?: string | null; deletedAt?: string | null }>,
) {
  const activeExistingProps = existingProps.filter((prop) => !prop.deletedAt)
  return sanitizePropCandidates(props.map((prop) => {
    const existing = activeExistingProps.find((item) => (
      isSamePropIdentity(item.name, prop.name, item.description || item.prompt || '', prop.description || prop.prompt || '')
    ))
    if (!existing) return prop
    return {
      ...prop,
      name: pickPreferredPropName(existing.name, prop.name),
      type: prop.type || existing.type || 'object',
      description: pickLongestText([prop.description, existing.description]),
      prompt: pickLongestText([prop.prompt, existing.prompt, prop.description, existing.description]),
    } satisfies ExtractedProp
  }))
}

export function reconcileStructuralExtractionToDrama(
  dramaId: number,
  extraction: Pick<StructuralExtractionResult, 'characters' | 'scenes' | 'props' | 'mentions'>,
): StructuralExtractionResult {
  const existingCharacters = db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId))
    .all()
  const existingScenes = db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, dramaId))
    .all()
  const existingProps = db.select().from(schema.props)
    .where(eq(schema.props.dramaId, dramaId))
    .all()

  return {
    mentions: extraction.mentions,
    characters: reconcileCharactersAgainstExisting(extraction.characters, existingCharacters),
    scenes: reconcileScenesAgainstExisting(extraction.scenes, existingScenes),
    props: reconcilePropsAgainstExisting(extraction.props, existingProps),
  }
}

function linkCharacterToEpisode(episodeId: number, characterId: number) {
  const existing = db.select().from(schema.episodeCharacters)
    .where(and(
      eq(schema.episodeCharacters.episodeId, episodeId),
      eq(schema.episodeCharacters.characterId, characterId),
    ))
    .all()
  if (existing.length) return
  db.insert(schema.episodeCharacters).values({ episodeId, characterId, createdAt: now() }).run()
}

function linkSceneToEpisode(episodeId: number, sceneId: number) {
  const existing = db.select().from(schema.episodeScenes)
    .where(and(
      eq(schema.episodeScenes.episodeId, episodeId),
      eq(schema.episodeScenes.sceneId, sceneId),
    ))
    .all()
  if (existing.length) return
  db.insert(schema.episodeScenes).values({ episodeId, sceneId, createdAt: now() }).run()
}

function softDeleteSceneIfOrphaned(sceneId: number) {
  const remainingLinks = db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.sceneId, sceneId))
    .all()
  if (remainingLinks.length) return
  db.update(schema.scenes).set({
    deletedAt: now(),
    updatedAt: now(),
  }).where(eq(schema.scenes.id, sceneId)).run()
}

function linkPropToEpisode(episodeId: number, propId: number) {
  const existing = db.select().from(schema.episodeProps)
    .where(and(
      eq(schema.episodeProps.episodeId, episodeId),
      eq(schema.episodeProps.propId, propId),
    ))
    .all()
  if (existing.length) return
  db.insert(schema.episodeProps).values({ episodeId, propId, createdAt: now() }).run()
}

export function upsertCharacters(episodeId: number, dramaId: number, characters: ExtractedCharacter[]) {
  const ts = now()
  const sanitized = sanitizeCharacterCandidates(characters)
  const existingCharacters = db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId))
    .all()
    .filter(character => !character.deletedAt)

  let created = 0
  let merged = 0

  for (const character of sanitized.characters) {
    const existing = findExistingCharacterMatch(existingCharacters, character.name)
    if (existing) {
      db.update(schema.characters).set({
        name: pickPreferredCharacterName(existing.name, character.name),
        role: character.role || existing.role,
        description: character.description || existing.description,
        appearance: character.appearance || existing.appearance,
        personality: character.personality || existing.personality,
        updatedAt: ts,
      }).where(eq(schema.characters.id, existing.id)).run()
      linkCharacterToEpisode(episodeId, existing.id)
      merged++
      continue
    }

    const inserted = db.insert(schema.characters).values({
      dramaId,
      name: character.name,
      role: character.role || '',
      description: character.description || '',
      appearance: character.appearance || '',
      personality: character.personality || '',
      createdAt: ts,
      updatedAt: ts,
    }).run()
    linkCharacterToEpisode(episodeId, Number(inserted.lastInsertRowid))
    created++
  }

  return { created, merged, divertedProps: sanitized.props }
}

function softDeleteCharacterIfOrphaned(characterId: number) {
  const remainingLinks = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.characterId, characterId))
    .all()
  if (remainingLinks.length) return
  db.update(schema.characters).set({
    deletedAt: now(),
    updatedAt: now(),
  }).where(eq(schema.characters.id, characterId)).run()
}

function softDeletePropIfOrphaned(propId: number) {
  const remainingLinks = db.select().from(schema.episodeProps)
    .where(eq(schema.episodeProps.propId, propId))
    .all()
  if (remainingLinks.length) return
  db.update(schema.props).set({
    deletedAt: now(),
    updatedAt: now(),
  }).where(eq(schema.props.id, propId)).run()
}

export function syncEpisodeCharactersToCandidates(episodeId: number, dramaId: number, characters: ExtractedCharacter[]) {
  const sanitized = sanitizeCharacterCandidates(characters)
  const allowedNames = sanitized.characters.map(character => character.name)
  const linkedCharacters = db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId))
    .all()
    .filter(character => db.select().from(schema.episodeCharacters)
      .where(and(
        eq(schema.episodeCharacters.episodeId, episodeId),
        eq(schema.episodeCharacters.characterId, character.id),
      ))
      .all()
      .length > 0)

  for (const character of linkedCharacters) {
    if (character.deletedAt) {
      db.delete(schema.episodeCharacters)
        .where(and(
          eq(schema.episodeCharacters.episodeId, episodeId),
          eq(schema.episodeCharacters.characterId, character.id),
        ))
        .run()
      continue
    }
    const matchesAllowedCandidate = allowedNames.some(allowed => isSameCharacterIdentity(character.name, allowed))
    if (matchesAllowedCandidate) continue
    db.delete(schema.episodeCharacters)
      .where(and(
        eq(schema.episodeCharacters.episodeId, episodeId),
        eq(schema.episodeCharacters.characterId, character.id),
      ))
      .run()
    softDeleteCharacterIfOrphaned(character.id)
  }
}

export function syncEpisodePropsToCandidates(episodeId: number, dramaId: number, props: ExtractedProp[]) {
  const sanitized = sanitizePropCandidates(props)
  const linkedProps = db.select().from(schema.props)
    .where(eq(schema.props.dramaId, dramaId))
    .all()
    .filter(prop => db.select().from(schema.episodeProps)
      .where(and(
        eq(schema.episodeProps.episodeId, episodeId),
        eq(schema.episodeProps.propId, prop.id),
      ))
      .all()
      .length > 0)

  for (const prop of linkedProps) {
    if (prop.deletedAt) {
      db.delete(schema.episodeProps)
        .where(and(
          eq(schema.episodeProps.episodeId, episodeId),
          eq(schema.episodeProps.propId, prop.id),
        ))
        .run()
      continue
    }
    const allowedMatch = sanitized.some((candidate) => (
      isSamePropIdentity(prop.name, candidate.name, prop.description || prop.prompt || '', candidate.description || candidate.prompt || '')
    ))
    if (allowedMatch) continue
    db.delete(schema.episodeProps)
      .where(and(
        eq(schema.episodeProps.episodeId, episodeId),
        eq(schema.episodeProps.propId, prop.id),
      ))
      .run()
    softDeletePropIfOrphaned(prop.id)
  }
}

export function upsertScenes(episodeId: number, dramaId: number, scenes: ExtractedScene[]) {
  const ts = now()
  const sanitizedScenes = sanitizeSceneCandidates(scenes)
  const existingScenes = db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, dramaId))
    .all()
    .filter(scene => !scene.deletedAt)

  let created = 0
  let reused = 0

  for (const scene of sanitizedScenes) {
    const existing = existingScenes.find(item => isSameSceneCandidate(item, scene))
    if (existing) {
      const preferred = pickPreferredSceneCandidate({
        location: existing.location,
        time: existing.time || '',
        prompt: existing.prompt || existing.location,
      }, scene)
      db.update(schema.scenes).set({
        location: preferred.location,
        time: preferred.time || '',
        prompt: preferred.prompt || preferred.location,
        updatedAt: ts,
      }).where(eq(schema.scenes.id, existing.id)).run()
      linkSceneToEpisode(episodeId, existing.id)
      reused++
      continue
    }

    const inserted = db.insert(schema.scenes).values({
      dramaId,
      episodeId: null,
      location: scene.location,
      time: scene.time || '',
      prompt: scene.prompt || scene.location,
      visualProfile: null,
      storyboardCount: 1,
      imageUrl: null,
      status: 'pending',
      localPath: null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
    }).run()
    linkSceneToEpisode(episodeId, Number(inserted.lastInsertRowid))
    existingScenes.push({
      id: Number(inserted.lastInsertRowid),
      dramaId,
      episodeId: null,
      location: scene.location,
      time: scene.time || '',
      prompt: scene.prompt || scene.location,
      visualProfile: null,
      storyboardCount: 1,
      imageUrl: null,
      status: 'pending',
      localPath: null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
    })
    created++
  }

  return { created, reused }
}

export function syncEpisodeScenesToCandidates(episodeId: number, dramaId: number, scenes: ExtractedScene[]) {
  const sanitizedScenes = sanitizeSceneCandidates(scenes)
  const activeDramaScenes = db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, dramaId))
    .all()
    .filter(scene => !scene.deletedAt)
  const previouslyLinkedSceneIds = db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId))
    .all()
    .map(link => link.sceneId)

  const desiredSceneIds = sanitizedScenes
    .map((scene) => {
      const matches = activeDramaScenes
        .filter(row => isSameSceneCandidate(row, scene))
        .sort((left, right) => {
          const leftScore = Number(normalizeLookup(left.location) === normalizeLookup(scene.location)) * 100
            + Number(normalizeLookup(left.time || '') === normalizeLookup(scene.time || '')) * 20
            + String(left.location || '').length
          const rightScore = Number(normalizeLookup(right.location) === normalizeLookup(scene.location)) * 100
            + Number(normalizeLookup(right.time || '') === normalizeLookup(scene.time || '')) * 20
            + String(right.location || '').length
          return rightScore - leftScore
        })
      if (!matches.length) return null

      const keeper = matches[0]
      const preferred = pickPreferredSceneCandidate({
        location: keeper.location,
        time: keeper.time || '',
        prompt: keeper.prompt || keeper.location,
      }, scene)
    db.update(schema.scenes).set({
      location: preferred.location,
      time: preferred.time || '',
        prompt: preferred.prompt || preferred.location,
        updatedAt: now(),
      }).where(eq(schema.scenes.id, keeper.id)).run()
      return keeper.id
    })
    .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))

  const uniqueDesiredSceneIds = [...new Set(desiredSceneIds)]

  db.delete(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId))
    .run()

  for (const sceneId of uniqueDesiredSceneIds) {
    linkSceneToEpisode(episodeId, sceneId)
  }

  for (const sceneId of previouslyLinkedSceneIds) {
    if (uniqueDesiredSceneIds.includes(sceneId)) continue
    softDeleteSceneIfOrphaned(sceneId)
  }
}

export function sanitizeEpisodeSceneRows<T extends Record<string, any>>(rows: T[]) {
  const activeRows = rows.filter(row => !row?.deletedAt && !row?.deleted_at)
  const sanitized = sanitizeSceneCandidates(activeRows.map((row) => ({
    location: String(row?.location || ''),
    time: String(row?.time || ''),
    prompt: String(row?.prompt || ''),
  })))

  const scenes = sanitized
    .map((scene) => {
      const matches = activeRows.filter((row) => isSameSceneCandidate({
        location: String(row?.location || ''),
        time: String(row?.time || ''),
      }, scene))
      const selected = [...matches].sort((left, right) => {
        const leftScore = Number(normalizeLookup(String(left?.location || '')) === normalizeLookup(scene.location)) * 100
          + Number(normalizeLookup(String(left?.time || '')) === normalizeLookup(scene.time || '')) * 20
          + String(left?.location || '').length
        const rightScore = Number(normalizeLookup(String(right?.location || '')) === normalizeLookup(scene.location)) * 100
          + Number(normalizeLookup(String(right?.time || '')) === normalizeLookup(scene.time || '')) * 20
          + String(right?.location || '').length
        return rightScore - leftScore
      })[0]
      if (!selected) return null

      return {
        ...selected,
        location: scene.location,
        time: scene.time || '',
        prompt: scene.prompt || selected?.prompt || scene.location,
      }
    })
    .filter(Boolean) as T[]

  return { scenes }
}

export function upsertProps(episodeId: number, dramaId: number, props: ExtractedProp[]) {
  const ts = now()
  const sanitized = sanitizePropCandidates(props)
  const existingProps = db.select().from(schema.props)
    .where(eq(schema.props.dramaId, dramaId))
    .all()
    .filter(prop => !prop.deletedAt)

  let created = 0
  let merged = 0

  for (const prop of sanitized) {
    const existing = findExistingPropMatch(existingProps, prop)
    if (existing) {
      db.update(schema.props).set({
        name: pickPreferredPropName(existing.name, prop.name),
        type: prop.type || existing.type,
        description: pickLongestText([existing.description, prop.description]),
        prompt: pickLongestText([prop.prompt, existing.prompt, prop.description, existing.description]),
        updatedAt: ts,
      }).where(eq(schema.props.id, existing.id)).run()
      if (episodeId > 0) linkPropToEpisode(episodeId, existing.id)
      merged++
      continue
    }

    const inserted = db.insert(schema.props).values({
      dramaId,
      name: prop.name,
      type: prop.type || 'object',
      description: prop.description || '',
      prompt: prop.prompt || prop.name,
      imageUrl: null,
      referenceImages: null,
      localPath: null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
    }).run()
    if (episodeId > 0) linkPropToEpisode(episodeId, Number(inserted.lastInsertRowid))
    created++
  }

  return { created, merged }
}

export function listEpisodeProps(episodeId: number, dramaId: number) {
  const linkedIds = new Set(
    db.select().from(schema.episodeProps)
      .where(eq(schema.episodeProps.episodeId, episodeId))
      .all()
      .map(link => link.propId),
  )

  return db.select().from(schema.props)
    .where(eq(schema.props.dramaId, dramaId))
    .all()
    .filter(prop => !prop.deletedAt && linkedIds.has(prop.id))
}

function linkStoryboardCharacter(storyboardId: number, characterId: number) {
  const existing = db.select().from(schema.storyboardCharacters)
    .where(and(
      eq(schema.storyboardCharacters.storyboardId, storyboardId),
      eq(schema.storyboardCharacters.characterId, characterId),
    ))
    .all()
  if (existing.length) return
  db.insert(schema.storyboardCharacters).values({ storyboardId, characterId }).run()
}

function migrateCharacterReferences(fromCharacterId: number, toCharacterId: number) {
  const episodeLinks = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.characterId, fromCharacterId))
    .all()
  for (const link of episodeLinks) linkCharacterToEpisode(link.episodeId, toCharacterId)
  db.delete(schema.episodeCharacters).where(eq(schema.episodeCharacters.characterId, fromCharacterId)).run()

  const storyboardLinks = db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.characterId, fromCharacterId))
    .all()
  for (const link of storyboardLinks) linkStoryboardCharacter(link.storyboardId, toCharacterId)
  db.delete(schema.storyboardCharacters).where(eq(schema.storyboardCharacters.characterId, fromCharacterId)).run()

  db.update(schema.imageGenerations)
    .set({ characterId: toCharacterId, updatedAt: now() })
    .where(eq(schema.imageGenerations.characterId, fromCharacterId))
    .run()
}

function migrateSceneReferences(fromSceneId: number, toSceneId: number) {
  const episodeLinks = db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.sceneId, fromSceneId))
    .all()
  for (const link of episodeLinks) linkSceneToEpisode(link.episodeId, toSceneId)
  db.delete(schema.episodeScenes).where(eq(schema.episodeScenes.sceneId, fromSceneId)).run()

  db.update(schema.storyboards)
    .set({ sceneId: toSceneId, updatedAt: now() })
    .where(eq(schema.storyboards.sceneId, fromSceneId))
    .run()

  db.update(schema.imageGenerations)
    .set({ sceneId: toSceneId, updatedAt: now() })
    .where(eq(schema.imageGenerations.sceneId, fromSceneId))
    .run()

  db.update(schema.audioCues)
    .set({ scopeId: toSceneId, updatedAt: now() })
    .where(and(
      eq(schema.audioCues.scopeType, 'scene'),
      eq(schema.audioCues.scopeId, fromSceneId),
    ))
    .run()
}

function migratePropReferences(fromPropId: number, toPropId: number) {
  const episodeLinks = db.select().from(schema.episodeProps)
    .where(eq(schema.episodeProps.propId, fromPropId))
    .all()
  for (const link of episodeLinks) linkPropToEpisode(link.episodeId, toPropId)
  db.delete(schema.episodeProps).where(eq(schema.episodeProps.propId, fromPropId)).run()

  db.update(schema.imageGenerations)
    .set({ propId: toPropId, updatedAt: now() })
    .where(eq(schema.imageGenerations.propId, fromPropId))
    .run()
}

function scoreCharacterKeeper(row: any) {
  let score = 0
  if (row?.imageUrl) score += 40
  if (row?.voiceStyle || row?.voice_style) score += 20
  if (row?.voiceSampleUrl || row?.voice_sample_url) score += 20
  score += String(row?.description || '').length / 20
  score += String(row?.appearance || '').length / 40
  score += String(row?.name || '').length
  return score
}

function scoreSceneKeeper(row: any) {
  let score = 0
  if (row?.imageUrl) score += 40
  if (row?.localPath) score += 10
  score += String(row?.location || '').length
  score += String(row?.time || '').length / 2
  score += String(row?.prompt || '').length / 40
  return score
}

function scorePropKeeper(row: any) {
  let score = 0
  if (row?.imageUrl) score += 40
  if (row?.localPath) score += 10
  score += String(row?.description || '').length / 20
  score += String(row?.prompt || '').length / 40
  score += String(row?.name || '').length
  return score
}

function cleanupDuplicateCharacterRows(dramaId?: number) {
  const activeRows = db.select().from(schema.characters)
    .all()
    .filter(row => !row.deletedAt)
    .filter(row => dramaId == null || row.dramaId === dramaId)
    .sort((left, right) => scoreCharacterKeeper(right) - scoreCharacterKeeper(left))

  const keepers: any[] = []
  let merged = 0

  for (const row of activeRows) {
    const keeper = keepers.find(item => isSameCharacterIdentity(item.name, row.name))
    if (!keeper) {
      keepers.push(row)
      continue
    }

    db.update(schema.characters).set({
      name: pickPreferredCharacterName(keeper.name, row.name),
      role: keeper.role || row.role || '',
      description: pickLongestText([keeper.description, row.description]),
      appearance: pickLongestText([keeper.appearance, row.appearance]),
      personality: pickLongestText([keeper.personality, row.personality]),
      voiceStyle: keeper.voiceStyle || row.voiceStyle || '',
      voiceSampleUrl: keeper.voiceSampleUrl || row.voiceSampleUrl || '',
      imageUrl: keeper.imageUrl || row.imageUrl || '',
      localPath: keeper.localPath || row.localPath || '',
      updatedAt: now(),
    }).where(eq(schema.characters.id, keeper.id)).run()

    migrateCharacterReferences(row.id, keeper.id)
    db.update(schema.characters).set({
      deletedAt: now(),
      updatedAt: now(),
    }).where(eq(schema.characters.id, row.id)).run()
    merged++
  }

  return merged
}

function cleanupDuplicateSceneRows(dramaId?: number) {
  const activeRows = db.select().from(schema.scenes)
    .all()
    .filter(row => !row.deletedAt)
    .filter(row => dramaId == null || row.dramaId === dramaId)
    .sort((left, right) => scoreSceneKeeper(right) - scoreSceneKeeper(left))

  const keepers: any[] = []
  let merged = 0

  for (const row of activeRows) {
    const keeper = keepers.find(item => isSameSceneCandidate(item, row))
    if (!keeper) {
      keepers.push(row)
      continue
    }

    const preferred = pickPreferredSceneCandidate({
      location: keeper.location,
      time: keeper.time || '',
      prompt: keeper.prompt || keeper.location,
    }, {
      location: row.location,
      time: row.time || '',
      prompt: row.prompt || row.location,
    })

    db.update(schema.scenes).set({
      location: preferred.location,
      time: preferred.time || '',
      prompt: preferred.prompt || preferred.location,
      imageUrl: keeper.imageUrl || row.imageUrl || null,
      localPath: keeper.localPath || row.localPath || null,
      updatedAt: now(),
    }).where(eq(schema.scenes.id, keeper.id)).run()

    migrateSceneReferences(row.id, keeper.id)
    db.update(schema.scenes).set({
      deletedAt: now(),
      updatedAt: now(),
    }).where(eq(schema.scenes.id, row.id)).run()
    merged++
  }

  return merged
}

function cleanupDuplicatePropRows(dramaId?: number) {
  const activeRows = db.select().from(schema.props)
    .all()
    .filter(row => !row.deletedAt)
    .filter(row => dramaId == null || row.dramaId === dramaId)
    .sort((left, right) => scorePropKeeper(right) - scorePropKeeper(left))

  const keepers: any[] = []
  let merged = 0

  for (const row of activeRows) {
    const keeper = keepers.find(item => (
      isSamePropIdentity(item.name, row.name, item.description || item.prompt || '', row.description || row.prompt || '')
    ))
    if (!keeper) {
      keepers.push(row)
      continue
    }

    db.update(schema.props).set({
      name: pickPreferredPropName(keeper.name, row.name),
      type: keeper.type || row.type || 'object',
      description: pickLongestText([keeper.description, row.description]),
      prompt: pickLongestText([keeper.prompt, row.prompt, keeper.description, row.description]),
      imageUrl: keeper.imageUrl || row.imageUrl || null,
      localPath: keeper.localPath || row.localPath || null,
      updatedAt: now(),
    }).where(eq(schema.props.id, keeper.id)).run()

    migratePropReferences(row.id, keeper.id)
    db.update(schema.props).set({
      deletedAt: now(),
      updatedAt: now(),
    }).where(eq(schema.props.id, row.id)).run()
    merged++
  }

  return merged
}

export function cleanupCanonicalDramaEntities(options?: { dramaId?: number; episodeId?: number }) {
  const characterCleanup = cleanupObjectLikeCharacters(options)
  const duplicateCharacters = cleanupDuplicateCharacterRows(options?.dramaId)
  const duplicateScenes = cleanupDuplicateSceneRows(options?.dramaId)
  const duplicateProps = cleanupDuplicatePropRows(options?.dramaId)

  return {
    ...characterCleanup,
    duplicateCharacters,
    duplicateScenes,
    duplicateProps,
  }
}

export function cleanupObjectLikeCharacters(options?: { dramaId?: number; episodeId?: number }) {
  const episodeId = options?.episodeId
  const dramaId = options?.dramaId
  const characterRows = db.select().from(schema.characters)
    .all()
    .filter(character => !character.deletedAt)
    .filter(character => dramaId == null || character.dramaId === dramaId)

  const activeCharacterNames = characterRows.map(character => normalizeCharacterName(character.name)).filter(Boolean)
  let moved = 0
  let removed = 0
  let mergedAliases = 0
  for (const character of characterRows) {
    if (episodeId != null) {
      const isLinkedToEpisode = db.select().from(schema.episodeCharacters)
        .where(and(
          eq(schema.episodeCharacters.episodeId, episodeId),
          eq(schema.episodeCharacters.characterId, character.id),
        ))
        .all()
        .length > 0
      if (!isLinkedToEpisode) continue
    }

    const canonicalName = resolveCanonicalCharacterAlias(character.name, activeCharacterNames)
    if (canonicalName && normalizeLookup(canonicalName) !== normalizeLookup(character.name)) {
      const canonicalCharacter = characterRows.find(item => item.id !== character.id && normalizeLookup(item.name) === normalizeLookup(canonicalName))
      if (canonicalCharacter) {
        db.update(schema.characters).set({
          name: pickPreferredCharacterName(canonicalCharacter.name, canonicalName),
          updatedAt: now(),
        }).where(eq(schema.characters.id, canonicalCharacter.id)).run()
        const episodeLinks = db.select().from(schema.episodeCharacters)
          .where(eq(schema.episodeCharacters.characterId, character.id))
          .all()
        for (const link of episodeLinks) {
          linkCharacterToEpisode(link.episodeId, canonicalCharacter.id)
        }
        db.delete(schema.episodeCharacters).where(eq(schema.episodeCharacters.characterId, character.id)).run()
        db.update(schema.characters).set({
          deletedAt: now(),
          updatedAt: now(),
        }).where(eq(schema.characters.id, character.id)).run()
        mergedAliases++
        continue
      }
    }

    const kind = classifyEntityKind({ name: character.name, role: character.role || '', description: character.description || '' })
    if (kind === 'ignore') {
      db.delete(schema.episodeCharacters).where(eq(schema.episodeCharacters.characterId, character.id)).run()
      db.update(schema.characters).set({
        deletedAt: now(),
        updatedAt: now(),
      }).where(eq(schema.characters.id, character.id)).run()
      removed++
      continue
    }

    if (kind !== 'prop') continue

    const propStats = upsertProps(0, character.dramaId, [{
      name: resolveCanonicalPropName(character.name, character.description || character.appearance || ''),
      type: inferPropType(character.name, character.description || ''),
      description: character.description || character.appearance || '',
      prompt: character.description || character.name,
    }])
    const [prop] = db.select().from(schema.props)
      .where(and(eq(schema.props.dramaId, character.dramaId), eq(schema.props.name, resolveCanonicalPropName(character.name, character.description || character.appearance || ''))))
      .all()
    if (prop) {
      const episodeLinks = db.select().from(schema.episodeCharacters)
        .where(eq(schema.episodeCharacters.characterId, character.id))
        .all()
      for (const link of episodeLinks) {
        linkPropToEpisode(link.episodeId, prop.id)
      }
      db.delete(schema.episodeCharacters).where(eq(schema.episodeCharacters.characterId, character.id)).run()
    }
    db.update(schema.characters).set({
      deletedAt: now(),
      updatedAt: now(),
    }).where(eq(schema.characters.id, character.id)).run()
    moved += propStats.created + propStats.merged > 0 ? 1 : 0
  }

  const propRows = db.select().from(schema.props)
    .all()
    .filter(prop => !prop.deletedAt)
    .filter(prop => dramaId == null || prop.dramaId === dramaId)

  let propsRemoved = 0
  for (const prop of propRows) {
    if (episodeId != null) {
      const isLinkedToEpisode = db.select().from(schema.episodeProps)
        .where(and(
          eq(schema.episodeProps.episodeId, episodeId),
          eq(schema.episodeProps.propId, prop.id),
        ))
        .all()
        .length > 0
      if (!isLinkedToEpisode) continue
    }

    if (!isGhostPropName(prop.name)) continue
    db.delete(schema.episodeProps).where(eq(schema.episodeProps.propId, prop.id)).run()
    db.update(schema.props).set({
      deletedAt: now(),
      updatedAt: now(),
    }).where(eq(schema.props.id, prop.id)).run()
    propsRemoved++
  }

  return { moved, removed, mergedAliases, propsRemoved }
}
