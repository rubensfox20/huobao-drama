import { classifyProviderIssue } from './provider-classification.js'

type RateWindow = {
  timestamps: number[]
}

type CircuitState = {
  consecutiveFailures: number
  openUntil: number
  lastError: string
}

const rateWindows = new Map<string, RateWindow>()
const circuitStates = new Map<string, CircuitState>()

const WINDOW_MS = 10_000
const LIMIT_PER_WINDOW = 12
const CIRCUIT_FAILURE_THRESHOLD = 3
const CIRCUIT_OPEN_MS = 45_000

function makeKey(provider: string, operation: string) {
  return `${provider}:${operation}`
}

export function assertProviderOperationAllowed(provider: string, operation: string) {
  const key = makeKey(provider, operation)
  const now = Date.now()

  const circuit = circuitStates.get(key)
  if (circuit && circuit.openUntil > now) {
    throw new Error(`Provider circuit open for ${provider}/${operation}: ${circuit.lastError || 'temporary upstream instability'}`)
  }

  const window = rateWindows.get(key) || { timestamps: [] }
  window.timestamps = window.timestamps.filter(timestamp => now - timestamp < WINDOW_MS)
  if (window.timestamps.length >= LIMIT_PER_WINDOW) {
    throw new Error(`Local rate limit reached for ${provider}/${operation}. Try again shortly.`)
  }
  window.timestamps.push(now)
  rateWindows.set(key, window)
}

export function reportProviderOperationSuccess(provider: string, operation: string) {
  circuitStates.set(makeKey(provider, operation), {
    consecutiveFailures: 0,
    openUntil: 0,
    lastError: '',
  })
}

export function reportProviderOperationFailure(provider: string, operation: string, errorMessage: string, status?: number | null) {
  const key = makeKey(provider, operation)
  const classification = classifyProviderIssue({ status, message: errorMessage, reachable: true })
  if (classification === 'invalid_key' || classification === 'not_configured') {
    circuitStates.set(key, {
      consecutiveFailures: 0,
      openUntil: 0,
      lastError: errorMessage,
    })
    return
  }

  const current = circuitStates.get(key) || {
    consecutiveFailures: 0,
    openUntil: 0,
    lastError: '',
  }
  const failures = current.consecutiveFailures + 1
  const openUntil = failures >= CIRCUIT_FAILURE_THRESHOLD
    ? Date.now() + CIRCUIT_OPEN_MS
    : 0

  circuitStates.set(key, {
    consecutiveFailures: failures,
    openUntil,
    lastError: errorMessage,
  })
}

export function getProviderGovernorState(provider?: string) {
  const entries = Array.from(circuitStates.entries())
    .filter(([key]) => !provider || key.startsWith(`${provider}:`))
    .map(([key, value]) => ({ key, ...value }))
  return entries
}
