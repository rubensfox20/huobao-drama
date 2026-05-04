
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'
import { logTaskProgress, logTaskSuccess } from '../../utils/task-logger.js'
import { getBuiltinVoices } from '../../services/voice-catalog.js'
import { getActiveConfig } from '../../services/ai.js'
import { describeVoiceGender, inferVoiceGender } from '../../services/voice-selection.js'
import { invalidateCharacterVoiceOutputs } from '../../services/voice-invalidation.js'

export function createVoiceTools(episodeId: number, dramaId: number) {
  function getEpisodeAudioProvider() {
    const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
    if (!episode?.audioConfigId) return null
    const [config] = db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, episode.audioConfigId)).all()
    return config?.provider || null
  }

  function getPreferredAudioProvider() {
    return getEpisodeAudioProvider() || getActiveConfig('audio')?.provider || 'minimax'
  }

  const getCharacters = createTool({
    id: 'get_characters',
    description: 'Get all characters for the current drama with their current voice assignments.',
    inputSchema: z.object({}),
    execute: async () => {
      const linkedIds = new Set(
        db.select().from(schema.episodeCharacters)
          .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
          .map(link => link.characterId),
      )
      const chars = db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, dramaId)).all()
        .filter(char => !char.deletedAt && linkedIds.has(char.id))
      const payload = {
        characters: chars.map(c => ({
          id: c.id,
          name: c.name,
          role: c.role,
          personality: c.personality,
          description: c.description,
          current_voice: c.voiceStyle || 'Não atribuído',
        })),
      }
      logTaskSuccess('VoiceTool', 'get-characters', { episodeId, dramaId, count: payload.characters.length })
      return payload
    },
  })

  const listVoices = createTool({
    id: 'list_voices',
    description: 'List all available voice options for TTS.',
    inputSchema: z.object({}),
    execute: async () => {
      const provider = getPreferredAudioProvider()
      const rows = db.select().from(schema.aiVoices).where(eq(schema.aiVoices.provider, provider)).all()
      const builtinRows = getBuiltinVoices(provider)
      const sourceRows = rows.length ? rows.map(v => ({
        voice_id: v.voiceId,
        voice_name: v.voiceName,
        description: v.description ? JSON.parse(v.description) : [],
        language: v.language,
        provider,
      })) : builtinRows

      const voices = sourceRows.length ? sourceRows.map(v => {
        const desc = Array.isArray(v.description) ? v.description : []
        return {
          id: v.voice_id,
          name: v.voice_name,
          gender: describeVoiceGender(inferVoiceGender({
            id: v.voice_id,
            name: v.voice_name,
            description: desc,
            language: v.language,
            provider,
            gender: (v as any).gender,
          })),
          traits: Array.isArray(desc) && desc.length ? desc.slice(0, 2).join(', ') : `Voice in ${v.language || 'multiple languages'}`,
          suitable_for: Array.isArray(desc) && desc.length > 2 ? desc.slice(2).join(', ') : `${v.language || 'General'} (Character)`,
          language: v.language,
          provider,
        }
      }) : [
        { id: 'alloy', name: 'Alloy', gender: 'Neutro', traits: 'Equilibrado e natural', suitable_for: 'Narrador, geral', language: 'Multilíngue', provider },
        { id: 'echo', name: 'Echo', gender: 'Masculino', traits: 'Grave e constante', suitable_for: 'Homem maduro, narrador', language: 'Multilíngue', provider },
        { id: 'fable', name: 'Fable', gender: 'Masculino', traits: 'Quente e expressivo', suitable_for: 'Jovem masculino, narração', language: 'Multilíngue', provider },
        { id: 'onyx', name: 'Onyx', gender: 'Masculino', traits: 'Grave e poderoso', suitable_for: 'Autoritário, vilão', language: 'Multilíngue', provider },
        { id: 'nova', name: 'Nova', gender: 'Feminino', traits: 'Suave e doce', suitable_for: 'Jovem feminina, protagonista', language: 'Multilíngue', provider },
        { id: 'shimmer', name: 'Shimmer', gender: 'Feminino', traits: 'Brilhante e viva', suitable_for: 'Mulher viva, garota jovem', language: 'Multilíngue', provider },
      ]

      const payload = {
        provider,
        voices,
        instruction: 'Choose the most appropriate voice based on gender presentation, apparent age, personality, and dramatic role. Use only voices available from the active audio provider for this episode.',
      }
      logTaskSuccess('VoiceTool', 'list-voices', { episodeId, provider, count: payload.voices.length })
      return payload
    },
  })

  const assignVoice = createTool({
    id: 'assign_voice',
    description: 'Assign a voice to a character.',
    inputSchema: z.object({
      character_id: z.number().describe('Character ID'),
      voice_id: z.string().describe('Voice ID from list_voices'),
      reason: z.string().optional().describe('Why this voice fits'),
    }),
    execute: async ({ character_id, voice_id, reason }) => {
      const provider = getPreferredAudioProvider()
      logTaskProgress('VoiceTool', 'assign-begin', { episodeId, dramaId, characterId: character_id, voiceId: voice_id, provider, reason })
      db.update(schema.characters)
        .set({ voiceStyle: voice_id, voiceProvider: provider, voiceSampleUrl: null, updatedAt: now() })
        .where(eq(schema.characters.id, character_id))
        .run()
      invalidateCharacterVoiceOutputs(character_id)
      logTaskSuccess('VoiceTool', 'assign-complete', { episodeId, characterId: character_id, voiceId: voice_id, provider })
      return { message: `Assigned voice "${voice_id}" to character ${character_id}`, reason }
    },
  })

  return { getCharacters, listVoices, assignVoice }
}
