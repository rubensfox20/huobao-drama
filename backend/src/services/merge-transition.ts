export type MergeTransitionKind = 'cut' | 'fade' | 'wipeleft' | 'slideright' | 'smoothleft' | 'circleopen'

export type MergeTransitionConfig = {
  kind: MergeTransitionKind
  label: string
  xfadeTransition: string | null
  durationSeconds: number
}

const DEFAULT_TRANSITION_DURATION_SECONDS = 0.35

const TRANSITIONS: Record<MergeTransitionKind, MergeTransitionConfig> = {
  cut: {
    kind: 'cut',
    label: 'cut',
    xfadeTransition: null,
    durationSeconds: 0,
  },
  fade: {
    kind: 'fade',
    label: 'fade',
    xfadeTransition: 'fade',
    durationSeconds: DEFAULT_TRANSITION_DURATION_SECONDS,
  },
  wipeleft: {
    kind: 'wipeleft',
    label: 'wipeleft',
    xfadeTransition: 'wipeleft',
    durationSeconds: DEFAULT_TRANSITION_DURATION_SECONDS,
  },
  slideright: {
    kind: 'slideright',
    label: 'slideright',
    xfadeTransition: 'slideright',
    durationSeconds: DEFAULT_TRANSITION_DURATION_SECONDS,
  },
  smoothleft: {
    kind: 'smoothleft',
    label: 'smoothleft',
    xfadeTransition: 'smoothleft',
    durationSeconds: DEFAULT_TRANSITION_DURATION_SECONDS,
  },
  circleopen: {
    kind: 'circleopen',
    label: 'circleopen',
    xfadeTransition: 'circleopen',
    durationSeconds: DEFAULT_TRANSITION_DURATION_SECONDS,
  },
}

export function resolveMergeTransition(kind?: string | null) {
  const normalized = String(kind || '').trim().toLowerCase() as MergeTransitionKind
  return TRANSITIONS[normalized] || TRANSITIONS.cut
}

export function canUseMergeTransition(durations: number[], transition: MergeTransitionConfig) {
  if (!transition.xfadeTransition || durations.length < 2) return false
  return durations.every((duration) => Number.isFinite(duration) && duration > transition.durationSeconds + 0.05)
}

export function getSafeMergeTransitionDuration(leftDuration: number, rightDuration: number, requestedDuration: number) {
  const safeRequested = Math.max(0, Number(requestedDuration || 0))
  const maxDuration = Math.min(
    Math.max(0, Number(leftDuration || 0) - 0.05),
    Math.max(0, Number(rightDuration || 0) - 0.05),
  )
  return Math.max(0, Math.min(safeRequested, maxDuration))
}
