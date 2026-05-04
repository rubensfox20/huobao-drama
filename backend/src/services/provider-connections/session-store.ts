import { randomUUID } from 'node:crypto'
import type { ConnectableProvider } from './shared.js'

export type ProviderAuthSessionStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export type ProviderAuthSessionSnapshot = {
  sessionId: string
  providerId: ConnectableProvider
  flowType: string
  status: ProviderAuthSessionStatus
  stage: string
  mode?: string
  message?: string
  authUrl?: string
  verificationUri?: string
  userCode?: string
  details?: string
  accountLabel?: string
  createdAt: number
  updatedAt: number
}

const SESSION_STORE_KEY = Symbol.for('huobao-drama.provider-connection-sessions')

function getStore() {
  const root = globalThis as typeof globalThis & {
    [SESSION_STORE_KEY]?: Map<ConnectableProvider, ProviderAuthSessionSnapshot>
  }

  if (!root[SESSION_STORE_KEY]) {
    root[SESSION_STORE_KEY] = new Map()
  }

  return root[SESSION_STORE_KEY]!
}

export function listProviderRuntimeSessions() {
  return [...getStore().values()]
}

export function getProviderRuntimeSession(providerId: ConnectableProvider) {
  return getStore().get(providerId) || null
}

export function createProviderRuntimeSession(input: Omit<ProviderAuthSessionSnapshot, 'sessionId' | 'createdAt' | 'updatedAt'>) {
  const snapshot: ProviderAuthSessionSnapshot = {
    ...input,
    sessionId: randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  getStore().set(input.providerId, snapshot)
  return snapshot
}

export function updateProviderRuntimeSession(
  providerId: ConnectableProvider,
  patch: Partial<ProviderAuthSessionSnapshot> | ((current: ProviderAuthSessionSnapshot) => Partial<ProviderAuthSessionSnapshot>),
) {
  const current = getProviderRuntimeSession(providerId)
  if (!current) return null

  const delta = typeof patch === 'function' ? patch(current) : patch
  const next: ProviderAuthSessionSnapshot = {
    ...current,
    ...delta,
    updatedAt: Date.now(),
  }
  getStore().set(providerId, next)
  return next
}

export function clearProviderRuntimeSession(providerId: ConnectableProvider) {
  getStore().delete(providerId)
}
