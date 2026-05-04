import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import {
  clearProviderConnection,
  getProviderConnection,
  upsertProviderConnection,
} from './repository.js'

describe('provider connection repository', () => {
  it('stores oauth payloads encrypted while returning usable tokens to services', () => {
    const previousSecretKey = process.env.HUOBAO_SECRET_KEY
    process.env.HUOBAO_SECRET_KEY = 'provider-connection-test-secret-key'
    clearProviderConnection('openai-codex')

    try {
      const record = upsertProviderConnection({
        provider: 'openai-codex',
        activeSource: 'codex-local',
        oauthPayload: {
          accessToken: 'access-token-secret',
          refreshToken: 'refresh-token-secret',
          accountEmail: 'user@example.com',
        },
        accountLabel: 'user@example.com',
      })

      expect(record?.oauthPayload?.accessToken).toBe('access-token-secret')

      const [rawRow] = db.select().from(schema.providerConnections)
        .where(eq(schema.providerConnections.provider, 'openai-codex'))
        .all()

      expect(rawRow).toBeTruthy()
      const storedPayload = String(rawRow!.oauthPayload)
      expect(storedPayload).toMatch(/^huobao:v1:/)
      expect(storedPayload).not.toContain('access-token-secret')
      expect(storedPayload).not.toContain('refresh-token-secret')

      const loaded = getProviderConnection('openai-codex')
      expect(loaded?.oauthPayload?.accessToken).toBe('access-token-secret')
      expect(loaded?.oauthPayload?.refreshToken).toBe('refresh-token-secret')
    } finally {
      clearProviderConnection('openai-codex')
      if (previousSecretKey === undefined) {
        delete process.env.HUOBAO_SECRET_KEY
      } else {
        process.env.HUOBAO_SECRET_KEY = previousSecretKey
      }
    }
  })
})
