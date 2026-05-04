import { computed, type ComputedRef, type Ref } from 'vue'
import {
  Users,
  MapPin,
  Video,
  ImageIcon,
  Layers,
  Mic2,
  FileText,
  Clapperboard,
  Download,
  Music2,
} from 'lucide-vue-next'

type ProdTabDef = {
  id: string
  label: string
  icon?: any
  badge?: string
}

type UseEpisodeStageNavigationInput = {
  panel: Ref<string>
  scriptStep: Ref<number>
  prodTab: Ref<string>
  prodTabDefs: ComputedRef<ProdTabDef[]>
  episodeMessages: Record<string, any>
  stepLabels: string[]
  rawContent: ComputedRef<string>
  scriptContent: ComputedRef<string>
  extractionStepReady: ComputedRef<boolean>
  voiceAssignmentReady: ComputedRef<boolean>
  storyboardStepReady: ComputedRef<boolean>
  dubbingStepSatisfied: ComputedRef<boolean>
  visualCharTotal: ComputedRef<number>
  charImgCount: ComputedRef<number>
  scenes: Ref<any[]>
  sceneImgCount: ComputedRef<number>
  chars: Ref<any[]>
  storyboards: Ref<any[]>
  shotImgCount: ComputedRef<number>
  shotVidCount: ComputedRef<number>
  composedCount: ComputedRef<number>
  mergeUrl: ComputedRef<string | null>
  prodStepDone: (id: string) => boolean
  prodStepPartial: (id: string) => boolean
  isWorkbenchStageDone: (key: string) => boolean
  queueContentFocus: () => void
}

