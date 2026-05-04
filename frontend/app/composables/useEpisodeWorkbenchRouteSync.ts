import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

type TabDefinition = {
  id: string
}

type UseEpisodeWorkbenchRouteSyncInput = {
  route: any
  router: any
  panel: Ref<string>
  scriptStep: Ref<number>
  prodTab: Ref<string>
  prodTabDefs: ComputedRef<TabDefinition[]>
  selectedStoryboard: Ref<any>
}

export function useEpisodeWorkbenchRouteSync(input: UseEpisodeWorkbenchRouteSyncInput) {
  const routeSyncLock = ref(false)
  const routeSelectedShotId = computed(() => {
    const value = Number(input.route.query.shot || 0)
    return Number.isFinite(value) && value > 0 ? value : null
  })

  function applyWorkbenchRouteState() {
    if (routeSyncLock.value) return

    const stage = String(input.route.query.stage || '').trim().toLowerCase()
    if (stage === 'script' || stage === 'production' || stage === 'export') {
      input.panel.value = stage
    }

    const step = Number(input.route.query.step || Number.NaN)
    if (Number.isFinite(step) && step >= 0 && step <= 4) {
      input.scriptStep.value = step
    }

    const tab = String(input.route.query.tab || '').trim()
    if (tab && input.prodTabDefs.value.some((item) => item.id === tab)) {
      input.prodTab.value = tab
    }
  }

  async function syncWorkbenchRouteState() {
    if (routeSyncLock.value) return
    routeSyncLock.value = true
    try {
      const query = {
        ...input.route.query,
        stage: input.panel.value,
        step: input.panel.value === 'script' ? String(input.scriptStep.value) : undefined,
        tab: input.panel.value === 'production' ? String(input.prodTab.value) : undefined,
        shot: input.panel.value === 'production' && input.selectedStoryboard.value?.id
          ? String(input.selectedStoryboard.value.id)
          : undefined,
      }

      if (import.meta.client) {
        const resolved = input.router.resolve({ query })
        const currentUrl = input.route.fullPath
        const nextUrl = resolved.fullPath
        if (nextUrl !== currentUrl) {
          window.history.replaceState(window.history.state, '', nextUrl)
        }
        return
      }

      await input.router.replace({ query })
    } finally {
      routeSyncLock.value = false
    }
  }

  watch(() => input.route.query, () => {
    applyWorkbenchRouteState()
  }, { deep: true, immediate: true })

  watch(
    [input.panel, input.scriptStep, input.prodTab, () => input.selectedStoryboard.value?.id || null],
    () => { void syncWorkbenchRouteState() },
  )

  return {
    routeSelectedShotId,
  }
}
