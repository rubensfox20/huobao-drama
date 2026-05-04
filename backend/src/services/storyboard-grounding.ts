import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { extractAllowedSpeakerNamesFromSource } from './script-sanitizer.js'
import { isSameSceneCandidate } from './extraction-entities.js'

type EpisodeCharacterLike = {
  id: number
  name: string
  role?: string | null
}

type StoryboardLike = {
  id?: number
  sceneId?: number | null
  scene_id?: number | null
  shot_number?: number | null
  storyboardNumber?: number | null
  title?: string | null
  location?: string | null
  time?: string | null
  shot_type?: string | null
  angle?: string | null
  movement?: string | null
  action?: string | null
  result?: string | null
  atmosphere?: string | null
  image_prompt?: string | null
  video_prompt?: string | null
  bgm_prompt?: string | null
  sound_effect?: string | null
  description?: string | null
  dialogue?: string | null
  duration?: number | null
  characterIds?: number[]
  character_ids?: number[]
}

type DialogueCue = {
  speaker: string
  line: string
  raw: string
}

type ScreenplaySceneBlock = {
  order: number
  location: string
  time: string
  dialogues: DialogueCue[]
}

const HUMAN_TITLE_TOKENS = new Set([
  'capitao', 'capitão', 'oficial', 'marinheiro', 'senhor', 'senhora', 'dona', 'dom',
  'rei', 'rainha', 'principe', 'príncipe', 'princesa', 'soldado', 'tripulante',
])

