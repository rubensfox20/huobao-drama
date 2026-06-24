import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type ComputedRef } from 'vue'
import { episodeAPI, healthAPI, providerAvailabilityAPI, workflowJobsAPI } from './useApi'
import type { CanonicalPipelineState, EpisodePipelineStatus } from '~/types/api'

type ServiceKey = 'text' | 'image' | 'video' | 'audio'
type ValidationStage = 'script' | 'audio' | 'compose' | 'merge'

type ServiceConfigInput = {
  provider: ComputedRef<string>
  label: ComputedRef<string>
}

type UseEpisodeWorkbenchInput = {
  dramaId: number
  episodeId: ComputedRef<number>
  services: Record<ServiceKey, ServiceConfigInput>
}

type ValidationPayload = {
  stage: ValidationStage
  blocked: boolean
  issues: Array<{
    code: string
    severity: 'info' | 'warning' | 'error'
    message: string
    entity_type?: string
    entity_id?: number | null
  }>
}

const RUNNING_POLL_INTERVAL_MS = 5000
const QUEUED_POLL_INTERVAL_MS = 9000
const ACTIVE_JOB_STATUSES = new Set(['queued', 'running'])

const JOB_KIND_BY_SERVICE: Record<ServiceKey, string[]> = {
  text: ['script_rewriter', 'extractor', 'voice_assigner', 'storyboard_breaker', 'grid_prompt_generator'],
  image: ['image_generate'],
  video: ['video_generate'],
  audio: ['voice_sample_generate', 'tts_generate'],
}

const PIPELINE_JOB_DEFINITIONS = [
  { key: 'script_rewrite', kinds: ['script_rewriter'], kind: 'script_rewriter' },
  { key: 'extractor', kinds: ['extractor'], kind: 'extractor' },
  { key: 'assign_voices', kinds: ['voice_assigner'], kind: 'voice_assigner' },
  { key: 'generate_voice_samples', kinds: ['voice_sample_generate', 'tts_generate'], kind: 'voice_sample_generate' },
  { key: 'extract_storyboards', kinds: ['storyboard_breaker'], kind: 'storyboard_breaker' },
  { key: 'generate_images', kinds: ['image_generate'], kind: 'image_generate' },
  { key: 'generate_videos', kinds: ['video_generate'], kind: 'video_generate' },
  { key: 'compose_shots', kinds: ['compose_episode', 'compose_storyboard'], kind: 'compose_episode' },
  { key: 'merge_episode', kinds: ['merge_episode'], kind: 'merge_episode' },
] as const

function emptyValidation(stage: ValidationStage): ValidationPayload {
  return { stage, blocked: false, issues: [] }
}

function safeArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

