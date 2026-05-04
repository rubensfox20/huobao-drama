import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { now } from '../../utils/response.js'
import { openSecret, PROVIDER_CONNECTION_OAUTH_PURPOSE, sealSecret } from '../../utils/secrets.js'
import type { ConnectableProvider, ProviderConnectionSource } from './shared.js'

function parseJson<T = any>(value?: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export type ProviderConnectionPayload = {
  accessToken?: string
  refreshToken?: string
  idToken?: string
  expiresIn?: number
  tokenTimestamp?: number
  accountEmail?: string
  accountName?: string
  brokerBaseUrl?: string
  modelsUrl?: string
  scopes?: string[]
  oauthAuthMode?: string
  platformApiSupported?: boolean
  metadata?: Record<string, unknown>
}

export type ProviderConnectionRecord = ReturnType<typeof normalizeProviderConnection>

function normalizeProviderConnection(row: any) {
  return {
    ...row,
    oauthPayload: parseJson<ProviderConnectionPayload>(openSecret(row.oauthPayload, PROVIDER_CONNECTION_OAUTH_PURPOSE)),
    metadata: parseJson<Record<string, unknown>>(row.metadata),
  }
}

export function listProviderConnections() {
  return db.select().from(schema.providerConnections).all().map(normalizeProviderConnection)
}

export function getProviderConnection(provider: ConnectableProvider) {
  const [row] = db.select().from(schema.providerConnections)
    .where(eq(schema.providerConnections.provider, provider))
    .all()
  return row ? normalizeProviderConnection(row) : null
}

export function upsertProviderConnection(input: {
  provider: ConnectableProvider
  activeSource?: ProviderConnectionSource | string | null
  oauthPayload?: ProviderConnectionPayload | null
  ignoredAuthSignature?: string | null
  accountLabel?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const existing = getProviderConnection(input.provider)
  const ts = now()
  const payload = {
    provider: input.provider,
    activeSource: input.activeSource ?? null,
    oauthPayload: input.oauthPayload
      ? sealSecret(JSON.stringify(input.oauthPayload), PROVIDER_CONNECTION_OAUTH_PURPOSE)
      : null,
    ignoredAuthSignature: input.ignoredAuthSignature ?? null,
    accountLabel: input.accountLabel ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    updatedAt: ts,
  }

  if (existing) {
    db.update(schema.providerConnections)
      .set(payload)
      .where(eq(schema.providerConnections.provider, input.provider))
      .run()
    return getProviderConnection(input.provider)
  }

  db.insert(schema.providerConnections).values({
    ...payload,
    createdAt: ts,
  }).run()

  return getProviderConnection(input.provider)
}

export function clearProviderConnection(provider: ConnectableProvider) {
  db.delete(schema.providerConnections)
    .where(eq(schema.providerConnections.provider, provider))
    .run()
}
