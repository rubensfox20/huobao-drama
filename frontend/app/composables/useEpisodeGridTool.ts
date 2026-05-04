import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { gridAPI, imageAPI } from './useApi'

type GridLayout = { rows: number; cols: number }

type UseEpisodeGridToolInput = {
  dramaId: number
  episodeId: ComputedRef<number>
  episodeNumber: number
  storyboards: Ref<any[]> | ComputedRef<any[]>
  episodeMessages: Record<string, any>
  t: (path: string, params?: Record<string, string | number>) => string
  getFrameTypeShortLabel: (frameType: string) => string
}

export function useEpisodeGridTool(input: UseEpisodeGridToolInput) {
  const gridLayoutOptions = [
    { label: '2x2', value: '2x2' },
    { label: '3x3', value: '3x3' },
    { label: '4x4', value: '4x4' },
    { label: '5x5', value: '5x5' },
  ]

  const gridDialog = ref(false)
  const gridStep = ref(0)
  const gridLayout = ref('3x3')
  const gridMode = ref('first_frame')
  const gridSelected = ref<number[]>([])
  const gridSingleTarget = ref<number | null>(null)
  const gridGenId = ref<number | null>(null)
  const gridImagePath = ref('')
  const gridStatusText = ref('')
  const gridActualLayout = ref<GridLayout>({ rows: 3, cols: 3 })
  const gridRecoveredAt = ref('')
  const gridRecoveredMode = ref('')
  const gridPromptText = ref('')
  const gridCellPrompts = ref<any[]>([])
  const gridPromptSource = ref('')
  const gridPromptLoading = ref(false)
  const gridPromptStatus = ref('')
  const gridAssignmentsState = ref<Array<{ storyboard_id: number | null; frame_type: string }>>([])
  const gridActiveShotIds = ref<number[]>([])
  const gridHistory = ref<Array<{ id: number; localPath: string; layout: GridLayout; modeLabel: string; createdAtLabel: string }>>([])
  const showAllGridHistory = ref(false)
  const activeGridCell = ref(0)
  const gridAssignmentPage = ref(0)
  const gridStorageKey = computed(() => `huobao:grid:${input.dramaId}:${input.episodeId.value || input.episodeNumber}`)
  const gridModes = Object.entries(input.episodeMessages.grid.modes).map(([id, config]) => ({ id, ...(config as Record<string, any>) }))

  function getGridPromptSourceLabel(source: string) {
    if (!source) return ''
    return source === 'agent' ? input.episodeMessages.grid.promptSourceAgent : input.episodeMessages.grid.promptSourceTemplate
  }

  function getGridHistoryToggleLabel() {
    if (showAllGridHistory.value) return input.episodeMessages.production.shots.collapse
    return input.t('episode.production.shots.expand', { count: gridHistory.value.length })
  }

  const gridLayoutShape = computed(() => {
    const [rows, cols] = String(gridLayout.value || '3x3').split('x').map(Number)
    return {
      rows: rows || 3,
      cols: cols || 3,
    }
  })

  const gridTotalCells = computed(() => gridLayoutShape.value.rows * gridLayoutShape.value.cols)

  const gridCanStart = computed(() => {
    if (gridMode.value === 'multi_ref') return !!gridSingleTarget.value
    return gridSelected.value.length > 0
  })

  const gridSummary = computed(() => {
    const storyboards = input.storyboards.value

    if (gridMode.value === 'multi_ref') {
      const index = storyboards.findIndex(storyboard => storyboard.id === gridSingleTarget.value) + 1
      return gridSingleTarget.value
        ? input.t('episode.grid.summarySingle', { rows: gridLayoutShape.value.rows, cols: gridLayoutShape.value.cols, shot: index })
        : input.episodeMessages.grid.summaryEmptySingle
    }

    if (!gridSelected.value.length) return input.episodeMessages.grid.summaryEmpty

    const count = gridSelected.value.length
    const { rows, cols } = gridLayoutShape.value
    if (gridMode.value === 'first_last') {
      return input.t('episode.grid.summaryFirstLast', { count, rows, cols })
    }

    return input.t('episode.grid.summaryDefault', { count, rows, cols })
  })

  function createGridAssignments() {
    return Array.from({ length: gridActualLayout.value.rows * gridActualLayout.value.cols }, () => ({
      storyboard_id: null,
      frame_type: 'first_frame',
    }))
  }

  const gridAssignments = computed(() => gridAssignmentsState.value)
  const gridAssignableShotIds = computed(() => {
    const storyboards = input.storyboards.value
    const assignedIds = [...new Set(gridAssignments.value.map(item => item?.storyboard_id).filter(Boolean))]
    const ids = Array.isArray(gridActiveShotIds.value) && gridActiveShotIds.value.length
      ? gridActiveShotIds.value
      : assignedIds.length
        ? assignedIds
        : gridMode.value === 'multi_ref'
          ? (gridSingleTarget.value ? [gridSingleTarget.value] : [])
          : gridSelected.value.length
            ? [...gridSelected.value]
            : storyboards.map(storyboard => storyboard.id)

    return ids.filter(id => storyboards.some(storyboard => storyboard.id === id))
  })

  const gridAssignmentShotOptions = computed(() => {
    const storyboards = input.storyboards.value
    return [
      { label: input.episodeMessages.grid.unassigned, value: null },
      ...gridAssignableShotIds.value.map((id) => {
        const index = storyboards.findIndex(storyboard => storyboard.id === id) + 1
        const storyboard = storyboards.find(item => item.id === id)
        return {
          label: `#${String(index).padStart(2, '0')} ${storyboard?.title || storyboard?.description || input.episodeMessages.grid.shotOptionFallback}`,
          value: id,
        }
      }),
    ]
  })

  const gridFrameTypeOptions = computed(() => ([
    { label: input.episodeMessages.grid.frameTypes.first_frame, value: 'first_frame' },
    { label: input.episodeMessages.grid.frameTypes.last_frame, value: 'last_frame' },
    { label: input.episodeMessages.grid.frameTypes.reference, value: 'reference' },
  ]))

  const gridAssignedCount = computed(() => gridAssignments.value.filter(item => !!item.storyboard_id).length)
  const gridAssignmentPageSize = computed(() => {
    if (gridAssignments.value.length >= 25) return 8
    if (gridAssignments.value.length >= 16) return 10
    if (gridAssignments.value.length >= 9) return 9
    return Math.max(1, gridAssignments.value.length || 1)
  })
  const gridAssignmentTotalPages = computed(() => Math.max(1, Math.ceil(gridAssignments.value.length / gridAssignmentPageSize.value)))
  const gridAssignmentPageStart = computed(() => gridAssignmentPage.value * gridAssignmentPageSize.value)
  const gridAssignmentPageEnd = computed(() => Math.min(gridAssignments.value.length, gridAssignmentPageStart.value + gridAssignmentPageSize.value))
  const pagedGridAssignments = computed(() => {
    return gridAssignments.value
      .slice(gridAssignmentPageStart.value, gridAssignmentPageEnd.value)
      .map((assignment, offset) => ({
        assignment,
        index: gridAssignmentPageStart.value + offset,
      }))
  })

  function resetGridAssignments() {
    gridAssignmentsState.value = createGridAssignments()
    activeGridCell.value = 0
    gridAssignmentPage.value = 0
  }

  function gridCellLabel(assignment: { storyboard_id?: number | null; frame_type?: string } | null | undefined) {
    const storyboards = input.storyboards.value
    if (!assignment?.storyboard_id) return input.episodeMessages.grid.unassigned
    const index = storyboards.findIndex(storyboard => storyboard.id === assignment.storyboard_id) + 1
    const suffix = input.getFrameTypeShortLabel(assignment.frame_type || '')
    return `#${index}${suffix ? ` ${suffix}` : ''}`
  }

  function gridCellTitle(id: number | null | undefined) {
    const storyboards = input.storyboards.value
    if (!id) return input.episodeMessages.grid.unassigned
    const index = storyboards.findIndex(storyboard => storyboard.id === id) + 1
    const storyboard = storyboards.find(item => item.id === id)
    return `#${String(index).padStart(2, '0')} ${storyboard?.title || storyboard?.description || input.episodeMessages.grid.shotOptionFallback}`
  }

  function updateGridAssignment(index: number, field: 'storyboard_id' | 'frame_type', value: any) {
    const next = [...gridAssignmentsState.value]
    next[index] = { ...next[index], [field]: value }
    gridAssignmentsState.value = next
    activeGridCell.value = index
    if (gridImagePath.value) persistGridImagePath(gridImagePath.value)
  }

  function focusGridCell(index: number) {
    activeGridCell.value = index
    gridAssignmentPage.value = Math.floor(index / gridAssignmentPageSize.value)
  }

  const gridOverlayStyle = computed(() => {
    const { rows, cols } = gridActualLayout.value
    return { 'grid-template-columns': `repeat(${cols}, 1fr)`, 'grid-template-rows': `repeat(${rows}, 1fr)` }
  })

  const gridAutoLayout = computed(() => gridLayoutShape.value)

  const gridBlankStyle = computed(() => {
    const { rows, cols } = gridAutoLayout.value
    return { 'grid-template-columns': `repeat(${cols}, 1fr)`, 'grid-template-rows': `repeat(${rows}, 1fr)` }
  })

  function gridSelectAll() {
    const storyboards = input.storyboards.value
    if (gridSelected.value.length === storyboards.length) {
      gridSelected.value = []
      return
    }
    gridSelected.value = storyboards.map(storyboard => storyboard.id)
  }

  function openGridTool() {
    gridStep.value = 0
    gridSelected.value = []
    gridSingleTarget.value = null
    gridActiveShotIds.value = []
    gridPromptText.value = ''
    gridCellPrompts.value = []
    gridPromptSource.value = ''
    gridPromptStatus.value = ''
    gridAssignmentsState.value = []
    gridDialog.value = true
  }

  function persistGridImagePath(value: string) {
    if (typeof window === 'undefined') return
    if (!value) {
      window.localStorage.removeItem(gridStorageKey.value)
      return
    }

    const current = restoreGridState() || {}
    const entries = current.entries || {}
    entries[value] = {
      generationId: gridGenId.value,
      layout: gridActualLayout.value,
      shotIds: gridActiveShotIds.value,
      assignments: gridAssignmentsState.value,
      recoveredAt: gridRecoveredAt.value,
      recoveredMode: gridRecoveredMode.value,
    }

    window.localStorage.setItem(gridStorageKey.value, JSON.stringify({
      activeImagePath: value,
      entries,
    }))
  }

  function restoreGridState() {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(gridStorageKey.value)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return { activeImagePath: raw, entries: { [raw]: {} } }
    }
  }

  function applyGridState(imagePath: string, meta: Record<string, any> = {}) {
    gridImagePath.value = imagePath || ''
    gridGenId.value = meta.generationId || meta.id || null
    if (meta.layout?.rows && meta.layout?.cols) gridActualLayout.value = meta.layout
    gridActiveShotIds.value = Array.isArray(meta.shotIds) ? meta.shotIds : []
    gridAssignmentsState.value = Array.isArray(meta.assignments) ? meta.assignments : []
    gridRecoveredAt.value = meta.recoveredAt || meta.createdAtLabel || ''
    gridRecoveredMode.value = meta.recoveredMode || meta.modeLabel || ''
  }

  function selectGridHistory(item: { id: number; localPath: string; createdAtLabel?: string; modeLabel?: string }) {
    const cached = restoreGridState()
    const cachedEntry = cached?.entries?.[item.localPath] || {}
    applyGridState(item.localPath, {
      ...item,
      ...cachedEntry,
      generationId: cachedEntry.generationId || item.id,
      recoveredAt: cachedEntry.recoveredAt || item.createdAtLabel,
      recoveredMode: cachedEntry.recoveredMode || item.modeLabel,
    })
    if (!gridAssignmentsState.value.length) resetGridAssignments()
    persistGridImagePath(item.localPath)
  }

  function reopenGridPreview() {
    if (!gridImagePath.value) {
      openGridTool()
      return
    }
    gridDialog.value = true
    if (!gridAssignmentsState.value.length) resetGridAssignments()
    gridStep.value = 3
  }

  function parseGridLayoutFromFrameType(value: string) {
    const match = String(value || '').match(/grid_[^_]+_(\d+)x(\d+)$/)
    if (!match) return null
    return { rows: Number(match[1]) || 3, cols: Number(match[2]) || 3 }
  }

  function continueGridSplit() {
    if (!gridImagePath.value) {
      toast.warning(input.episodeMessages.grid.noGridToContinue)
      return
    }
    if (!gridAssignmentsState.value.length) resetGridAssignments()
    gridDialog.value = true
    gridStep.value = 3
  }

  function getGridPromptShotIds() {
    if (gridMode.value === 'multi_ref') return gridSingleTarget.value ? [gridSingleTarget.value] : []
    if (gridMode.value === 'first_last') return [...gridSelected.value]
    return gridSelected.value.slice(0, gridTotalCells.value)
  }

  async function generateGridPrompt() {
    if (!gridCanStart.value) {
      toast.warning(input.episodeMessages.grid.noShotSelected)
      return
    }

    gridPromptLoading.value = true
    gridPromptStatus.value = input.episodeMessages.grid.statusPromptLoading
    gridPromptText.value = ''
    gridCellPrompts.value = []
    gridPromptSource.value = ''

    try {
      const shotIds = getGridPromptShotIds()
      const { rows, cols } = gridAutoLayout.value
      const response = await gridAPI.prompt({
        storyboard_ids: shotIds,
        drama_id: input.dramaId,
        episode_id: input.episodeId.value,
        rows,
        cols,
        mode: gridMode.value,
      })

      gridPromptText.value = response?.grid_prompt || ''
      gridCellPrompts.value = Array.isArray(response?.cell_prompts) ? response.cell_prompts : []
      gridPromptSource.value = response?.source || ''

      if (gridPromptText.value) {
        resetGridAssignments()
        gridPromptStatus.value = gridPromptSource.value === 'agent'
          ? input.episodeMessages.grid.statusPromptReadyAgent
          : input.episodeMessages.grid.statusPromptReadyTemplate
        gridStep.value = 1
      } else {
        gridPromptStatus.value = ''
        toast.error(input.episodeMessages.grid.promptFailed)
      }
    } catch (error: any) {
      gridPromptStatus.value = ''
      toast.error(error?.message || input.episodeMessages.grid.promptFailedGeneric)
    } finally {
      gridPromptLoading.value = false
    }
  }

  async function startGridGen() {
    let rows: number
    let cols: number
    let ids: Array<number | null>

    if (gridMode.value === 'multi_ref') {
      rows = gridAutoLayout.value.rows
      cols = gridAutoLayout.value.cols
      ids = [gridSingleTarget.value]
    } else {
      rows = gridAutoLayout.value.rows
      cols = gridAutoLayout.value.cols
      ids = gridSelected.value.slice(0, gridTotalCells.value)
      if (gridMode.value === 'first_last') ids = [...gridSelected.value]
    }

    gridActiveShotIds.value = ids.filter((id): id is number => Boolean(id))
    gridActualLayout.value = { rows, cols }
    if (!gridAssignmentsState.value.length) resetGridAssignments()
    gridStep.value = 2
    gridStatusText.value = input.episodeMessages.grid.submitting

    try {
      const response = await gridAPI.generate({
        storyboard_ids: ids,
        drama_id: input.dramaId,
        rows,
        cols,
        mode: gridMode.value,
        custom_prompt: gridPromptText.value || undefined,
      })
      gridGenId.value = response.image_generation_id
      gridActualLayout.value = response.grid || { rows, cols }
      gridStatusText.value = input.episodeMessages.grid.waitingImage
      void pollGridStatus()
    } catch (error: any) {
      toast.error(error.message)
      gridStep.value = 0
    }
  }

  async function pollGridStatus() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 3000))
      try {
        const response = await gridAPI.status(gridGenId.value)
        gridStatusText.value = input.t('episode.grid.status', { status: response.status })
        if (response.status === 'completed' && response.local_path) {
          gridImagePath.value = response.local_path
          gridGenId.value = gridGenId.value || response.id || null
          persistGridImagePath(response.local_path)
          gridStep.value = 3
          return
        }
        if (response.status === 'failed') {
          toast.error(response.error_msg || input.episodeMessages.grid.generationFailed)
          gridStep.value = 0
          return
        }
      } catch {}
    }

    toast.error(input.episodeMessages.grid.timeout)
    gridStep.value = 0
  }

  async function loadLatestGridImage() {
    try {
      const rows = await imageAPI.list({ drama_id: input.dramaId })
      const grids = rows
        .filter((row: any) => row?.status === 'completed' && String(row?.frame_type || row?.frameType || '').startsWith('grid_') && (row?.local_path || row?.localPath))
        .sort((left: any, right: any) => Number(right?.id || 0) - Number(left?.id || 0))
        .map((row: any) => {
          const frameType = String(row?.frame_type || row?.frameType || '')
          const parsedLayout = parseGridLayoutFromFrameType(frameType) || { rows: 3, cols: 3 }
          return {
            id: row.id,
            localPath: row?.local_path || row?.localPath || '',
            layout: parsedLayout,
            modeLabel: frameType.replace(/^grid_/, '').replace(/_/g, ' · '),
            createdAtLabel: row?.created_at || row?.createdAt || '',
          }
        })

      gridHistory.value = grids

      const cached = restoreGridState()
      const preferredPath = cached?.activeImagePath && grids.some(item => item.localPath === cached.activeImagePath)
        ? cached.activeImagePath
        : grids[0]?.localPath
      const current = grids.find(item => item.localPath === preferredPath)

      if (current) {
        const cachedEntry = cached?.entries?.[current.localPath] || {}
        applyGridState(current.localPath, {
          ...current,
          ...cachedEntry,
          generationId: cachedEntry.generationId || current.id,
          recoveredAt: cachedEntry.recoveredAt || current.createdAtLabel,
          recoveredMode: cachedEntry.recoveredMode || current.modeLabel,
        })
        if (!gridAssignmentsState.value.length) resetGridAssignments()
        persistGridImagePath(current.localPath)
        return
      }
    } catch {}

    const cached = restoreGridState()
    if (cached?.activeImagePath) {
      const cachedEntry = cached?.entries?.[cached.activeImagePath] || {}
      applyGridState(cached.activeImagePath, {
        ...cachedEntry,
        recoveredAt: cachedEntry.recoveredAt || '',
        recoveredMode: cachedEntry.recoveredMode || '',
      })
    }
  }

  async function doGridSplit() {
    const { rows, cols } = gridActualLayout.value
    try {
      const assignments = gridAssignments.value
        .filter(item => !!item.storyboard_id)
        .map(item => ({ storyboard_id: item.storyboard_id, frame_type: item.frame_type }))

      if (!assignments.length) {
        toast.warning(input.episodeMessages.grid.assignAtLeastOne)
        return
      }

      await gridAPI.split({
        image_generation_id: gridGenId.value,
        rows,
        cols,
        assignments,
      })
      persistGridImagePath(gridImagePath.value)
      gridStep.value = 4
      toast.success(input.episodeMessages.grid.splitDone)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  return {
    gridLayoutOptions,
    gridDialog,
    gridStep,
    gridLayout,
    gridMode,
    gridSelected,
    gridSingleTarget,
    gridGenId,
    gridImagePath,
    gridStatusText,
    gridActualLayout,
    gridRecoveredAt,
    gridRecoveredMode,
    gridPromptText,
    gridCellPrompts,
    gridPromptSource,
    gridPromptLoading,
    gridPromptStatus,
    gridAssignmentsState,
    gridActiveShotIds,
    gridHistory,
    showAllGridHistory,
    activeGridCell,
    gridAssignmentPage,
    gridStorageKey,
    gridModes,
    gridLayoutShape,
    gridTotalCells,
    gridCanStart,
    gridSummary,
    gridAssignments,
    gridAssignmentShotOptions,
    gridFrameTypeOptions,
    gridAssignedCount,
    gridAssignmentPageSize,
    gridAssignmentTotalPages,
    gridAssignmentPageStart,
    gridAssignmentPageEnd,
    pagedGridAssignments,
    gridOverlayStyle,
    gridAutoLayout,
    gridBlankStyle,
    getGridPromptSourceLabel,
    getGridHistoryToggleLabel,
    gridCellLabel,
    gridCellTitle,
    updateGridAssignment,
    focusGridCell,
    resetGridAssignments,
    gridSelectAll,
    openGridTool,
    selectGridHistory,
    reopenGridPreview,
    continueGridSplit,
    generateGridPrompt,
    startGridGen,
    loadLatestGridImage,
    doGridSplit,
  }
}
