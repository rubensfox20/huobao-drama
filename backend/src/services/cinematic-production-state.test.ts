import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { buildCinematicPlanFallback, buildStoryboardPackage, type CinematicBrief } from './cinematic-production-engine.js'
import {
  getCinematicProductionState,
  materializeCinematicStoryboards,
  reviewCinematicProductionStage,
  saveCinematicProductionState,
} from './cinematic-production-state.js'

const created = {
  dramas: [] as number[],
  episodes: [] as number[],
}

function timestamp() {
  return new Date().toISOString()
}

function createDramaFixture(totalEpisodes = 1) {
  const ts = timestamp()
  const dramaResult = db.insert(schema.dramas).values({
    title: `Cinematic state ${ts}`,
    totalEpisodes,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const dramaId = Number(dramaResult.lastInsertRowid)
  created.dramas.push(dramaId)

  for (let episodeNumber = 1; episodeNumber <= totalEpisodes; episodeNumber += 1) {
    const episodeResult = db.insert(schema.episodes).values({
      dramaId,
      episodeNumber,
      title: `Episodio ${episodeNumber}`,
      createdAt: ts,
      updatedAt: ts,
    }).run()
    created.episodes.push(Number(episodeResult.lastInsertRowid))
  }

  return { dramaId }
}

const brief: CinematicBrief = {
  idea: 'Uma IA holografica tenta escapar de uma Sao Paulo futurista enquanto seu criador decide se deve protege-la.',
  title: 'Avatar.Zero Test',
  genre: 'sci-fi neon',
  seasons: 1,
  episodes_per_season: 2,
  episode_duration_seconds: 120,
  ratio: '16:9',
  director_mode: 'sci-fi neon',
}

afterEach(() => {
  for (const episodeId of created.episodes.splice(0)) {
    const storyboards = db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).all()
    for (const storyboard of storyboards) {
      db.delete(schema.storyboardCharacters).where(eq(schema.storyboardCharacters.storyboardId, storyboard.id)).run()
    }
    db.delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).run()
    db.delete(schema.episodes).where(eq(schema.episodes.id, episodeId)).run()
  }
  for (const dramaId of created.dramas.splice(0)) {
    db.delete(schema.dramas).where(eq(schema.dramas.id, dramaId)).run()
  }
})

describe('cinematic production state', () => {
  it('saves production state into drama metadata and syncs episode targets', () => {
    const { dramaId } = createDramaFixture(2)
    const plan = buildCinematicPlanFallback(brief)
    const state = saveCinematicProductionState(dramaId, {
      brief,
      plan,
      selection: { parts_per_episode: 3, panels_per_part: 5 },
    })

    expect(state.state_version).toBe(1)
    expect(state.workflow.some((stage: any) => stage.key === 'visual_bible')).toBe(true)

    const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.dramaId, dramaId)).all()
    expect(episode.targetPartCount).toBe(3)
    expect(episode.targetDurationSeconds).toBe(120)
    expect(episode.promptLanguage).toBe('English')

    const loaded = getCinematicProductionState(dramaId)
    expect(loaded.plan.project.title).toBe('Avatar.Zero Test')
    expect(loaded.version_history).toHaveLength(1)
  })

  it('reviews workflow stages and unlocks the next artifact-backed step', () => {
    const { dramaId } = createDramaFixture(1)
    const plan = buildCinematicPlanFallback(brief)
    saveCinematicProductionState(dramaId, { brief, plan })

    const reviewed = reviewCinematicProductionStage(dramaId, {
      stage_key: 'briefing',
      notes: 'Aprovado para seguir.',
    })

    const briefing = reviewed.workflow.find((stage: any) => stage.key === 'briefing')
    const seasonArc = reviewed.workflow.find((stage: any) => stage.key === 'season_arc')
    expect(briefing.status).toBe('reviewed')
    expect(seasonArc.locked).toBe(false)
    expect(seasonArc.status).toBe('needs_review')
  })

  it('materializes storyboard package panels as real storyboards', () => {
    const { dramaId } = createDramaFixture(1)
    const plan = buildCinematicPlanFallback(brief)
    const storyboardPackage = buildStoryboardPackage(brief, plan, { part_count: 2, panels_per_part: 4 })
    saveCinematicProductionState(dramaId, {
      brief,
      plan,
      storyboard_package: storyboardPackage,
      selection: { parts_per_episode: 2, panels_per_part: 4 },
    })

    const result = materializeCinematicStoryboards(dramaId, { episode_number: 1 })
    expect(result.count).toBe(8)

    const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.dramaId, dramaId)).all()
    expect(episode.cinematicStatus).toBe('storyboard_ready')

    const storyboards = db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episode.id)).all()
    expect(storyboards).toHaveLength(8)
    expect(storyboards[0].partNumber).toBe(1)
    expect(storyboards[0].panelNumber).toBe(1)
    expect(storyboards[0].negativePrompt).toContain('unwanted text')
    expect(storyboards[0].qualityScore).toBeGreaterThan(0)
  })
})