export function useEpisodeWorkbench(input: UseEpisodeWorkbenchInput) {
  const workflowJobs = ref<any[]>([])
  const pipelineStatus = ref<EpisodePipelineStatus | null>(null)
  const loading = reactive({
    jobs: false,
    validation: false,
    availability: false,
    pipeline: false,
  })
  const providerSnapshots = ref<Record<string, any>>({})
  const backendReachable = ref(true)
  const validations = reactive<Record<ValidationStage, ValidationPayload>>({
    script: emptyValidation('script'),
    audio: emptyValidation('audio'),
    compose: emptyValidation('compose'),
    merge: emptyValidation('merge'),
  })
  const lastSyncedAt = ref('')
  let pollHandle: ReturnType<typeof setTimeout> | null = null

  const runningJobs = computed(() => workflowJobs.value.filter(job => ACTIVE_JOB_STATUSES.has(normalizeJobStatus(job?.status))))
  const failedJobs = computed(() => workflowJobs.value.filter(job => String(job?.status || '') === 'failed').slice(0, 5))
  const pipelineJobs = computed(() => {
    const steps = pipelineStatus.value?.steps || {}

    return PIPELINE_JOB_DEFINITIONS
      .map((definition, index) => {
        const step = resolvePipelineStep(definition.key, steps)
        const inferredStatus = step ? mapPipelineStepToJobStatus(step.status) : ''
        const jobsForStep = workflowJobs.value
          .filter(job => definition.kinds.includes(String(job?.kind || '')))
          .sort(compareJobRecency)

        const activeJob = jobsForStep.find(job => ACTIVE_JOB_STATUSES.has(normalizeJobStatus(job?.status)))
        const failedJob = jobsForStep.find(job => normalizeJobStatus(job?.status) === 'failed')
        const latestJob = jobsForStep[0]

        if (activeJob) {
          return withPipelineMeta(activeJob, definition.key, index)
        }

        if (inferredStatus && inferredStatus !== 'completed') {
          if (failedJob) return withPipelineMeta(failedJob, definition.key, index)
          return buildInferredJob(definition.key, definition.kind, step, inferredStatus, index)
        }

        if (latestJob) {
          return withPipelineMeta(latestJob, definition.key, index)
        }

        if (step && inferredStatus) {
          return buildInferredJob(definition.key, definition.kind, step, inferredStatus, index)
        }

        return null
      })
      .filter(Boolean)
  })
  const extraJobs = computed(() => {
    return workflowJobs.value
      .filter(job => !PIPELINE_JOB_DEFINITIONS.some(definition => definition.kinds.includes(String(job?.kind || ''))))
      .map((job) => withPipelineMeta(job, 'extra', PIPELINE_JOB_DEFINITIONS.length + 1))
      .sort(compareDisplayJobs)
  })
  const recentJobs = computed(() => [...pipelineJobs.value, ...extraJobs.value].sort(compareDisplayJobs))

  const serviceHealthCards = computed(() => {
    return (Object.keys(input.services) as ServiceKey[]).map((key) => {
      const provider = String(input.services[key].provider.value || '')
      const snapshot = provider ? providerSnapshots.value[provider] : null
      return {
        key,
        provider,
        label: input.services[key].label.value,
        status: snapshot?.status || (provider ? 'unknown_error' : 'not_configured'),
        checkedAt: snapshot?.checked_at || snapshot?.checkedAt || '',
        services: safeArray(snapshot?.services),
      }
    })
  })
  const providerWatchKey = computed(() => {
    return (Object.keys(input.services) as ServiceKey[])
      .map((key) => `${key}:${input.services[key].provider.value || ''}`)
      .join('|')
  })

  const modelUsageCards = computed(() => {
    return (Object.keys(input.services) as ServiceKey[]).map((key) => {
      const latestJob = workflowJobs.value.find(job => JOB_KIND_BY_SERVICE[key].includes(String(job?.kind || '')) && String(job?.status || '') !== 'failed')
      return {
        key,
        label: input.services[key].label.value,
        provider: latestJob?.provider || input.services[key].provider.value || '',
        model: latestJob?.model || '',
        status: latestJob?.status || '',
        kind: latestJob?.kind || '',
        jobId: latestJob?.id || null,
      }
    })
  })

  const blockingStages = computed(() => {
    return (Object.keys(validations) as ValidationStage[])
      .filter(stage => validations[stage].issues.length)
      .map((stage) => ({
        stage,
        blocked: validations[stage].blocked,
        issues: validations[stage].issues,
      }))
  })

  function getValidation(stage: ValidationStage) {
    return validations[stage]
  }

  function getPipelineStep(key: string) {
    const steps = pipelineStatus.value?.steps || {}
    return resolvePipelineStep(key, steps)
  }

  function getPipelineStepState(key: string): CanonicalPipelineState {
    const step = getPipelineStep(key)
    if (step?.state) return step.state as CanonicalPipelineState
    return mapPipelineStepStatusToState(step?.status)
  }

  function getPipelineStage(key: string) {
    return pipelineStatus.value?.stages?.[key] || null
  }

  function getPipelineStageState(key: string): CanonicalPipelineState {
    const stage = getPipelineStage(key)
    if (stage?.state) return stage.state as CanonicalPipelineState
    return mapPipelineStepStatusToState(stage?.status)
  }

  function getServiceHealth(service: ServiceKey) {
    return serviceHealthCards.value.find(card => card.key === service) || null
  }

  function getLatestJobForService(service: ServiceKey) {
    return modelUsageCards.value.find(card => card.key === service) || null
  }

  async function refreshWorkflowJobs() {
    const episodeId = Number(input.episodeId.value || 0)
    if (!episodeId) {
      workflowJobs.value = []
      return
    }
    loading.jobs = true
    try {
      const rows = await workflowJobsAPI.list({
        episode_id: episodeId,
        drama_id: input.dramaId,
        page_size: 80,
      })
      workflowJobs.value = safeArray(rows)
      lastSyncedAt.value = new Date().toISOString()
    } finally {
      loading.jobs = false
    }
  }

  async function refreshPipelineStatus() {
    const episodeId = Number(input.episodeId.value || 0)
    if (!episodeId) {
      pipelineStatus.value = null
      return
    }
    loading.pipeline = true
    try {
      pipelineStatus.value = await episodeAPI.pipelineStatus(episodeId)
    } finally {
      loading.pipeline = false
    }
  }

  async function refreshValidations() {
    const episodeId = Number(input.episodeId.value || 0)
    if (!episodeId) {
      validations.script = emptyValidation('script')
      validations.audio = emptyValidation('audio')
      validations.compose = emptyValidation('compose')
      validations.merge = emptyValidation('merge')
      return
    }
    loading.validation = true
    try {
      const [script, audio, compose, merge] = await Promise.all([
        episodeAPI.validation(episodeId, 'script'),
        episodeAPI.validation(episodeId, 'audio'),
        episodeAPI.validation(episodeId, 'compose'),
        episodeAPI.validation(episodeId, 'merge'),
      ])
      validations.script = { ...emptyValidation('script'), ...script, issues: safeArray(script?.issues) }
      validations.audio = { ...emptyValidation('audio'), ...audio, issues: safeArray(audio?.issues) }
      validations.compose = { ...emptyValidation('compose'), ...compose, issues: safeArray(compose?.issues) }
      validations.merge = { ...emptyValidation('merge'), ...merge, issues: safeArray(merge?.issues) }
    } finally {
      loading.validation = false
    }
  }

  async function refreshProviderAvailability() {
    const providers = [...new Set(serviceHealthCards.value.map(card => card.provider).filter(Boolean))]
    if (!providers.length) {
      providerSnapshots.value = {}
      return
    }
    loading.availability = true
    try {
      const snapshots = await Promise.all(providers.map(async (provider) => ({
        provider,
        snapshot: await providerAvailabilityAPI.get(provider),
      })))
      providerSnapshots.value = snapshots.reduce((acc, item) => {
        acc[item.provider] = item.snapshot
        return acc
      }, {} as Record<string, any>)
    } finally {
      loading.availability = false
    }
  }

  async function refreshWorkbenchTelemetry() {
    try {
      await healthAPI.get()
      backendReachable.value = true
    } catch {
      backendReachable.value = false
      return
    }

    await Promise.all([
      refreshWorkflowJobs(),
      refreshPipelineStatus(),
      refreshValidations(),
      refreshProviderAvailability(),
    ])
  }

  async function refreshPollingTelemetry() {
    if (!shouldPollTelemetry()) return

    const wasActive = shouldPollTelemetry()
    try {
      await Promise.all([
        refreshWorkflowJobs(),
        refreshPipelineStatus(),
      ])
      backendReachable.value = true
    } catch {
      backendReachable.value = false
      return
    }

    if (wasActive && !shouldPollTelemetry()) {
      await refreshValidations()
    }
  }

  function shouldPollTelemetry() {
    if (!input.episodeId.value) return false
    if (typeof document !== 'undefined' && document.hidden) return false
    return runningJobs.value.length > 0
  }

  function getPollIntervalMs() {
    return workflowJobs.value.some(job => normalizeJobStatus(job?.status) === 'running')
      ? RUNNING_POLL_INTERVAL_MS
      : QUEUED_POLL_INTERVAL_MS
  }

  function schedulePolling() {
    stopPolling()
    if (!shouldPollTelemetry()) return

    pollHandle = setTimeout(async () => {
      pollHandle = null
      await refreshPollingTelemetry()
      schedulePolling()
    }, getPollIntervalMs())
  }

  function handleVisibilityChange() {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      stopPolling()
      return
    }
    schedulePolling()
  }

  function stopPolling() {
    if (!pollHandle) return
    clearTimeout(pollHandle)
    pollHandle = null
  }

  watch(() => input.episodeId.value, () => {
    void refreshWorkbenchTelemetry().finally(() => {
      schedulePolling()
    })
  }, { immediate: true })

  watch(providerWatchKey, () => {
    void refreshProviderAvailability()
  })

  watch(() => runningJobs.value.map(job => `${job?.id || ''}:${normalizeJobStatus(job?.status)}`).join('|'), () => {
    schedulePolling()
  })

  onMounted(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    schedulePolling()
  })

  onBeforeUnmount(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    stopPolling()
  })

  return {
    workflowJobs,
    runningJobs,
    failedJobs,
    recentJobs,
    validations,
    blockingStages,
    serviceHealthCards,
    modelUsageCards,
    backendReachable,
    loading,
    lastSyncedAt,
    pipelineStatus,
    refreshWorkbenchTelemetry,
    getValidation,
    getPipelineStep,
    getPipelineStepState,
    getPipelineStage,
    getPipelineStageState,
    getServiceHealth,
    getLatestJobForService,
  }
}

