import crypto from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { saveEpisodeStoryboards, type StoryboardDraftInput } from './storyboard-persistence.js'

const CINEMATIC_METADATA_KEY = 'cinematic_production'

const WORKFLOW_STAGES = [
  { key: 'briefing', label: 'Briefing' },
  { key: 'season_arc', label: 'Arco' },
  { key: 'visual_bible', label: 'Biblia visual' },
  { key: 'design_sheet', label: 'Design sheet' },
  { key: 'script', label: 'Roteiro' },
  { key: 'parts', label: 'Partes' },
  { key: 'storyboard', label: 'Storyboard' },
  { key: 'final_prompts', label: 'Prompts finais' },
  { key: 'export', label: 'Exportacao' },
] as const

type WorkflowStageKey = typeof WORKFLOW_STAGES[number]['key']

type CinematicProductionStateInput = {
  brief?: any
  plan?: any
  design_sheet?: any
  storyboard_package?: any
  improvements?: any
  quality_preview?: any
  selection?: any
  generation_queue?: any[]
  model?: string
}

function parseJsonObject(value: unknown) {
  if (!value || typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function stableHash(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16)
}

function compactHistory(history: unknown, nextEntry: Record<string, unknown>) {
  const rows = Array.isArray(history) ? history : []
  return [...rows.slice(-19), nextEntry]
}

function hasArtifact(state: any, key: WorkflowStageKey) {
  if (key === 'briefing') return Boolean(state.brief?.idea || state.plan?.project)
  if (key === 'season_arc') return Boolean(state.plan?.season_arc)
  if (key === 'visual_bible') return Boolean(state.plan?.visual_bible)
  if (key === 'design_sheet') return Boolean(state.design_sheet?.prompt)
  if (key === 'script') return true
  if (key === 'parts') return Boolean(state.storyboard_package?.parts?.length)
  if (key === 'storyboard') return Boolean(state.materialized_storyboards?.count || state.storyboard_package?.parts?.length)
  if (key === 'final_prompts') return Boolean(state.storyboard_package?.parts?.some((part: any) => part?.panels?.some((panel: any) => panel?.image_prompt)))
  if (key === 'export') return Boolean(state.exports?.last_exported_at)
  return false
}

export function buildCinematicWorkflow(state: any) {
  const approvals = state?.approvals && typeof state.approvals === 'object' ? state.approvals : {}
  let previousReviewed = true

  return WORKFLOW_STAGES.map((stage) => {
    const artifactReady = hasArtifact(state, stage.key)
    const approval = approvals[stage.key] || null
    const reviewed = approval?.status === 'reviewed'
    const locked = !previousReviewed || !artifactReady
    const status = reviewed
      ? 'reviewed'
      : locked
        ? 'locked'
        : 'needs_review'

    previousReviewed = previousReviewed && reviewed

    return {
      key: stage.key,
      label: stage.label,
      status,
      locked,
      artifact_ready: artifactReady,
      reviewed,
      reviewed_at: approval?.reviewed_at || null,
      notes: approval?.notes || '',
    }
  })
}

function getDramaOrThrow(dramaId: number) {
  const [drama] = db.select().from(schema.dramas)
    .where(and(eq(schema.dramas.id, dramaId), isNull(schema.dramas.deletedAt)))
    .all()
  if (!drama) throw new Error('Drama nao encontrado')
  return drama
}

function getCinematicStateFromMetadata(metadata: any) {
  const state = metadata[CINEMATIC_METADATA_KEY]
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {}
}

function updateDramaMetadata(dramaId: number, nextMetadata: Record<string, unknown>) {
  db.update(schema.dramas)
    .set({
      metadata: JSON.stringify(nextMetadata),
      updatedAt: now(),
    })
    .where(eq(schema.dramas.id, dramaId))
    .run()
}

function syncEpisodeCinematicTargets(dramaId: number, state: any) {
  const brief = state.brief || {}
  const selection = state.selection || {}
  const episodesPerSeason = Math.max(1, Number(brief.episodes_per_season || state.plan?.project?.episodes_per_season || 1) || 1)
  const targetDuration = Number(brief.episode_duration_seconds || state.plan?.project?.episode_duration_seconds || 0) || null
  const partCount = Number(selection.parts_per_episode || selection.part_count || state.plan?.recommendations?.selected?.part_count || 0) || null
  const promptLanguage = String(brief.prompt_language || state.plan?.engine?.prompt_language || '').trim() || null
  const scriptLanguage = String(brief.script_language || state.plan?.engine?.script_language || '').trim() || null
  const episodes = db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    .all()

  for (const episode of episodes) {
    const episodeNumber = Number(episode.episodeNumber || 1)
    db.update(schema.episodes)
      .set({
        seasonNumber: Math.floor((episodeNumber - 1) / episodesPerSeason) + 1,
        episodeInSeason: ((episodeNumber - 1) % episodesPerSeason) + 1,
        targetDurationSeconds: targetDuration,
        targetPartCount: partCount,
        promptLanguage,
        scriptLanguage,
        cinematicStatus: episode.cinematicStatus || 'planning',
        updatedAt: now(),
      })
      .where(eq(schema.episodes.id, episode.id))
      .run()
  }
}

export function getCinematicProductionState(dramaId: number) {
  const drama = getDramaOrThrow(dramaId)
  const metadata = parseJsonObject(drama.metadata)
  const state = getCinematicStateFromMetadata(metadata)
  return {
    ...state,
    drama_id: dramaId,
    workflow: buildCinematicWorkflow(state),
  }
}

export function saveCinematicProductionState(dramaId: number, input: CinematicProductionStateInput) {
  const drama = getDramaOrThrow(dramaId)
  const metadata = parseJsonObject(drama.metadata)
  const existing = getCinematicStateFromMetadata(metadata)
  const ts = now()
  const stateVersion = Number(existing.state_version || 0) + 1
  const nextState: any = {
    ...existing,
    state_version: stateVersion,
    status: existing.status || 'planning',
    brief: input.brief ?? existing.brief ?? null,
    plan: input.plan ?? existing.plan ?? null,
    design_sheet: input.design_sheet ?? existing.design_sheet ?? null,
    storyboard_package: input.storyboard_package ?? existing.storyboard_package ?? null,
    improvements: input.improvements ?? existing.improvements ?? null,
    quality_preview: input.quality_preview ?? existing.quality_preview ?? null,
    selection: input.selection ?? existing.selection ?? null,
    generation_queue: input.generation_queue ?? input.plan?.generation_queue ?? existing.generation_queue ?? [],
    approvals: existing.approvals || {},
    saved_at: ts,
    version_history: compactHistory(existing.version_history, {
      version: stateVersion,
      kind: 'state_saved',
      at: ts,
      model: input.model || input.plan?.engine?.recommended_text_model || 'gpt-5.5',
      hash: stableHash({
        brief: input.brief,
        plan: input.plan,
        storyboard_package: input.storyboard_package,
        selection: input.selection,
      }),
    }),
  }
  nextState.workflow = buildCinematicWorkflow(nextState)
  metadata[CINEMATIC_METADATA_KEY] = nextState

  updateDramaMetadata(dramaId, metadata)
  syncEpisodeCinematicTargets(dramaId, nextState)

  return {
    ...nextState,
    drama_id: dramaId,
  }
}

export function reviewCinematicProductionStage(dramaId: number, input: {
  stage_key: WorkflowStageKey
  status?: 'reviewed' | 'needs_review'
  notes?: string
}) {
  const drama = getDramaOrThrow(dramaId)
  const metadata = parseJsonObject(drama.metadata)
  const existing = getCinematicStateFromMetadata(metadata)
  const stageExists = WORKFLOW_STAGES.some(stage => stage.key === input.stage_key)
  if (!stageExists) throw new Error('Etapa cinematografica invalida')

  const approvals = existing.approvals && typeof existing.approvals === 'object' ? existing.approvals : {}
  const ts = now()
  const nextState: any = {
    ...existing,
    approvals: {
      ...approvals,
      [input.stage_key]: {
        status: input.status || 'reviewed',
        reviewed_at: ts,
        notes: String(input.notes || '').trim(),
      },
    },
    saved_at: ts,
    version_history: compactHistory(existing.version_history, {
      version: Number(existing.state_version || 0),
      kind: 'stage_reviewed',
      stage_key: input.stage_key,
      at: ts,
    }),
  }
  nextState.workflow = buildCinematicWorkflow(nextState)
  metadata[CINEMATIC_METADATA_KEY] = nextState
  updateDramaMetadata(dramaId, metadata)
  return {
    ...nextState,
    drama_id: dramaId,
  }
}

function panelToStoryboardDraft(panel: any, part: any): StoryboardDraftInput {
  const timecode = panel?.timecode || {}
  const promptLayers = panel?.prompt_layers || {}
  const durationSeconds = Math.max(3, Number(timecode.end_seconds || 0) - Number(timecode.start_seconds || 0) || 6)
  return {
    storyboardNumber: Number(panel?.global_panel_number || panel?.panel_number || 1),
    part_number: Number(part?.part_number || 1),
    panel_number: Number(panel?.panel_number || 1),
    time_start_ms: Math.max(0, Number(timecode.start_seconds || 0) * 1000),
    time_end_ms: Math.max(0, Number(timecode.end_seconds || 0) * 1000),
    panel_caption: panel?.caption || '',
    scene_speed: panel?.rhythm || part?.rhythm || '',
    title: `${part?.title || 'Parte'} / Painel ${panel?.panel_number || 1}`,
    shot_type: String(promptLayers.camera || ''),
    action: String(promptLayers.action || panel?.caption || ''),
    description: panel?.caption || part?.summary || '',
    image_prompt: panel?.image_prompt || '',
    video_prompt: panel?.video_prompt || '',
    negative_prompt: panel?.negative_prompt || '',
    prompt_layers: promptLayers,
    model_adapters: panel?.model_adapters || [],
    quality_score: Number(panel?.quality?.score || panel?.quality_score || 0) || null,
    reproducibility: {
      source: 'story_studio_cinematic_package',
      version: panel?.versions || {},
      quality: panel?.quality || null,
      validation: panel?.validation || null,
      saved_at: now(),
    },
    duration: durationSeconds,
  }
}

export function materializeCinematicStoryboards(dramaId: number, input: {
  episode_id?: number
  episode_number?: number
  storyboard_package?: any
  part_numbers?: number[]
}) {
  const state = getCinematicProductionState(dramaId)
  const storyboardPackage = input.storyboard_package || state.storyboard_package
  if (!storyboardPackage?.parts?.length) throw new Error('Pacote de storyboard nao encontrado')

  const episodes = db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    .all()
  const episode = input.episode_id
    ? episodes.find(item => item.id === Number(input.episode_id))
    : input.episode_number
      ? episodes.find(item => item.episodeNumber === Number(input.episode_number))
      : episodes[0]
  if (!episode) throw new Error('Episodio nao encontrado para materializar storyboard')

  const allowedParts = new Set((input.part_numbers || []).map(Number).filter(Boolean))
  const parts = allowedParts.size
    ? storyboardPackage.parts.filter((part: any) => allowedParts.has(Number(part.part_number)))
    : storyboardPackage.parts
  const drafts = parts.flatMap((part: any) =>
    (part.panels || []).map((panel: any) => panelToStoryboardDraft(panel, part)),
  )
  if (!drafts.length) throw new Error('Nenhum painel encontrado para materializar')

  const result = saveEpisodeStoryboards(episode.id, dramaId, drafts)
  db.update(schema.episodes)
    .set({
      cinematicStatus: 'storyboard_ready',
      targetPartCount: Number(storyboardPackage.part_count || parts.length || episode.targetPartCount || 0) || null,
      updatedAt: now(),
    })
    .where(eq(schema.episodes.id, episode.id))
    .run()

  const drama = getDramaOrThrow(dramaId)
  const metadata = parseJsonObject(drama.metadata)
  const existing = getCinematicStateFromMetadata(metadata)
  const nextState: any = {
    ...existing,
    materialized_storyboards: {
      episode_id: episode.id,
      episode_number: episode.episodeNumber,
      count: result.count,
      total_duration_seconds: result.totalDuration,
      part_numbers: parts.map((part: any) => Number(part.part_number)),
      materialized_at: now(),
    },
    saved_at: now(),
  }
  nextState.workflow = buildCinematicWorkflow(nextState)
  metadata[CINEMATIC_METADATA_KEY] = nextState
  updateDramaMetadata(dramaId, metadata)

  return {
    episode_id: episode.id,
    episode_number: episode.episodeNumber,
    count: result.count,
    total_duration_seconds: result.totalDuration,
    workflow: nextState.workflow,
  }
}
