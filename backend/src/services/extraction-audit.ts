import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import type {
  CharacterMention,
  ExtractedCharacter,
  ExtractedProp,
  ExtractedScene,
  PropMention,
  SceneMention,
} from './extraction-entities.js'
import {
  isSameCharacterIdentity,
  isSamePropIdentity,
  isSameSceneCandidate,
  normalizeCharacterName,
  normalizeSceneLocation,
  normalizeSceneTime,
  resolveCanonicalPropName,
} from './extraction-entities.js'

export type ExtractionAuditEntityType = 'character' | 'scene' | 'prop'

type ExtractionMentionRow = typeof schema.extractionMentions.$inferSelect
type ExtractionMentionInsert = typeof schema.extractionMentions.$inferInsert

export type ExtractionAuditMention = {
  signal: string
  confidence: number
  source_quote: string
  source_span: string
  scene_index: number | null
  location: string
  time: string
}

export type ExtractionAuditSummary = {
  entity_identity: string
  entity_label: string
  mention_count: number
  top_quote: string
  top_span: string
  signals: string[]
  mentions: ExtractionAuditMention[]
}

function sceneIdentity(scene: Pick<ExtractedScene, 'location' | 'time'>) {
  return `${normalizeSceneLocation(scene.location || '')}@@${normalizeSceneTime(scene.time || '')}`
}

function sceneLabel(scene: Pick<ExtractedScene, 'location' | 'time'>) {
  return [normalizeSceneLocation(scene.location || ''), normalizeSceneTime(scene.time || '')]
    .filter(Boolean)
    .join(' · ')
}

