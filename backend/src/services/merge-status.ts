import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'

function toTimestamp(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function isEpisodeMergeStale(episodeId: number, merge: {
  id?: number | null
  status?: string | null
  completedAt?: string | null
  createdAt?: string | null
}) {
  if (!merge || String(merge.status || '') !== 'completed') return false

  const mergeTs = Math.max(
    toTimestamp(merge.completedAt),
    toTimestamp(merge.createdAt),
  )
  if (!mergeTs) return false

  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()

  return storyboards.some((storyboard) => {
    if (!storyboard.composedVideoUrl) return false
    return toTimestamp(storyboard.updatedAt) > mergeTs
  })
}

export function getLatestMergeForEpisode(episodeId: number) {
  const latest = db.select()
    .from(schema.videoMerges)
    .where(eq(schema.videoMerges.episodeId, episodeId))
    .orderBy(desc(schema.videoMerges.id))
    .all()[0]

  if (!latest) return null
  if (!isEpisodeMergeStale(episodeId, latest)) return latest

  return {
    ...latest,
    status: 'stale',
  }
}

export function isDramaMergeStale(dramaId: number, merge: {
  id?: number | null
  status?: string | null
  completedAt?: string | null
  createdAt?: string | null
}) {
  if (!merge || String(merge.status || '') !== 'completed') return false

  const mergeTs = Math.max(
    toTimestamp(merge.completedAt),
    toTimestamp(merge.createdAt),
  )
  if (!mergeTs) return false

  const readyEpisodes = db.select().from(schema.episodes)
    .where(eq(schema.episodes.dramaId, dramaId))
    .all()
    .filter((episode) => !episode.deletedAt && !!episode.videoUrl)

  return readyEpisodes.some((episode) => toTimestamp(episode.updatedAt) > mergeTs)
}

export function getLatestMergeForDrama(dramaId: number) {
  const latest = db.select()
    .from(schema.videoMerges)
    .where(and(
      eq(schema.videoMerges.dramaId, dramaId),
      isNull(schema.videoMerges.episodeId),
    ))
    .orderBy(desc(schema.videoMerges.id))
    .all()[0]

  if (!latest) return null
  if (!isDramaMergeStale(dramaId, latest)) return latest

  return {
    ...latest,
    status: 'stale',
  }
}

export function invalidateDramaMerges(dramaId: number) {
  const activeMergeIds = db.select()
    .from(schema.videoMerges)
    .where(and(
      eq(schema.videoMerges.dramaId, dramaId),
      isNull(schema.videoMerges.episodeId),
    ))
    .all()
    .filter((merge) => String(merge.status || '') === 'completed' || String(merge.status || '') === 'processing')
    .map((merge) => merge.id)

  for (const mergeId of activeMergeIds) {
    db.update(schema.videoMerges)
      .set({ status: 'stale' })
      .where(eq(schema.videoMerges.id, mergeId))
      .run()
  }
}

export function invalidateEpisodeMerges(episodeId: number) {
  const [episode] = db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, episodeId))
    .all()

  const activeMergeIds = db.select()
    .from(schema.videoMerges)
    .where(eq(schema.videoMerges.episodeId, episodeId))
    .all()
    .filter((merge) => String(merge.status || '') === 'completed' || String(merge.status || '') === 'processing')
    .map((merge) => merge.id)

  if (activeMergeIds.length) {
    for (const mergeId of activeMergeIds) {
      db.update(schema.videoMerges)
        .set({ status: 'stale' })
        .where(eq(schema.videoMerges.id, mergeId))
        .run()
    }
  }

  db.update(schema.episodes)
    .set({ videoUrl: null, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  if (episode?.dramaId != null) invalidateDramaMerges(Number(episode.dramaId))
}