function normalizeWhitespace(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeLookup(value: string) {
  return normalizeWhitespace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function tokenizeName(value: string) {
  return normalizeWhitespace(value)
    .split(/\s+/)
    .map(token => token.replace(/[^A-Za-zÀ-ÿ0-9'’.-]/g, ''))
    .filter(Boolean)
}

function normalizeCharacterName(raw: string) {
  return normalizeWhitespace(
    String(raw || '')
      .replace(/[（(].*?[)）]/g, ' ')
      .replace(/[^A-Za-zÀ-ÿ0-9'’ -]/g, ' '),
  )
}

function getCharacterIdTokens(character: EpisodeCharacterLike) {
  const normalizedName = normalizeCharacterName(character.name || '')
  const tokens = tokenizeName(normalizedName).map(normalizeLookup).filter(Boolean)
  const titleToken = tokens.length > 1 && HUMAN_TITLE_TOKENS.has(tokens[0]) ? tokens[0] : ''
  const surname = tokens[tokens.length - 1] || ''
  return {
    normalizedName,
    normalizedLookup: normalizeLookup(normalizedName),
    tokens,
    titleToken,
    surname,
  }
}

function parseDialogueSpeaker(dialogue: string) {
  const match = String(dialogue || '').match(/^([^#\n:：]{2,80})[:：]/)
  return normalizeCharacterName(match?.[1] || '')
}

function normalizeDialogueLine(text: string) {
  return normalizeWhitespace(String(text || ''))
    .replace(/^["“”'`]+/, '')
    .replace(/["“”'`]+$/, '')
}

function resolveAllowedSpeakerName(candidate: string, allowedNames: string[]) {
  const normalizedCandidate = normalizeLookup(candidate)
  if (!normalizedCandidate) return ''
  const candidateTokens = tokenizeName(candidate).map(normalizeLookup).filter(Boolean)
  const candidateTail = candidateTokens[candidateTokens.length - 1] || ''

  const matches = allowedNames.filter((allowedName) => {
    const allowedTokens = tokenizeName(allowedName).map(normalizeLookup).filter(Boolean)
    if (!allowedTokens.length) return false
    if (normalizeLookup(allowedName) === normalizedCandidate) return true
    const allowedTail = allowedTokens[allowedTokens.length - 1] || ''
    if (!candidateTail || candidateTail !== allowedTail) return false
    const allowedJoined = allowedTokens.join(' ')
    const candidateJoined = candidateTokens.join(' ')
    return candidateJoined.endsWith(allowedJoined) || allowedJoined.endsWith(candidateJoined)
  })

  return [...matches].sort((left, right) => right.length - left.length)[0] || ''
}

function buildStoryboardGroundingText(storyboard: StoryboardLike) {
  return normalizeLookup([
    storyboard.title,
    storyboard.location,
    storyboard.time,
    storyboard.action,
    storyboard.description,
    storyboard.dialogue,
  ].filter(Boolean).join(' '))
}

function textMentionsCharacter(storyboard: StoryboardLike, character: EpisodeCharacterLike, allCharacters: EpisodeCharacterLike[]) {
  const text = buildStoryboardGroundingText(storyboard)
  if (!text) return false

  const identity = getCharacterIdTokens(character)
  if (!identity.tokens.length) return false

  if (identity.normalizedLookup && text.includes(identity.normalizedLookup)) return true
  if (identity.surname && new RegExp(`\\b${identity.surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
    return true
  }

  if (identity.titleToken) {
    const sameTitleCount = allCharacters.filter((item) => getCharacterIdTokens(item).titleToken === identity.titleToken).length
    if (sameTitleCount === 1 && new RegExp(`\\b${identity.titleToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      return true
    }
  }

  const speaker = normalizeLookup(parseDialogueSpeaker(String(storyboard.dialogue || '')))
  if (speaker && (speaker === identity.normalizedLookup || speaker.endsWith(identity.surname))) return true

  return false
}

function parseScreenplaySceneBlocks(screenplay: string, rawSource = ''): ScreenplaySceneBlock[] {
  const text = String(screenplay || '')
  const headers = [...text.matchAll(/^##\s*S\d+\s*\|\s*(.+?)\s*\|\s*(.+)$/gm)]
  if (!headers.length) return []

  const allowedNames = extractAllowedSpeakerNamesFromSource(rawSource || screenplay)
  const blocks: ScreenplaySceneBlock[] = []

  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index]
    const start = Number(header.index || 0) + String(header[0] || '').length
    const end = index + 1 < headers.length ? Number(headers[index + 1].index || text.length) : text.length
    const sceneBody = text.slice(start, end)
    const sceneHeader = normalizeWhitespace(header[1] || '')
    const parts = sceneHeader.split('·').map(part => normalizeWhitespace(part)).filter(Boolean)
    const location = parts.length > 1 ? parts[parts.length - 1] : sceneHeader
    const time = normalizeWhitespace(header[2] || '')
    const dialogues: DialogueCue[] = []
    const seenDialogues = new Set<string>()

    const pattern = /(^|[\n\r]|[.!?]\s+)([^#\n:：]{2,80})[:：]\s*([^:\n]{2,220})/g
    let match: RegExpExecArray | null
    while ((match = pattern.exec(sceneBody)) !== null) {
      const speaker = normalizeCharacterName(match[2] || '')
      const line = normalizeDialogueLine(match[3] || '')
      if (!speaker || !line) continue
      const canonicalSpeaker = resolveAllowedSpeakerName(speaker, allowedNames) || speaker
      if (allowedNames.length && !resolveAllowedSpeakerName(canonicalSpeaker, allowedNames)) continue
      const key = `${normalizeLookup(canonicalSpeaker)}@@${normalizeLookup(line)}`
      if (seenDialogues.has(key)) continue
      seenDialogues.add(key)
      dialogues.push({
        speaker: canonicalSpeaker,
        line,
        raw: `${canonicalSpeaker}: ${line}`,
      })
    }

    blocks.push({
      order: index + 1,
      location,
      time,
      dialogues,
    })
  }

  return blocks
}

function getStoryboardSceneMatch(storyboard: StoryboardLike, screenplayScenes: ScreenplaySceneBlock[]) {
  const storyboardScene = {
    location: normalizeWhitespace(storyboard.location || ''),
    time: normalizeWhitespace(storyboard.time || ''),
  }

  return screenplayScenes.find((scene) => isSameSceneCandidate(storyboardScene, scene)) || null
}

export function sanitizeStoryboardCharacterIdsForText(
  storyboard: StoryboardLike,
  currentIds: number[],
  episodeCharacters: EpisodeCharacterLike[],
) {
  const uniqueIds = [...new Set((currentIds || []).filter(Boolean))]
    .filter((id) => episodeCharacters.some((character) => character.id === id))

  const referencedIds = episodeCharacters
    .filter((character) => textMentionsCharacter(storyboard, character, episodeCharacters))
    .map((character) => character.id)

  const combined = [...new Set([...uniqueIds, ...referencedIds])]
  return combined.filter((id) => {
    const character = episodeCharacters.find((item) => item.id === id)
    return character ? textMentionsCharacter(storyboard, character, episodeCharacters) : false
  })
}

export function repairStoryboardRowsAgainstScript(
  storyboards: StoryboardLike[],
  screenplay: string,
  rawSource: string,
  episodeCharacters: EpisodeCharacterLike[],
) {
  const sceneBlocks = parseScreenplaySceneBlocks(screenplay, rawSource)
  const repaired = storyboards.map((storyboard) => ({
    ...storyboard,
    dialogue: normalizeWhitespace(String(storyboard.dialogue || '')),
    character_ids: sanitizeStoryboardCharacterIdsForText(
      storyboard,
      storyboard.character_ids || storyboard.characterIds || [],
      episodeCharacters,
    ),
  }))

  for (const scene of sceneBlocks) {
    if (!scene.dialogues.length) continue

    const sceneStoryboards = repaired
      .filter((storyboard) => getStoryboardSceneMatch(storyboard, [scene]))
      .sort((left, right) => Number(left.shot_number || left.storyboardNumber || 0) - Number(right.shot_number || right.storyboardNumber || 0))

    if (!sceneStoryboards.length) continue

    const existingDialogues = new Set(
      sceneStoryboards
        .map((storyboard) => normalizeLookup(String(storyboard.dialogue || '')))
        .filter(Boolean),
    )

    const pendingDialogues = scene.dialogues.filter((dialogue) => !existingDialogues.has(normalizeLookup(dialogue.raw)))
    if (!pendingDialogues.length) continue

    let targetIndex = 0
    for (const dialogue of pendingDialogues) {
      const target = sceneStoryboards.find((storyboard, index) => index >= targetIndex && !normalizeWhitespace(String(storyboard.dialogue || '')))
        || sceneStoryboards[Math.min(targetIndex, sceneStoryboards.length - 1)]
      if (!target) continue

      const speakerCharacter = episodeCharacters.find((character) => {
        const normalizedSpeaker = normalizeLookup(dialogue.speaker)
        const identity = getCharacterIdTokens(character)
        return identity.normalizedLookup === normalizedSpeaker || (identity.surname && normalizedSpeaker.endsWith(identity.surname))
      })

      target.dialogue = dialogue.raw
      const nextIds = sanitizeStoryboardCharacterIdsForText(
        target,
        [...(target.character_ids || target.characterIds || []), ...(speakerCharacter ? [speakerCharacter.id] : [])],
        episodeCharacters,
      )
      target.character_ids = nextIds
      targetIndex = Math.min(sceneStoryboards.length - 1, sceneStoryboards.indexOf(target) + 1)
    }
  }

  return repaired
}

export function sanitizeEpisodeStoryboardCharacterLinks(episodeId: number, dramaId: number) {
  const episodeCharacterIds = new Set(
    db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId))
      .all()
      .map((link) => link.characterId),
  )
  const episodeCharacters = db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId))
    .all()
    .filter((character) => !character.deletedAt && episodeCharacterIds.has(character.id))

  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()

  let updated = 0

  for (const storyboard of storyboards) {
    const currentIds = db.select().from(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, storyboard.id))
      .all()
      .map((link) => link.characterId)
    const nextIds = sanitizeStoryboardCharacterIdsForText(storyboard, currentIds, episodeCharacters)
    const currentKey = [...new Set(currentIds)].sort((left, right) => left - right).join(',')
    const nextKey = [...new Set(nextIds)].sort((left, right) => left - right).join(',')
    if (currentKey === nextKey) continue

    db.delete(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, storyboard.id))
      .run()

    for (const characterId of nextIds) {
      db.insert(schema.storyboardCharacters).values({
        storyboardId: storyboard.id,
        characterId,
      }).run()
    }
    updated += 1
  }

  return { updated }
}
