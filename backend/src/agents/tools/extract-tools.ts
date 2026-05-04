
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { logTaskProgress, logTaskSuccess } from '../../utils/task-logger.js'
import {
  buildStructuralExtraction,
  reconcileStructuralExtractionToDrama,
  sanitizeCharacterCandidates,
  sanitizePropCandidates,
  syncEpisodeCharactersToCandidates,
  syncEpisodePropsToCandidates,
  syncEpisodeScenesToCandidates,
  upsertCharacters,
  upsertProps,
  upsertScenes,
} from '../../services/extraction-entities.js'
import {
  replaceEpisodeCharacterExtractionMentions,
  replaceEpisodePropExtractionMentions,
  replaceEpisodeSceneExtractionMentions,
} from '../../services/extraction-audit.js'
import { filterNamedCandidatesAgainstSource } from '../../services/script-sanitizer.js'

export function createExtractTools(episodeId: number, dramaId: number) {


  const readScriptForExtraction = createTool({
    id: 'read_script_for_extraction',
    description: 'Read the formatted screenplay for character/scene extraction.',
    inputSchema: z.object({}),
    execute: async () => {
      const [ep] = db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all()
      if (!ep) return { error: 'Episode not found' }
      const content = ep.scriptContent || ep.content
      if (!content) return { error: 'Episode has no script content' }
      logTaskSuccess('ExtractTool', 'read-script', { episodeId, dramaId, scriptLength: content.length })
      return { script: content }
    },
  })


  const readExistingCharacters = createTool({
    id: 'read_existing_characters',
    description: 'Read all characters already existing in this drama project (for deduplication).',
    inputSchema: z.object({}),
    execute: async () => {
      const linkedIds = new Set(
        db.select().from(schema.episodeCharacters)
          .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
          .map(link => link.characterId),
      )
      const chars = db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, dramaId)).all()
        .filter(c => !c.deletedAt)
      const payload = {
        count: chars.length,
        characters: chars,
        current_episode_characters: chars.filter(c => linkedIds.has(c.id)),
      }
      logTaskSuccess('ExtractTool', 'read-characters', {
        episodeId,
        dramaId,
        projectCharacters: payload.count,
        episodeCharacters: payload.current_episode_characters.length,
      })
      return payload
    },
  })


  const readExistingScenes = createTool({
    id: 'read_existing_scenes',
    description: 'Read all scenes already existing in this drama project (for deduplication).',
    inputSchema: z.object({}),
    execute: async () => {
      const linkedIds = new Set(
        db.select().from(schema.episodeScenes)
          .where(eq(schema.episodeScenes.episodeId, episodeId)).all()
          .map(link => link.sceneId),
      )
      const scenes = db.select().from(schema.scenes)
        .where(eq(schema.scenes.dramaId, dramaId)).all()
        .filter(s => !s.deletedAt)
      const payload = {
        count: scenes.length,
        scenes,
        current_episode_scenes: scenes.filter(s => linkedIds.has(s.id)),
      }
      logTaskSuccess('ExtractTool', 'read-scenes', {
        episodeId,
        dramaId,
        projectScenes: payload.count,
        episodeScenes: payload.current_episode_scenes.length,
      })
      return payload
    },
  })

  const readExistingProps = createTool({
    id: 'read_existing_props',
    description: 'Read all props/objects already existing in this drama project (for deduplication).',
    inputSchema: z.object({}),
    execute: async () => {
      const linkedIds = new Set(
        db.select().from(schema.episodeProps)
          .where(eq(schema.episodeProps.episodeId, episodeId)).all()
          .map(link => link.propId),
      )
      const props = db.select().from(schema.props)
        .where(eq(schema.props.dramaId, dramaId)).all()
        .filter(p => !p.deletedAt)
      const payload = {
        count: props.length,
        props,
        current_episode_props: props.filter(p => linkedIds.has(p.id)),
      }
      logTaskSuccess('ExtractTool', 'read-props', {
        episodeId,
        dramaId,
        projectProps: payload.count,
        episodeProps: payload.current_episode_props.length,
      })
      return payload
    },
  })


  const saveDedupCharacters = createTool({
    id: 'save_dedup_characters',
    description: 'Save extracted characters with deduplication. Existing characters (same name) are merged/updated; new ones are created. All are linked to the current episode.',
    inputSchema: z.object({
      characters: z.array(z.object({
        name: z.string(),
        role: z.string().optional(),
        description: z.string().optional(),
        appearance: z.string().optional(),
        personality: z.string().optional(),
        sourceQuote: z.string().optional(),
        sourceSpan: z.string().optional(),
      })),
    }),
    execute: async ({ characters }) => {
      const [ep] = db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all()
      const source = String(ep?.content || '').trim()
      const script = String(ep?.scriptContent || ep?.content || '').trim()
      const structural = script
        ? reconcileStructuralExtractionToDrama(dramaId, buildStructuralExtraction(script))
        : { characters: [], scenes: [], props: [], mentions: { characters: [], scenes: [], props: [] } }
      const mergedCandidates = [...characters, ...structural.characters]
      const normalized = sanitizeCharacterCandidates(source ? filterNamedCandidatesAgainstSource(mergedCandidates, source) : mergedCandidates)
      const divertedProps = normalized.props
      logTaskProgress('ExtractTool', 'save-characters-begin', {
        episodeId,
        dramaId,
        names: normalized.characters.map(char => char.name).join(','),
        divertedProps: divertedProps.map(prop => prop.name).join(','),
      })

      const results = upsertCharacters(episodeId, dramaId, normalized.characters)
      syncEpisodeCharactersToCandidates(episodeId, dramaId, normalized.characters)
      replaceEpisodeCharacterExtractionMentions(
        episodeId,
        dramaId,
        normalized.characters,
        structural.mentions.characters,
      )

      let propsSaved = 0
      if (divertedProps.length) {
        const propStats = upsertProps(episodeId, dramaId, divertedProps)
        propsSaved = propStats.created + propStats.merged
        replaceEpisodePropExtractionMentions(
          episodeId,
          dramaId,
          divertedProps,
          structural.mentions.props,
        )
      }

      const payload = {
        message: `Personagens salvos: ${results.created} criados, ${results.merged} atualizados`,
        ...results,
        diverted_to_props: propsSaved,
      }
      logTaskSuccess('ExtractTool', 'save-characters-complete', { episodeId, ...results })
      return payload
    },
  })


  const saveDedupScenes = createTool({
    id: 'save_dedup_scenes',
    description: 'Save extracted scenes with deduplication. Existing scenes (same location+time) are reused; new ones are created. All are linked to the current episode.',
    inputSchema: z.object({
      scenes: z.array(z.object({
        location: z.string(),
        time: z.string().optional(),
        prompt: z.string().optional(),
        productionLabel: z.string().optional(),
        sourceQuote: z.string().optional(),
        sourceSpan: z.string().optional(),
      })),
    }),
    execute: async ({ scenes }) => {
      const [ep] = db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all()
      const script = String(ep?.scriptContent || ep?.content || '').trim()
      const structural = script
        ? reconcileStructuralExtractionToDrama(dramaId, buildStructuralExtraction(script))
        : { characters: [], scenes: [], props: [], mentions: { characters: [], scenes: [], props: [] } }
      const mergedScenes = [...scenes, ...structural.scenes]
      logTaskProgress('ExtractTool', 'save-scenes-begin', {
        episodeId,
        dramaId,
        scenes: mergedScenes.map(scene => `${scene.location}@${scene.time || ''}`).join(','),
      })
      const results = upsertScenes(episodeId, dramaId, mergedScenes)
      syncEpisodeScenesToCandidates(episodeId, dramaId, mergedScenes)
      replaceEpisodeSceneExtractionMentions(
        episodeId,
        dramaId,
        mergedScenes,
        structural.mentions.scenes,
      )

      const payload = {
        message: `Cenas salvas: ${results.created} criadas, ${results.reused} reaproveitadas`,
        ...results,
      }
      logTaskSuccess('ExtractTool', 'save-scenes-complete', { episodeId, ...results })
      return payload
    },
  })

  const saveDedupProps = createTool({
    id: 'save_dedup_props',
    description: 'Save extracted props/objects with deduplication. Existing props are merged; new ones are created. All are linked to the current episode.',
    inputSchema: z.object({
      props: z.array(z.object({
        name: z.string(),
        type: z.string().optional(),
        description: z.string().optional(),
        prompt: z.string().optional(),
        sourceQuote: z.string().optional(),
        sourceSpan: z.string().optional(),
      })),
    }),
    execute: async ({ props }) => {
      const [ep] = db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all()
      const script = String(ep?.scriptContent || ep?.content || '').trim()
      const structural = script
        ? reconcileStructuralExtractionToDrama(dramaId, buildStructuralExtraction(script))
        : { characters: [], scenes: [], props: [], mentions: { characters: [], scenes: [], props: [] } }
      const normalized = sanitizePropCandidates([...props, ...structural.props])
      logTaskProgress('ExtractTool', 'save-props-begin', {
        episodeId,
        dramaId,
        props: normalized.map(prop => prop.name).join(','),
      })
      const results = upsertProps(episodeId, dramaId, normalized)
      syncEpisodePropsToCandidates(episodeId, dramaId, normalized)
      replaceEpisodePropExtractionMentions(
        episodeId,
        dramaId,
        normalized,
        structural.mentions.props,
      )

      const payload = {
        message: `Objetos salvos: ${results.created} criados, ${results.merged} atualizados`,
        ...results,
      }
      logTaskSuccess('ExtractTool', 'save-props-complete', { episodeId, ...results })
      return payload
    },
  })

  return {
    readScriptForExtraction,
    readExistingCharacters,
    readExistingScenes,
    readExistingProps,
    saveDedupCharacters,
    saveDedupScenes,
    saveDedupProps,
  }
}
