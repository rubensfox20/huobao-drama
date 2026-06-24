import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { episodeAPI, storyboardAPI } from './useApi'
import { useEpisodeWorkbench } from './useEpisodeWorkbench'

type ServiceDescriptor = {
  provider: ComputedRef<string>
  label: ComputedRef<string>
}

type UseEpisodeWorkbenchControllerInput = {
  dramaId: number
  episodeId: ComputedRef<number>
  storyboards: Ref<any[]>
  episodeMessages: Record<string, any>
  t: (path: string, params?: Record<string, string | number>) => string
  refresh: () => Promise<void>
  hasImg: (storyboard: any) => boolean
  getFirstFrame: (storyboard: any) => string | null
  getLastFrame: (storyboard: any) => string | null
  services: {
    text: ServiceDescriptor
    image: ServiceDescriptor
    video: ServiceDescriptor
    audio: ServiceDescriptor
  }
}

export function useEpisodeWorkbenchController(input: UseEpisodeWorkbenchControllerInput) {
  const workbench = useEpisodeWorkbench({
    dramaId: input.dramaId,
    episodeId: input.episodeId,
    services: input.services,
  })

  const workbenchAudioValidation = computed(() => workbench.getValidation('audio'))
  const workbenchComposeValidation = computed(() => workbench.getValidation('compose'))
  const workbenchMergeValidation = computed(() => workbench.getValidation('merge'))
  const reviewStageState = computed(() => workbench.getPipelineStageState('review'))
  const reviewStageSummary = computed(() => workbench.getPipelineStage('review'))
  const reviewPendingCount = computed(() => Number(reviewStageSummary.value?.meta?.pending || 0))
  const reviewableStoryboardCount = computed(() => Number(reviewStageSummary.value?.meta?.reviewable || reviewStageSummary.value?.total || 0))
  const isEpisodeOrchestrating = computed(() => workbench.runningJobs.value.some(job => String(job?.kind || '') === 'episode_orchestrate'))
  const canStartEpisodeOrchestration = computed(() => !!input.episodeId.value && input.storyboards.value.length > 0 && !isEpisodeOrchestrating.value)
  const workbenchNextActionLabel = computed(() => getPipelineActionLabel(workbench.pipelineStatus.value?.nextAction))
  const revealComposeValidation = ref(false)
  const revealMergeValidation = ref(false)
  const showComposeValidationBanner = computed(() => revealComposeValidation.value && workbenchComposeValidation.value.issues.length > 0)
  const showMergeValidationBanner = computed(() => revealMergeValidation.value && workbenchMergeValidation.value.issues.length > 0)

  function getWorkbenchStageState(key: string) {
    return workbench.getPipelineStageState(key)
  }

  function isWorkbenchStageDone(key: string) {
    return getWorkbenchStageState(key) === 'complete'
  }

  function isWorkbenchStageSatisfied(key: string) {
    const state = getWorkbenchStageState(key)
    return state === 'complete' || state === 'not_applicable'
  }

  function getStoryboardReviewStatus(sb: any) {
    return String(sb?.review_status || sb?.reviewStatus || 'approved').trim().toLowerCase() || 'approved'
  }

  function getReviewStatusLabel(value: any) {
    const status = typeof value === 'string' ? value : getStoryboardReviewStatus(value)
    return input.episodeMessages.workbench.reviewStatus?.[status] || input.episodeMessages.workbench.reviewStatus.approved
  }

  function getReviewStatusClass(sb: any) {
    return `is-${getStoryboardReviewStatus(sb)}`
  }

  function canReviewStoryboard(sb: any) {
    return input.hasImg(sb) || !!input.getFirstFrame(sb) || !!input.getLastFrame(sb)
  }

  function getContinuitySourceId(sb: any) {
    const raw = Number(
      sb?.continuity_source_storyboard_id
      || sb?.continuitySourceStoryboardId
      || sb?.generation_spec?.continuity?.source_storyboard_id
      || sb?.generationSpec?.continuity?.sourceStoryboardId
      || 0,
    )
    return raw > 0 ? raw : null
  }

  function getContinuitySourceLabel(sb: any) {
    const sourceId = getContinuitySourceId(sb)
    if (!sourceId) return ''
    const source = input.storyboards.value.find(item => Number(item?.id || 0) === sourceId)
    const number = Number(source?.storyboard_number || source?.storyboardNumber || source?.id || 0)
    if (!number) return ''
    return input.t('episode.workbench.continuityFrom', { number: String(number).padStart(2, '0') })
  }

  function getReviewStageLabel(state: string) {
    return input.episodeMessages.workbench.orchestrator.states?.[state] || input.episodeMessages.workbench.orchestrator.states.not_started
  }

  function getPipelineActionLabel(action: any) {
    const key = String(action?.key || '').trim().toLowerCase()
    if (!key) return ''

    const labels: Record<string, string> = {
      raw_content: input.episodeMessages.script.raw.step,
      rewritten_script: input.episodeMessages.script.rewrite.step,
      entities: input.episodeMessages.script.extract.step,
      storyboards: input.episodeMessages.script.storyboard.step,
      voice_assignment: input.episodeMessages.script.voice.step,
      dubbing: input.episodeMessages.production.tabs.dubbing,
      audio_assets: input.episodeMessages.production.tabs.audio,
      character_visuals: input.episodeMessages.production.tabs.chars,
      scene_visuals: input.episodeMessages.production.tabs.scenes,
      storyboard_frames: input.episodeMessages.production.tabs.shots,
      visual_assets: input.episodeMessages.production.tabs.shots,
      review: input.episodeMessages.workbench.stages.review,
      videos: input.episodeMessages.production.tabs.videos,
      composition: input.episodeMessages.production.tabs.compose,
      merge: input.episodeMessages.export.stage,
    }

    return labels[key] || String(action?.label || '').trim()
  }

  async function updateStoryboardReviewStatus(sb: any, status: 'approved' | 'changes_requested') {
    if (!canReviewStoryboard(sb)) {
      toast.warning(input.episodeMessages.toasts.reviewRequiresVisual)
      return
    }

    await storyboardAPI.update(sb.id, { review_status: status })
    toast.success(status === 'approved'
      ? input.episodeMessages.toasts.reviewApproved
      : input.episodeMessages.toasts.reviewChangesRequested)
    await input.refresh()
  }

  async function approveStoryboardReview(sb: any) {
    return updateStoryboardReviewStatus(sb, 'approved')
  }

  async function requestStoryboardChanges(sb: any) {
    return updateStoryboardReviewStatus(sb, 'changes_requested')
  }

  async function startEpisodeOrchestration(target: 'storyboard_review' | 'publish_ready') {
    if (!input.episodeId.value || !input.storyboards.value.length) {
      toast.warning(input.episodeMessages.toasts.orchestrateMissingStoryboards)
      return
    }

    try {
      await episodeAPI.orchestrate(input.episodeId.value, { target })
      toast.success(target === 'storyboard_review'
        ? input.episodeMessages.toasts.orchestrateReviewStarted
        : input.episodeMessages.toasts.orchestrateExportStarted)
      await workbench.refreshWorkbenchTelemetry()
    } catch (error: any) {
      toast.error(error?.message || input.episodeMessages.toasts.orchestrateMissingStoryboards)
    }
  }

  watch(workbenchComposeValidation, (value) => {
    if (!value?.issues?.length) revealComposeValidation.value = false
  }, { deep: true })

  watch(workbenchMergeValidation, (value) => {
    if (!value?.issues?.length) revealMergeValidation.value = false
  }, { deep: true })

  watch(isEpisodeOrchestrating, (running, wasRunning) => {
    if (wasRunning && !running) {
      void input.refresh()
    }
  })

  return {
    workbench,
    workbenchAudioValidation,
    workbenchComposeValidation,
    workbenchMergeValidation,
    reviewStageState,
    reviewPendingCount,
    reviewableStoryboardCount,
    isEpisodeOrchestrating,
    canStartEpisodeOrchestration,
    workbenchNextActionLabel,
    revealComposeValidation,
    revealMergeValidation,
    showComposeValidationBanner,
    showMergeValidationBanner,
    isWorkbenchStageDone,
    isWorkbenchStageSatisfied,
    getReviewStatusLabel,
    getReviewStatusClass,
    canReviewStoryboard,
    getContinuitySourceLabel,
    getReviewStageLabel,
    approveStoryboardReview,
    requestStoryboardChanges,
    startEpisodeOrchestration,
  }
}
