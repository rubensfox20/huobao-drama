import crypto from 'node:crypto'
import type Database from 'better-sqlite3'

export const SEALED_SECRET_PREFIX = 'huobao:v1:'
const SEALED_SECRET_PATTERN = /^huobao:v1:[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
export const AI_CONFIG_API_KEY_PURPOSE = 'ai_service_configs.api_key'
export const PROVIDER_CONNECTION_OAUTH_PURPOSE = 'provider_connections.oauth_payload'

type SecretKeySource = {
  material: string
  source: 'HUOBAO_SECRET_KEY' | 'HUOBAO_ADMIN_TOKEN'
}

function getSecretKeySource(): SecretKeySource | null {
  const explicitKey = String(process.env.HUOBAO_SECRET_KEY || '').trim()
  if (explicitKey) return { material: explicitKey, source: 'HUOBAO_SECRET_KEY' }

  const adminToken = String(process.env.HUOBAO_ADMIN_TOKEN || '').trim()
  if (adminToken) return { material: adminToken, source: 'HUOBAO_ADMIN_TOKEN' }

  return null
}

export function hasSecretEncryptionKey() {
  return Boolean(getSecretKeySource())
}

function deriveEncryptionKey() {
  const source = getSecretKeySource()
  if (!source) {
    throw new Error('Set HUOBAO_SECRET_KEY or HUOBAO_ADMIN_TOKEN to encrypt stored secrets')
  }

  if (source.material.startsWith('base64:')) {
    const decoded = Buffer.from(source.material.slice('base64:'.length), 'base64')
    if (decoded.length === 32) return decoded
  }

  return crypto.createHash('sha256').update(source.material).digest()
}

export function isSealedSecret(value: string | null | undefined) {
  return SEALED_SECRET_PATTERN.test(String(value || ''))
}

export function sealSecret(value: string | null | undefined, purpose: string) {
  const plaintext = String(value || '')
  if (!plaintext) return plaintext
  if (!hasSecretEncryptionKey() && process.env.NODE_ENV !== 'production') return plaintext

  const key = deriveEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(purpose, 'utf8'))

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return `${SEALED_SECRET_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function openSecret(value: string | null | undefined, purpose: string) {
  const stored = String(value || '')
  if (!stored || !isSealedSecret(stored)) return stored

  const payload = stored.slice(SEALED_SECRET_PREFIX.length)
  const [ivValue, tagValue, encryptedValue] = payload.split('.')
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error('Stored secret payload is invalid')
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveEncryptionKey(), Buffer.from(ivValue, 'base64url'))
    decipher.setAAD(Buffer.from(purpose, 'utf8'))
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new Error('Stored secret could not be decrypted. Verify HUOBAO_SECRET_KEY')
  }
}

export function getSecretSummary(value: string | null | undefined, purpose: string) {
  const stored = String(value || '').trim()
  if (!stored) return { hasValue: false, value: '', encrypted: false, decryptable: true }

  if (!isSealedSecret(stored)) {
    return { hasValue: true, value: stored, encrypted: false, decryptable: true }
  }

  try {
    return { hasValue: true, value: openSecret(stored, purpose), encrypted: true, decryptable: true }
  } catch {
    return { hasValue: true, value: '', encrypted: true, decryptable: false }
  }
}

function sealExistingValue(value: string | null | undefined, purpose: string) {
  const stored = String(value || '')
  if (!stored || isSealedSecret(stored)) return stored
  return sealSecret(stored, purpose)
}

export function protectPersistedSecrets(sqlite: Database.Database) {
  if (!hasSecretEncryptionKey()) return

  const aiConfigRows = sqlite.prepare(`
    SELECT id, api_key as value
    FROM ai_service_configs
    WHERE api_key IS NOT NULL AND api_key != ''
  `).all() as Array<{ id: number; value: string }>

  const providerConnectionRows = sqlite.prepare(`
    SELECT id, oauth_payload as value
    FROM provider_connections
    WHERE oauth_payload IS NOT NULL AND oauth_payload != ''
  `).all() as Array<{ id: number; value: string }>

  const updateAIConfig = sqlite.prepare('UPDATE ai_service_configs SET api_key = ? WHERE id = ?')
  const updateProviderConnection = sqlite.prepare('UPDATE provider_connections SET oauth_payload = ? WHERE id = ?')

  const tx = sqlite.transaction(() => {
    for (const row of aiConfigRows) {
      const sealed = sealExistingValue(row.value, AI_CONFIG_API_KEY_PURPOSE)
      if (sealed !== row.value) updateAIConfig.run(sealed, row.id)
    }

    for (const row of providerConnectionRows) {
      const sealed = sealExistingValue(row.value, PROVIDER_CONNECTION_OAUTH_PURPOSE)
      if (sealed !== row.value) updateProviderConnection.run(sealed, row.id)
    }
  })

  tx()
}
