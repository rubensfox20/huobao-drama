import { classifyProviderIssue } from './provider-classification.js'

type RateWindow = {
  timestamps: number[]
}

type CircuitState = {
  consecutiveFailures: number
  openUntil: number
  lastError: string
  updatedAt: number
}

const rateWindows = new Map<string, RateWindow>()
const circuitStates = new Map<string, CircuitState>()

const WINDOW_MS = 10_000
const LIMIT_PER_WINDOW = 12
const CIRCUIT_FAILURE_THRESHOLD = 3
const CIRCUIT_OPEN_MS = 45_000
const QUOTA_CIRCUIT_OPEN_MS = 10 * 60_000
const CIRCUIT_STATE_TTL_MS = 10 * 60_000

function makeKey(provider: string, operation: string) {
  return `${provider}:${operation}`
}

function pruneProviderGovernorState(now = Date.now()) {
  for (const [key, window] of rateWindows.entries()) {
    window.timestamps = window.timestamps.filter(timestamp => now - timestamp < WINDOW_MS)
    if (!window.timestamps.length) rateWindows.delete(key)
  }

  for (const [key, circuit] of circuitStates.entries()) {
    const open = circuit.openUntil > now
    const stale = now - circuit.updatedAt > CIRCUIT_STATE_TTL_MS
    if (!open && (circuit.consecutiveFailures === 0 || stale)) {
      circuitStates.delete(key)
    }
  }
}

export function assertProviderOperationAllowed(provider: string, operation: string) {
  const key = makeKey(provider, operation)
  const now = Date.now()
  pruneProviderGovernorState(now)

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
  circuitStates.delete(makeKey(provider, operation))
}

export function reportProviderOperationFailure(provider: string, operation: string, errorMessage: string, status?: number | null) {
  const key = makeKey(provider, operation)
  const classification = classifyProviderIssue({ status, message: errorMessage, reachable: true })
  const now = Date.now()
  if (classification === 'invalid_key' || classification === 'not_configured') {
    circuitStates.set(key, {
      consecutiveFailures: 0,
      openUntil: 0,
      lastError: errorMessage,
      updatedAt: now,
    })
    return
  }
  if (classification === 'quota_exceeded') {
    circuitStates.set(key, {
      consecutiveFailures: CIRCUIT_FAILURE_THRESHOLD,
      openUntil: extractResetTimeMs(errorMessage, now) || now + QUOTA_CIRCUIT_OPEN_MS,
      lastError: errorMessage,
      updatedAt: now,
    })
    return
  }

  const current = circuitStates.get(key) || {
    consecutiveFailures: 0,
    openUntil: 0,
    lastError: '',
    updatedAt: now,
  }
  const failures = current.consecutiveFailures + 1
  const openUntil = failures >= CIRCUIT_FAILURE_THRESHOLD
    ? now + CIRCUIT_OPEN_MS
    : 0

  circuitStates.set(key, {
    consecutiveFailures: failures,
    openUntil,
    lastError: errorMessage,
    updatedAt: now,
  })
}

function extractResetTimeMs(message: string, now: number) {
  const resetsAt = String(message).match(/"?resets_at"?\s*:\s*(\d{10,13})/i)?.[1]
  if (resetsAt) {
    const value = Number(resetsAt)
    const ms = value > 10_000_000_000 ? value : value * 1000
    if (Number.isFinite(ms) && ms > now) return ms
  }

  const resetsIn = String(message).match(/"?resets_in_seconds"?\s*:\s*(\d+)/i)?.[1]
  if (resetsIn) {
    const seconds = Number(resetsIn)
    if (Number.isFinite(seconds) && seconds > 0) return now + seconds * 1000
  }

  return 0
}

export function getProviderGovernorState(provider?: string) {
  pruneProviderGovernorState()
  const entries = Array.from(circuitStates.entries())
    .filter(([key]) => !provider || key.startsWith(`${provider}:`))
    .map(([key, value]) => ({ key, ...value }))
  return entries
}
