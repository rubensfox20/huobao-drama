type ComposeDurationInput = {
  sourceKind: 'image' | 'video'
  plannedDuration?: number | null
  sourceDuration?: number | null
  ttsDuration?: number | null
  hasSpokenAudio?: boolean
}

const MIN_COMPOSE_DURATION_SECONDS = 0.5
const DEFAULT_COMPOSE_DURATION_SECONDS = 10

function asPositiveNumber(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

export function getStoryboardComposeDuration(input: ComposeDurationInput) {
  const plannedDuration = asPositiveNumber(input.plannedDuration)
  const sourceDuration = asPositiveNumber(input.sourceDuration)
  const ttsDuration = asPositiveNumber(input.ttsDuration)
  const hasSpokenAudio = Boolean(input.hasSpokenAudio && ttsDuration > 0)

  if (hasSpokenAudio) {
    return Math.max(MIN_COMPOSE_DURATION_SECONDS, ttsDuration)
  }

  if (plannedDuration > 0) {
    return Math.max(MIN_COMPOSE_DURATION_SECONDS, plannedDuration)
  }

  if (input.sourceKind === 'video' && sourceDuration > 0) {
    return Math.max(MIN_COMPOSE_DURATION_SECONDS, sourceDuration)
  }

  return DEFAULT_COMPOSE_DURATION_SECONDS
}
