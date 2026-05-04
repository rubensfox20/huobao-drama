import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { getActiveConfig } from './ai.js'
import { getBuiltinVoices, getDefaultVoiceId } from './voice-catalog.js'
import {
  buildStructuralExtraction,
  reconcileStructuralExtractionToDrama,
  syncEpisodeCharactersToCandidates,
  syncEpisodePropsToCandidates,
  syncEpisodeScenesToCandidates,
  upsertCharacters as upsertSanitizedCharacters,
  upsertProps as upsertSanitizedProps,
  upsertScenes as upsertSanitizedScenes,
} from './extraction-entities.js'
import { replaceEpisodeExtractionMentions } from './extraction-audit.js'
import { filterNamedCandidatesAgainstSource } from './script-sanitizer.js'
import {
  inferVoiceGender,
  isVoiceCompatibleWithCharacter,
  pickVoiceForCharacter,
  shouldRefreshCharacterVoiceAssignment,
} from './voice-selection.js'
import { invalidateCharacterVoiceOutputs } from './voice-invalidation.js'

type ExtractedCharacter = {
  name: string
  role?: string
  description?: string
  appearance?: string
  personality?: string
}

type ExtractedScene = {
  location: string
  time?: string
  prompt?: string
}

const CHARACTER_IGNORE_PATTERN = /^(narrac[aã]o|narrador|off|voz off|ambiente|sfx|bgm|efeito|efeitos|som|trilha|musica|m[uú]sica)$/i
const CAPITALIZED_STOPWORDS = new Set([
  'Abaixo',
  'Acima',
  'Ali',
  'Aqui',
  'Com',
  'Contra',
  'Interior',
  'Exterior',
  'Interno',
  'Externo',
  'Dia',
  'Noite',
  'Tarde',
  'Manha',
  'Manhã',
  'Madrugada',
  'Amanhecer',
  'Anoitecer',
  'Céu',
  'Vila',
  'Cidade',
  'Reino',
  'Ilhas',
  'Energia',
  'Aether',
  'Devastador',
  'Todos',
  'Todo',
  'Toda',
  'Silêncio',
  'Silencio',
  'Ele',
  'Ela',
  'Eles',
  'Elas',
  'Seus',
  'Suas',
  'Seu',
  'Sua',
  'Gritos',
  'De',
  'Da',
  'Do',
  'Das',
  'Dos',
  'Em',
  'No',
  'Na',
  'Um',
  'Uma',
  'O',
  'A',
  'Os',
  'As',
])

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function normalizeCharacterName(raw: string) {
  const cleaned = normalizeWhitespace(
    raw
      .replace(/[（(].*?[)）]/g, ' ')
      .replace(/[^A-Za-zÀ-ÿ0-9'’ -]/g, ' '),
  )
  if (!cleaned || cleaned.length > 40) return ''
  if (CHARACTER_IGNORE_PATTERN.test(cleaned)) return ''
  if (/^s\d+$/i.test(cleaned)) return ''
  if (cleaned === cleaned.toUpperCase()) return toTitleCase(cleaned)
  return cleaned
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function linkCharacterToEpisode(episodeId: number, characterId: number) {
  const existing = db.select().from(schema.episodeCharacters)
    .where(and(
      eq(schema.episodeCharacters.episodeId, episodeId),
      eq(schema.episodeCharacters.characterId, characterId),
    ))
    .all()
  if (existing.length) return

  db.insert(schema.episodeCharacters).values({
    episodeId,
    characterId,
    createdAt: now(),
  }).run()
}

function linkSceneToEpisode(episodeId: number, sceneId: number) {
  const existing = db.select().from(schema.episodeScenes)
    .where(and(
      eq(schema.episodeScenes.episodeId, episodeId),
      eq(schema.episodeScenes.sceneId, sceneId),
    ))
    .all()
  if (existing.length) return

  db.insert(schema.episodeScenes).values({
    episodeId,
    sceneId,
    createdAt: now(),
  }).run()
}

function extractSceneCandidates(script: string): ExtractedScene[] {
  const matches = [...script.matchAll(/^##\s*S\d+\s*\|\s*(.+?)\s*\|\s*(.+)$/gm)]
  const seen = new Set<string>()
  const scenes: ExtractedScene[] = []

  for (const match of matches) {
    const sceneBody = normalizeWhitespace(match[1] || '')
    const time = normalizeWhitespace(match[2] || '')
    const parts = sceneBody.split('·').map(part => normalizeWhitespace(part)).filter(Boolean)
    const location = parts.length > 1 ? parts[parts.length - 1] : sceneBody
    const dedupeKey = `${location}@@${time}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    scenes.push({
      location,
      time,
      prompt: [location, time].filter(Boolean).join(' · ') || location,
    })
  }

  if (scenes.length) return scenes

  return [{
    location: 'Cenario principal',
    time: '',
    prompt: 'Cenario principal do episodio',
  }]
}

function extractDialogueNames(script: string) {
  const names = new Set<string>()
  for (const match of script.matchAll(/^([^#\n:：]{2,40})[:：]/gm)) {
    const normalized = normalizeCharacterName(match[1] || '')
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

function buildCharacterDescription(script: string, name: string) {
  const paragraphs = script.split(/\n\s*\n/).map(part => normalizeWhitespace(part)).filter(Boolean)
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i')
  const hits = paragraphs.filter(paragraph => pattern.test(paragraph))
  const description = normalizeWhitespace(hits.slice(0, 2).join(' '))
  return description.slice(0, 480)
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

function buildCharacterCandidates(script: string, scenes: ExtractedScene[]): ExtractedCharacter[] {
  const sceneLocations = new Set(
    scenes.flatMap(scene => scene.location.split(/\s+/).map(part => normalizeCharacterName(part)).filter(Boolean)),
  )

  const candidateNames = new Set<string>([
    ...extractDialogueNames(script),
    ...extractActionNames(script, sceneLocations),
  ])

  const characters = [...candidateNames]
    .filter(name => !CAPITALIZED_STOPWORDS.has(name))
    .map((name) => {
      const description = buildCharacterDescription(script, name)
      return {
        name,
        role: inferCharacterRole(description),
        description,
        appearance: '',
        personality: '',
      }
    })
    .filter(character => character.name && character.description)

  return characters
}

function upsertCharacters(episodeId: number, dramaId: number, characters: ExtractedCharacter[]) {
  const ts = now()
  const existingCharacters = db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId))
    .all()
    .filter(character => !character.deletedAt)

  let created = 0
  let merged = 0

  for (const character of characters) {
    const existing = existingCharacters.find(item => item.name === character.name)
    if (existing) {
      db.update(schema.characters).set({
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

  return { created, merged }
}

function upsertScenes(episodeId: number, dramaId: number, scenes: ExtractedScene[]) {
  const ts = now()
  const existingScenes = db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, dramaId))
    .all()
    .filter(scene => !scene.deletedAt)
  const seenKeys = new Set(existingScenes.map(scene => `${scene.location}@@${scene.time || ''}`))

  let created = 0
  let reused = 0

  for (const scene of scenes) {
    const sceneKey = `${scene.location}@@${scene.time || ''}`
    const existing = existingScenes.find(item => item.location === scene.location && item.time === (scene.time || ''))
    if (existing) {
      linkSceneToEpisode(episodeId, existing.id)
      reused++
      continue
    }
    if (seenKeys.has(sceneKey)) {
      reused++
      continue
    }

    const inserted = db.insert(schema.scenes).values({
      dramaId,
      location: scene.location,
      time: scene.time || '',
      prompt: scene.prompt || scene.location,
      createdAt: ts,
      updatedAt: ts,
    }).run()
    seenKeys.add(sceneKey)
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
    linkSceneToEpisode(episodeId, Number(inserted.lastInsertRowid))
    created++
  }

  return { created, reused }
}

function getEpisodeCharacters(episodeId: number, dramaId: number) {
  const linkedIds = new Set(
    db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId))
      .all()
      .map(link => link.characterId),
  )

  return db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId))
    .all()
    .filter(character => !character.deletedAt && linkedIds.has(character.id))
}

function getEpisodeAudioProvider(episodeId: number) {
  const [episode] = db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, episodeId))
    .all()

  if (episode?.audioConfigId) {
    const [config] = db.select().from(schema.aiServiceConfigs)
      .where(eq(schema.aiServiceConfigs.id, episode.audioConfigId))
      .all()
    if (config?.provider) return config.provider
  }

  return getActiveConfig('audio')?.provider || 'gemini'
}

function getVoicePool(provider: string) {
  const dbVoices = db.select().from(schema.aiVoices)
    .where(eq(schema.aiVoices.provider, provider))
    .all()

  if (dbVoices.length) {
    return dbVoices.map(voice => ({
      id: voice.voiceId,
      provider,
      name: voice.voiceName,
      description: voice.description ? JSON.parse(voice.description) : [],
      language: voice.language,
      gender: inferVoiceGender({
        id: voice.voiceId,
        name: voice.voiceName,
        description: voice.description ? JSON.parse(voice.description) : [],
        language: voice.language,
        provider,
      }),
    }))
  }

  return getBuiltinVoices(provider).map(voice => ({
    id: voice.voice_id,
    provider,
    name: voice.voice_name,
    description: voice.description,
    language: voice.language,
    gender: voice.gender,
  }))
}

export function fallbackExtractAndSaveMetadata(episodeId: number, dramaId: number) {
  const [episode] = db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, episodeId))
    .all()

  const source = String(episode?.content || '').trim()
  const script = String(episode?.scriptContent || episode?.content || '').trim()
  if (!script) {
    throw new Error('Episode has no script content to extract')
  }

  const structural = reconcileStructuralExtractionToDrama(
    dramaId,
    buildStructuralExtraction(script),
  )
  const characters = source
    ? filterNamedCandidatesAgainstSource(structural.characters, source)
    : structural.characters
  const props = structural.props
  const characterStats = upsertSanitizedCharacters(episodeId, dramaId, characters)
  const sceneStats = upsertSanitizedScenes(episodeId, dramaId, structural.scenes)
  const propStats = upsertSanitizedProps(episodeId, dramaId, [...props, ...characterStats.divertedProps])
  syncEpisodeCharactersToCandidates(episodeId, dramaId, characters)
  syncEpisodeScenesToCandidates(episodeId, dramaId, structural.scenes)
  syncEpisodePropsToCandidates(episodeId, dramaId, [...props, ...characterStats.divertedProps])
  replaceEpisodeExtractionMentions(episodeId, dramaId, {
    ...structural,
    characters,
    props: [...props, ...characterStats.divertedProps],
  })

  return {
    charactersFound: characters.length,
    scenesFound: structural.scenes.length,
    propsFound: props.length + characterStats.divertedProps.length,
    charactersCreated: characterStats.created,
    charactersMerged: characterStats.merged,
    scenesCreated: sceneStats.created,
    scenesReused: sceneStats.reused,
    propsCreated: propStats.created,
    propsMerged: propStats.merged,
  }
}

export function fallbackAssignVoices(episodeId: number, dramaId: number) {
  const characters = getEpisodeCharacters(episodeId, dramaId)
  const provider = getEpisodeAudioProvider(episodeId)
  const voicePool = getVoicePool(provider)
  const defaultVoiceId = getDefaultVoiceId(provider)

  if (!characters.length) {
    return {
      provider,
      assigned: 0,
      skipped: 0,
      reason: 'no_episode_characters',
    }
  }

  let assigned = 0
  let skipped = 0
  const usage = new Map<string, number>()

  for (const character of characters) {
    const currentVoice = voicePool.find((voice) => voice.id === character.voiceStyle)
    const shouldRefreshVoice = shouldRefreshCharacterVoiceAssignment(provider, character.voiceStyle, character)
    if (
      character.voiceStyle
      && character.voiceProvider === provider
      && isVoiceCompatibleWithCharacter(currentVoice, character)
      && !shouldRefreshVoice
    ) {
      usage.set(character.voiceStyle, (usage.get(character.voiceStyle) || 0) + 1)
      skipped++
      continue
    }

    const voiceId = pickVoiceForCharacter(character, voicePool, defaultVoiceId, usage)
    db.update(schema.characters).set({
      voiceStyle: voiceId,
      voiceProvider: provider,
      voiceSampleUrl: null,
      updatedAt: now(),
    }).where(eq(schema.characters.id, character.id)).run()
    invalidateCharacterVoiceOutputs(character.id)
    assigned++
  }

  return {
    provider,
    assigned,
    skipped,
    reason: assigned ? 'assigned_missing_voices' : 'all_characters_already_voiced',
  }
}