function dedupeInsertRows(rows: ExtractionMentionInsert[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = [
      row.entityType,
      row.entityIdentity,
      row.signal,
      row.sourceSpan,
      row.sourceQuote,
      row.sceneIndex,
    ].join('@@')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mapMentionRowToSummaryMention(row: ExtractionMentionRow): ExtractionAuditMention {
  return {
    signal: String(row.signal || ''),
    confidence: Number(row.confidence || 0),
    source_quote: String(row.sourceQuote || ''),
    source_span: String(row.sourceSpan || ''),
    scene_index: row.sceneIndex ?? null,
    location: String(row.location || ''),
    time: String(row.time || ''),
  }
}

export function summarizeExtractionMentionRows(rows: ExtractionMentionRow[]) {
  const grouped = new Map<string, ExtractionAuditSummary>()
  const sortedRows = [...rows].sort((left, right) => {
    const confidenceScore = Number(right.confidence || 0) - Number(left.confidence || 0)
    if (confidenceScore !== 0) return confidenceScore
    return String(right.sourceQuote || '').length - String(left.sourceQuote || '').length
  })

  for (const row of sortedRows) {
    const identity = String(row.entityIdentity || '').trim()
    if (!identity) continue
    const existing = grouped.get(identity)
    const mention = mapMentionRowToSummaryMention(row)
    if (!existing) {
      grouped.set(identity, {
        entity_identity: identity,
        entity_label: String(row.entityLabel || ''),
        mention_count: 1,
        top_quote: mention.source_quote,
        top_span: mention.source_span,
        signals: mention.signal ? [mention.signal] : [],
        mentions: [mention],
      })
      continue
    }
    existing.mention_count += 1
    if (mention.signal && !existing.signals.includes(mention.signal)) existing.signals.push(mention.signal)
    existing.mentions.push(mention)
  }

  for (const summary of grouped.values()) {
    summary.signals = [...summary.signals].sort()
    summary.mentions = summary.mentions.slice(0, 5)
  }

  return grouped
}

function buildCharacterMentionRows(
  episodeId: number,
  dramaId: number,
  characters: ExtractedCharacter[],
  mentions: CharacterMention[],
) {
  const timestamp = now()
  return dedupeInsertRows(mentions.flatMap((mention) => {
    const matched = characters.find((character) => isSameCharacterIdentity(character.name, mention.canonicalName || mention.name))
    if (!matched) return []
    return [{
      episodeId,
      dramaId,
      entityType: 'character' as const,
      entityIdentity: normalizeCharacterName(matched.name),
      entityLabel: matched.name,
      signal: mention.signal,
      confidence: mention.confidence,
      sourceQuote: mention.sourceQuote,
      sourceSpan: mention.sourceSpan,
      sceneIndex: mention.sceneIndex,
      location: mention.location,
      time: mention.time,
      metadata: matched.role ? JSON.stringify({ role: matched.role }) : null,
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies ExtractionMentionInsert]
  }))
}

function buildSceneMentionRows(
  episodeId: number,
  dramaId: number,
  scenes: ExtractedScene[],
  mentions: SceneMention[],
) {
  const timestamp = now()
  return dedupeInsertRows(mentions.flatMap((mention) => {
    const matched = scenes.find((scene) => isSameSceneCandidate(scene, {
      location: mention.canonicalLocation || mention.location,
      time: mention.time || '',
    }))
    if (!matched) return []
    return [{
      episodeId,
      dramaId,
      entityType: 'scene' as const,
      entityIdentity: sceneIdentity(matched),
      entityLabel: sceneLabel(matched),
      signal: mention.signal,
      confidence: mention.confidence,
      sourceQuote: mention.sourceQuote,
      sourceSpan: mention.sourceSpan,
      sceneIndex: mention.sceneIndex,
      location: normalizeSceneLocation(matched.location || ''),
      time: normalizeSceneTime(matched.time || ''),
      metadata: matched.productionLabel ? JSON.stringify({ production_label: matched.productionLabel }) : null,
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies ExtractionMentionInsert]
  }))
}

function buildPropMentionRows(
  episodeId: number,
  dramaId: number,
  props: ExtractedProp[],
  mentions: PropMention[],
) {
  const timestamp = now()
  return dedupeInsertRows(mentions.flatMap((mention) => {
    const matched = props.find((prop) => (
      isSamePropIdentity(
        prop.name,
        mention.canonicalName || mention.name,
        prop.description || prop.prompt || '',
        mention.sourceQuote || '',
      )
    ))
    if (!matched) return []
    return [{
      episodeId,
      dramaId,
      entityType: 'prop' as const,
      entityIdentity: resolveCanonicalPropName(matched.name, matched.description || matched.prompt || ''),
      entityLabel: matched.name,
      signal: mention.signal,
      confidence: mention.confidence,
      sourceQuote: mention.sourceQuote,
      sourceSpan: mention.sourceSpan,
      sceneIndex: mention.sceneIndex,
      location: mention.location,
      time: mention.time,
      metadata: matched.type ? JSON.stringify({ type: matched.type }) : null,
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies ExtractionMentionInsert]
  }))
}

function replaceEpisodeExtractionMentionsOfType(
  episodeId: number,
  entityType: ExtractionAuditEntityType,
  rows: ExtractionMentionInsert[],
) {
  db.delete(schema.extractionMentions)
    .where(and(
      eq(schema.extractionMentions.episodeId, episodeId),
      eq(schema.extractionMentions.entityType, entityType),
    ))
    .run()

  if (!rows.length) return
  db.insert(schema.extractionMentions).values(rows).run()
}

export function replaceEpisodeCharacterExtractionMentions(
  episodeId: number,
  dramaId: number,
  characters: ExtractedCharacter[],
  mentions: CharacterMention[],
) {
  replaceEpisodeExtractionMentionsOfType(
    episodeId,
    'character',
    buildCharacterMentionRows(episodeId, dramaId, characters, mentions),
  )
}

export function replaceEpisodeSceneExtractionMentions(
  episodeId: number,
  dramaId: number,
  scenes: ExtractedScene[],
  mentions: SceneMention[],
) {
  replaceEpisodeExtractionMentionsOfType(
    episodeId,
    'scene',
    buildSceneMentionRows(episodeId, dramaId, scenes, mentions),
  )
}

export function replaceEpisodePropExtractionMentions(
  episodeId: number,
  dramaId: number,
  props: ExtractedProp[],
  mentions: PropMention[],
) {
  replaceEpisodeExtractionMentionsOfType(
    episodeId,
    'prop',
    buildPropMentionRows(episodeId, dramaId, props, mentions),
  )
}

export function replaceEpisodeExtractionMentions(
  episodeId: number,
  dramaId: number,
  extraction: {
    characters: ExtractedCharacter[]
    scenes: ExtractedScene[]
    props: ExtractedProp[]
    mentions: {
      characters: CharacterMention[]
      scenes: SceneMention[]
      props: PropMention[]
    }
  },
) {
  replaceEpisodeCharacterExtractionMentions(episodeId, dramaId, extraction.characters, extraction.mentions.characters)
  replaceEpisodeSceneExtractionMentions(episodeId, dramaId, extraction.scenes, extraction.mentions.scenes)
  replaceEpisodePropExtractionMentions(episodeId, dramaId, extraction.props, extraction.mentions.props)
}

export function listEpisodeExtractionMentionSummaries(
  episodeId: number,
  entityType?: ExtractionAuditEntityType,
) {
  const rows = entityType
    ? db.select().from(schema.extractionMentions)
      .where(and(
        eq(schema.extractionMentions.episodeId, episodeId),
        eq(schema.extractionMentions.entityType, entityType),
      ))
      .all()
    : db.select().from(schema.extractionMentions)
      .where(eq(schema.extractionMentions.episodeId, episodeId))
      .all()

  return summarizeExtractionMentionRows(rows)
}
