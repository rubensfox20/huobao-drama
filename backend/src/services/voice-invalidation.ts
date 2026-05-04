import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { invalidateEpisodeMerges } from './merge-status.js'

export function invalidateCharacterVoiceOutputs(characterId: number) {
  const storyboardIds = db.select()
    .from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.characterId, characterId))
    .all()
    .map(link => link.storyboardId)

  if (!storyboardIds.length) {
    return { storyboardIds: [], cleared: 0 }
  }

  const linkedStoryboards = db.select()
    .from(schema.storyboards)
    .where(inArray(schema.storyboards.id, storyboardIds))
    .all()

  const affectedIds = linkedStoryboards
    .filter(storyboard => String(storyboard.dialogue || '').trim())
    .map(storyboard => storyboard.id)

  const episodeIds = [...new Set(linkedStoryboards.map((storyboard) => storyboard.episodeId).filter(Boolean))]

  if (!affectedIds.length) {
    for (const episodeId of episodeIds) {
      invalidateEpisodeMerges(Number(episodeId))
    }
    return { storyboardIds, cleared: 0 }
  }

  db.update(schema.storyboards)
    .set({
      ttsAudioUrl: null,
      subtitleUrl: null,
      composedVideoUrl: null,
      updatedAt: now(),
    })
    .where(inArray(schema.storyboards.id, affectedIds))
    .run()

  for (const episodeId of episodeIds) {
    invalidateEpisodeMerges(Number(episodeId))
  }

  return { storyboardIds: affectedIds, cleared: affectedIds.length }
}