function mapPipelineStepToJobStatus(status: string) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'done') return 'completed'
  if (normalized === 'partial') return 'partial'
  if (normalized === 'ready') return 'ready'
  if (normalized === 'blocked') return 'failed'
  if (normalized === 'not_applicable') return 'pending'
  if (normalized === 'pending') return 'pending'
  return 'pending'
}

function combineExtractorSteps(characters: any, scenes: any) {
  const characterCount = Number(characters?.count || 0)
  const sceneCount = Number(scenes?.count || 0)
  const hasAny = characterCount > 0 || sceneCount > 0
  const allDone = String(characters?.status || '') === 'done' && String(scenes?.status || '') === 'done'
  const partial = !allDone && hasAny

  return {
    status: allDone ? 'done' : partial ? 'partial' : '',
    characters: characterCount,
    scenes: sceneCount,
  }
}

function resolvePipelineStep(key: string, steps: Record<string, any>) {
  if (key === 'extractor') {
    return combineExtractorSteps(steps.extract_characters, steps.extract_scenes)
  }
  return steps[key]
}

function mapPipelineStepStatusToState(status: unknown): CanonicalPipelineState {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'done' || normalized === 'completed' || normalized === 'complete') return 'complete'
  if (normalized === 'partial' || normalized === 'running' || normalized === 'queued') return 'in_progress'
  if (normalized === 'blocked' || normalized === 'failed') return 'blocked'
  if (normalized === 'ready') return 'needs_review'
  if (normalized === 'not_applicable') return 'not_applicable'
  return 'not_started'
}