export function useEpisodeStageNavigation(input: UseEpisodeStageNavigationInput) {
  const productionStepState = (id: string) => ({
    done: input.prodStepDone(id),
    partial: input.prodStepPartial(id),
  })
  const storyboardListState = () => {
    const done = input.isWorkbenchStageDone('storyboards') || input.storyboardStepReady.value
    return {
      done,
      partial: !done && input.storyboards.value.length > 0,
    }
  }

  const sidebarSections = computed(() => ([
    {
      id: 'script',
      label: input.episodeMessages.sections.script,
      items: [
        { key: 'script:raw', label: input.episodeMessages.script.raw.step, desc: '', icon: FileText, done: !!input.rawContent.value },
        { key: 'script:rewrite', label: input.episodeMessages.script.rewrite.step, desc: '', icon: FileText, done: input.isWorkbenchStageDone('rewritten_script') || !!input.scriptContent.value },
        { key: 'script:extract', label: input.episodeMessages.script.extract.step, desc: '', icon: Users, done: input.isWorkbenchStageDone('entities') || input.extractionStepReady.value },
        { key: 'script:storyboard', label: input.episodeMessages.script.storyboard.step, desc: '', icon: Clapperboard, ...storyboardListState() },
      ],
    },
    {
      id: 'production',
      label: input.episodeMessages.sections.production,
      items: [
        { key: 'prod:chars', label: input.episodeMessages.production.tabs.chars, desc: '', icon: Users, ...productionStepState('chars') },
        { key: 'prod:scenes', label: input.episodeMessages.production.tabs.scenes, desc: '', icon: MapPin, ...productionStepState('scenes') },
        { key: 'prod:dubbing', label: input.episodeMessages.production.tabs.dubbing, desc: '', icon: Mic2, ...productionStepState('dubbing') },
        { key: 'prod:audio', label: input.episodeMessages.production.tabs.audio, desc: '', icon: Music2, ...productionStepState('audio') },
        { key: 'prod:shots', label: input.episodeMessages.production.tabs.shots, desc: '', icon: ImageIcon, ...productionStepState('shots') },
        { key: 'prod:videos', label: input.episodeMessages.production.tabs.videos, desc: '', icon: Video, ...productionStepState('videos') },
        { key: 'prod:compose', label: input.episodeMessages.production.tabs.compose, desc: '', icon: Layers, ...productionStepState('compose') },
      ],
    },
    {
      id: 'export',
      label: input.episodeMessages.sections.export,
      items: [
        { key: 'export:merge', label: input.episodeMessages.export.stage, desc: '', icon: Download, done: !!input.mergeUrl.value },
      ],
    },
  ]))

  const activeMainStage = computed(() => {
    if (input.panel.value === 'export') return 'export'
    if (input.panel.value === 'production') {
      return ['chars', 'scenes'].includes(input.prodTab.value) ? 'assets' : 'storyboard'
    }
    if (input.scriptStep.value <= 1) return 'script'
    if (input.scriptStep.value <= 2) return 'assets'
    return 'storyboard'
  })

  function mainStageDone(stageId: string) {
    if (stageId === 'script') return !!input.scriptContent.value
    if (stageId === 'assets') {
      const charImagesReady = input.visualCharTotal.value > 0 && input.charImgCount.value === input.visualCharTotal.value
      const sceneImagesReady = input.scenes.value.length > 0 && input.sceneImgCount.value === input.scenes.value.length
      return input.extractionStepReady.value && charImagesReady && sceneImagesReady
    }
    if (stageId === 'storyboard') {
      if (!input.storyboardStepReady.value) return false
      return input.prodStepDone('dubbing')
        && input.prodStepDone('audio')
        && input.prodStepDone('shots')
        && input.prodStepDone('videos')
        && input.prodStepDone('compose')
    }
    if (stageId === 'export') return !!input.mergeUrl.value
    return false
  }

  function goMainStage(stageId: string) {
    if (stageId === 'script') {
      input.panel.value = 'script'
      input.scriptStep.value = Math.min(input.scriptStep.value, 1)
      input.queueContentFocus()
      return
    }

    if (stageId === 'assets') {
      const hasAssetWorkspace = !!input.visualCharTotal.value || !!input.scenes.value.length
      const hasPendingAssetGeneration = (input.visualCharTotal.value && input.charImgCount.value < input.visualCharTotal.value)
        || (input.scenes.value.length && input.sceneImgCount.value < input.scenes.value.length)
      if (input.panel.value === 'production' || hasPendingAssetGeneration || hasAssetWorkspace) {
        input.panel.value = 'production'
        input.prodTab.value = ['chars', 'scenes'].includes(input.prodTab.value) ? input.prodTab.value : 'chars'
        input.queueContentFocus()
        return
      }
      input.panel.value = 'script'
      input.scriptStep.value = 2
      input.queueContentFocus()
      return
    }

    if (stageId === 'storyboard') {
      if (input.panel.value === 'production') {
        input.prodTab.value = ['dubbing', 'audio', 'shots', 'videos', 'compose'].includes(input.prodTab.value) ? input.prodTab.value : 'dubbing'
        input.queueContentFocus()
        return
      }
      input.panel.value = 'script'
      input.scriptStep.value = 4
      input.queueContentFocus()
      return
    }

    input.panel.value = 'export'
    input.queueContentFocus()
  }

  const activeSubSteps = computed(() => {
    if (activeMainStage.value === 'script') {
      return [
        { key: 'script:raw', label: input.episodeMessages.script.raw.step, done: !!input.rawContent.value },
        { key: 'script:rewrite', label: input.episodeMessages.script.rewrite.step, done: input.isWorkbenchStageDone('rewritten_script') || !!input.scriptContent.value },
      ]
    }
    if (activeMainStage.value === 'assets') {
      return [
        { key: 'script:extract', label: input.episodeMessages.script.extract.step, done: input.isWorkbenchStageDone('entities') || input.extractionStepReady.value },
        { key: 'prod:chars', label: input.episodeMessages.production.tabs.chars, ...productionStepState('chars') },
        { key: 'prod:scenes', label: input.episodeMessages.production.tabs.scenes, ...productionStepState('scenes') },
      ]
    }
    if (activeMainStage.value === 'storyboard') {
      return [
        { key: 'script:storyboard', label: input.episodeMessages.script.storyboard.step, ...storyboardListState() },
        { key: 'prod:dubbing', label: input.episodeMessages.production.tabs.dubbing, ...productionStepState('dubbing') },
        { key: 'prod:audio', label: input.episodeMessages.production.tabs.audio, ...productionStepState('audio') },
        { key: 'prod:shots', label: input.episodeMessages.production.tabs.shots, ...productionStepState('shots') },
        { key: 'prod:videos', label: input.episodeMessages.production.tabs.videos, ...productionStepState('videos') },
        { key: 'prod:compose', label: input.episodeMessages.production.tabs.compose, ...productionStepState('compose') },
      ]
    }
    return [
      { key: 'export:merge', label: input.episodeMessages.export.stage, done: input.isWorkbenchStageDone('merge') || !!input.mergeUrl.value },
    ]
  })

  const activeSubStepKey = computed(() => {
    if (input.panel.value === 'script') {
      if (input.scriptStep.value === 0) return 'script:raw'
      if (input.scriptStep.value === 1) return 'script:rewrite'
      if (input.scriptStep.value === 2) return 'script:extract'
      return 'script:storyboard'
    }
    if (input.panel.value === 'production') return `prod:${input.prodTab.value}`
    return 'export:merge'
  })

  const sidebarJumpSteps = computed(() => {
    const section = sidebarSections.value.find((item) => item.items.some(step => step.key === activeSubStepKey.value))
    return section?.items || []
  })

  const bubbleSteps = computed(() => {
    if (input.panel.value === 'script') {
      return [
        { key: 'script:raw', label: input.episodeMessages.script.raw.step, done: !!input.rawContent.value },
        { key: 'script:rewrite', label: input.episodeMessages.script.rewrite.step, done: input.isWorkbenchStageDone('rewritten_script') || !!input.scriptContent.value },
        { key: 'script:extract', label: input.episodeMessages.script.extract.step, done: input.isWorkbenchStageDone('entities') || input.extractionStepReady.value },
        { key: 'script:storyboard', label: input.episodeMessages.script.storyboard.step, ...storyboardListState() },
      ]
    }
    if (input.panel.value === 'production') {
      return input.prodTabDefs.value.map(step => ({
        key: `prod:${step.id}`,
        label: step.label,
        ...productionStepState(step.id),
      }))
    }
    return []
  })

  const activeBubbleKey = computed(() => {
    if (input.panel.value === 'script') return activeSubStepKey.value
    if (input.panel.value === 'production') return `prod:${input.prodTab.value}`
    return ''
  })

  const showBottomBubble = computed(() => input.panel.value === 'script' || input.panel.value === 'production')

  function goSubStep(key: string) {
    if (key.startsWith('script:')) {
      input.panel.value = 'script'
      const stepMap: Record<string, number> = {
        'script:raw': 0,
        'script:rewrite': 1,
        'script:extract': 2,
        'script:storyboard': 4,
      }
      input.scriptStep.value = stepMap[key] ?? 0
      input.queueContentFocus()
      return
    }
    if (key.startsWith('prod:')) {
      input.panel.value = 'production'
      input.prodTab.value = key.replace('prod:', '')
      input.queueContentFocus()
      return
    }
    input.panel.value = 'export'
    input.queueContentFocus()
  }

  const currentSubStageLabel = computed(() => {
    const current = activeSubSteps.value.find(step => step.key === activeSubStepKey.value)
    if (current?.label) return current.label
    if (input.panel.value === 'script') return `${input.episodeMessages.navigation.scriptStage} · ${input.stepLabels[input.scriptStep.value === 3 ? 4 : input.scriptStep.value]}`
    if (input.panel.value === 'production') {
      const currentProdTab = input.prodTabDefs.value.find(step => step.id === input.prodTab.value)
      return `${input.episodeMessages.navigation.productionStage} · ${currentProdTab?.label || input.episodeMessages.navigation.workspace}`
    }
    return input.mergeUrl.value
      ? input.episodeMessages.navigation.exportStageReady
      : input.episodeMessages.navigation.exportStagePending
  })

  return {
    sidebarSections,
    activeMainStage,
    mainStageDone,
    goMainStage,
    activeSubSteps,
    activeSubStepKey,
    sidebarJumpSteps,
    bubbleSteps,
    activeBubbleKey,
    showBottomBubble,
    goSubStep,
    currentSubStageLabel,
  }
}
