import { computed, type ComputedRef, type Ref } from 'vue'
import type {
  CanonicalPipelineState,
  EpisodePipelineStatus,
  PipelineStageStatus,
  PipelineStageSummary,
} from '~/types/api'

export type EpisodeProductionStepId =
  | 'chars'
  | 'scenes'
  | 'dubbing'
  | 'audio'
  | 'shots'
  | 'videos'
  | 'compose'

type CountSource = {
  count: ComputedRef<number>
  total: ComputedRef<number>
}

type UseEpisodeProductionStatusInput = {
  pipelineStatus: Ref<EpisodePipelineStatus | null>
  storyboardTotal: ComputedRef<number>
  counts: Record<EpisodeProductionStepId, CountSource>
}

export type EpisodeProductionStepStatus = {
  id: EpisodeProductionStepId
  stageKey: string
  loaded: boolean
  state: CanonicalPipelineState
  status: PipelineStageStatus
  count: number
  total: number
  done: boolean
  partial: boolean
  satisfied: boolean
  blocked: boolean
  notApplicable: boolean
  badge: string
  className: string
  issues: PipelineStageSummary['issues']
}

const STAGE_KEY_BY_STEP: Record<EpisodeProductionStepId, string> = {
  chars: 'character_visuals',
  scenes: 'scene_visuals',
  dubbing: 'dubbing',
  audio: 'audio_assets',
  shots: 'storyboard_frames',
  videos: 'videos',
  compose: 'composition',
}

const STEP_IDS: EpisodeProductionStepId[] = ['chars', 'scenes', 'dubbing', 'audio', 'shots', 'videos', 'compose']

function statusFromState(state: CanonicalPipelineState): PipelineStageStatus {
  if (state === 'complete') return 'done'
  if (state === 'in_progress' || state === 'needs_review') return 'partial'
  if (state === 'blocked') return 'blocked'
  if (state === 'not_applicable') return 'not_applicable'
  return 'pending'
}

function stateFromCount(count: number, total: number): CanonicalPipelineState {
  if (total <= 0) return 'not_started'
  if (count <= 0) return 'not_started'
  if (count >= total) return 'complete'
  return 'in_progress'
}

function normalizeCount(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0
}

function normalizeStage(
  id: EpisodeProductionStepId,
  stage: PipelineStageSummary | null,
  loaded: boolean,
  fallbackCount: number,
  fallbackTotal: number,
  storyboardTotal: number,
): EpisodeProductionStepStatus {
  const stageKey = STAGE_KEY_BY_STEP[id]
  const count = normalizeCount(stage?.count ?? fallbackCount)
  const total = normalizeCount(stage?.total ?? fallbackTotal)

  let state: CanonicalPipelineState = 'not_started'
  if (!loaded) {
    state = 'not_started'
  } else if (stage?.state) {
    state = stage.state
  } else if (id === 'dubbing' && storyboardTotal > 0 && total <= 0) {
    state = 'not_applicable'
  } else {
    state = stateFromCount(count, total)
  }

  const status = stage?.status || statusFromState(state)
  const blocked = state === 'blocked' || status === 'blocked' || !!stage?.blocked
  const notApplicable = state === 'not_applicable' || status === 'not_applicable'
  const done = state === 'complete' && total > 0 && count >= total
  const partial = !done && !notApplicable && !blocked && (
    state === 'in_progress'
    || state === 'needs_review'
    || status === 'partial'
    || status === 'ready'
    || status === 'running'
  )

  return {
    id,
    stageKey,
    loaded,
    state,
    status,
    count,
    total,
    done,
    partial,
    satisfied: done || notApplicable,
    blocked,
    notApplicable,
    badge: loaded && total > 0 ? `${count}/${total}` : '',
    className: blocked
      ? 'is-blocked'
      : done
        ? 'is-complete'
        : partial
          ? 'is-partial'
          : notApplicable
            ? 'is-not-applicable'
            : 'is-pending',
    issues: stage?.issues || [],
  }
}

export function useEpisodeProductionStatus(input: UseEpisodeProductionStatusInput) {
  const productionStepStatuses = computed<Record<EpisodeProductionStepId, EpisodeProductionStepStatus>>(() => {
    const pipeline = input.pipelineStatus.value
    const loaded = !!pipeline

    return STEP_IDS.reduce((acc, id) => {
      const stageKey = STAGE_KEY_BY_STEP[id]
      const counts = input.counts[id]
      acc[id] = normalizeStage(
        id,
        pipeline?.stages?.[stageKey] || null,
        loaded,
        counts.count.value,
        counts.total.value,
        input.storyboardTotal.value,
      )
      return acc
    }, {} as Record<EpisodeProductionStepId, EpisodeProductionStepStatus>)
  })

  const getProductionStepStatus = (id: string) => {
    return productionStepStatuses.value[id as EpisodeProductionStepId] || null
  }

  const prodStepDone = (id: string) => !!getProductionStepStatus(id)?.done
  const prodStepPartial = (id: string) => !!getProductionStepStatus(id)?.partial
  const prodStepSatisfied = (id: string) => !!getProductionStepStatus(id)?.satisfied
  const prodStepBlocked = (id: string) => !!getProductionStepStatus(id)?.blocked
  const prodStepNotApplicable = (id: string) => !!getProductionStepStatus(id)?.notApplicable
  const prodStepBadge = (id: string) => getProductionStepStatus(id)?.badge || ''
  const prodStepStatusClass = (id: string) => getProductionStepStatus(id)?.className || 'is-pending'

  return {
    productionStepStatuses,
    getProductionStepStatus,
    prodStepDone,
    prodStepPartial,
    prodStepSatisfied,
    prodStepBlocked,
    prodStepNotApplicable,
    prodStepBadge,
    prodStepStatusClass,
  }
}