function compareJobRecency(a: any, b: any) {
  return Number(b?.id || 0) - Number(a?.id || 0)
}

function normalizeJobStatus(status: unknown) {
  return String(status || '').trim().toLowerCase()
}

function getStatusPriority(status: unknown) {
  const normalized = normalizeJobStatus(status)
  if (['pending', 'ready', 'partial'].includes(normalized)) return 0
  if (['queued', 'running'].includes(normalized)) return 1
  if (normalized === 'failed') return 2
  if (normalized === 'completed') return 3
  return 4
}

function withPipelineMeta(job: any, pipelineKey: string, pipelineIndex: number) {
  return {
    ...job,
    source: job?.source || 'real',
    pipeline_key: pipelineKey,
    pipeline_index: pipelineIndex,
  }
}

function buildInferredJob(key: string, kind: string, step: any, status: string, pipelineIndex: number) {
  return {
    id: `inferred:${key}`,
    kind,
    status,
    provider: null,
    model: null,
    source: 'inferred',
    pipeline_key: key,
    pipeline_index: pipelineIndex,
    display_meta: buildInferredJobMeta(key, step),
  }
}

function compareDisplayJobs(a: any, b: any) {
  const statusDelta = getStatusPriority(a?.status) - getStatusPriority(b?.status)
  if (statusDelta !== 0) return statusDelta

  const pipelineDelta = Number(a?.pipeline_index ?? Number.MAX_SAFE_INTEGER) - Number(b?.pipeline_index ?? Number.MAX_SAFE_INTEGER)
  if (pipelineDelta !== 0) return pipelineDelta

  return compareJobRecency(a, b)
}

function buildInferredJobMeta(key: string, step: any) {
  switch (key) {
    case 'script_rewrite':
      if (step.status === 'pending') return 'Inferido do estado atual · aguardando conteudo bruto'
      return step.status === 'ready'
        ? 'Inferido do estado atual · conteudo pronto para reescrita'
        : 'Inferido do estado atual · roteiro ja estruturado'
    case 'extractor':
      if (step.status === 'pending') return 'Inferido do estado atual · aguardando roteiro para extracao'
      return `Inferido do estado atual · ${Number(step.characters || 0)} personagens e ${Number(step.scenes || 0)} cenarios`
    case 'assign_voices':
      if (step.status === 'pending') return 'Inferido do estado atual · aguardando personagens com voz'
      return `Inferido do estado atual · ${Number(step.assigned || 0)}/${Number(step.total || 0)} vozes atribuidas`
    case 'generate_voice_samples':
      if (step.status === 'pending') return 'Inferido do estado atual · aguardando previas de voz'
      return `Inferido do estado atual · ${Number(step.completed || 0)}/${Number(step.total || 0)} previas geradas`
    case 'extract_storyboards':
      if (step.status === 'pending') return 'Inferido do estado atual · aguardando decupagem em tomadas'
      return `Inferido do estado atual · ${Number(step.count || 0)} tomadas`
    case 'generate_images':
      if (step.status === 'pending') return 'Inferido do estado atual · aguardando imagens das tomadas'
      return `Inferido do estado atual · ${Number(step.completed || 0)}/${Number(step.total || 0)} concluidos`
    case 'generate_videos':
      if (step.status === 'pending') return 'Inferido do estado atual · aguardando videos das tomadas'
      return `Inferido do estado atual · ${Number(step.completed || 0)}/${Number(step.total || 0)} concluidos`
    case 'compose_shots':
      if (step.status === 'pending') return 'Inferido do estado atual · aguardando composicao das tomadas'
      return `Inferido do estado atual · ${Number(step.completed || 0)}/${Number(step.total || 0)} concluidos`
    case 'merge_episode':
      if (step.status === 'pending') return 'Inferido do estado atual · aguardando montagem final'
      return step.merged_url
        ? 'Inferido do estado atual · filme final pronto'
        : 'Inferido do estado atual · montagem pendente'
    default:
      return 'Inferido do estado atual do episodio'
  }
}
