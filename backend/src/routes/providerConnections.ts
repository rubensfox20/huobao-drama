import { Hono } from 'hono'
import { badRequest, success } from '../utils/response.js'
import {
  cancelOpenAICodexConnection,
  disconnectOpenAICodexConnection,
  getOpenAICodexProviderSessionPayload,
  startOpenAICodexConnection,
  syncOpenAICodexSessionFromDisk,
} from '../services/provider-connections/openai-codex.js'
import {
  cancelGitHubCopilotConnection,
  disconnectGitHubCopilotConnection,
  getGitHubCopilotProviderSessionPayload,
  startGitHubCopilotConnection,
  syncGitHubCopilotSessionFromGh,
} from '../services/provider-connections/github-copilot.js'
import { listProviderConnections } from '../services/provider-connections/repository.js'
import { listProviderRuntimeSessions } from '../services/provider-connections/session-store.js'
import { parseJsonBody, z } from '../utils/validation.js'
import { requireAdminAuth } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminAuth)

const openAICodexStartSchema = z.object({
  mode: z.string().trim().min(1),
})

const githubCopilotStartSchema = z.object({
  mode: z.string().trim().min(1),
})

function sanitizeConnectionRecord(record: any) {
  if (!record) return record

  return {
    id: record.id,
    provider: record.provider,
    activeSource: record.activeSource || null,
    accountLabel: record.accountLabel || null,
    metadata: record.metadata || null,
    hasOAuthPayload: Boolean(record.oauthPayload),
    oauthPayload: record.oauthPayload ? {
      accountEmail: record.oauthPayload.accountEmail || null,
      accountName: record.oauthPayload.accountName || null,
      brokerBaseUrl: record.oauthPayload.brokerBaseUrl || null,
      modelsUrl: record.oauthPayload.modelsUrl || null,
      scopes: Array.isArray(record.oauthPayload.scopes) ? record.oauthPayload.scopes : [],
      oauthAuthMode: record.oauthPayload.oauthAuthMode || null,
      expiresIn: record.oauthPayload.expiresIn || null,
      tokenTimestamp: record.oauthPayload.tokenTimestamp || null,
      metadata: record.oauthPayload.metadata || null,
    } : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function normalizeOpenAICodexMode(mode?: string) {
  const normalized = String(mode || '').trim().toLowerCase()
  if (normalized === 'codex-local' || normalized === 'local' || normalized === 'use-existing') return 'local'
  if (normalized === 'codex-login' || normalized === 'login' || normalized === 'browser-auth') return 'login'
  if (normalized === 'codex-code' || normalized === 'code' || normalized === 'device-auth') return 'code'
  return null
}

function normalizeGitHubCopilotMode(mode?: string) {
  const normalized = String(mode || '').trim().toLowerCase()
  if (normalized === 'gh-cli' || normalized === 'local' || normalized === 'github-cli-local') return 'local'
  if (normalized === 'code' || normalized === 'device-flow' || normalized === 'github-device-flow') return 'code'
  return null
}

app.get('/status', async (c) => {
  return success(c, {
    connections: listProviderConnections().map(sanitizeConnectionRecord),
    runtime_sessions: listProviderRuntimeSessions(),
    providers: {
      'openai-codex': getOpenAICodexProviderSessionPayload(),
      'github-copilot': getGitHubCopilotProviderSessionPayload(),
    },
  })
})

app.get('/openai-codex/session', async (c) => {
  return success(c, getOpenAICodexProviderSessionPayload())
})

app.post('/openai-codex/start', async (c) => {
  const parsed = await parseJsonBody(c, openAICodexStartSchema)
  if (!parsed.ok) return parsed.response
  const mode = normalizeOpenAICodexMode(parsed.data.mode)
  if (!mode) return badRequest(c, 'mode invalido para OpenAI Codex')
  const session = await startOpenAICodexConnection(mode)
  return success(c, session)
})

app.post('/openai-codex/sync', async (c) => {
  const synced = await syncOpenAICodexSessionFromDisk({ force: true, activeSource: 'codex-local' })
  return success(c, {
    ...getOpenAICodexProviderSessionPayload(),
    synced,
  })
})

app.post('/openai-codex/cancel', async (c) => {
  return success(c, cancelOpenAICodexConnection())
})

app.post('/openai-codex/disconnect', async (c) => {
  return success(c, disconnectOpenAICodexConnection())
})

app.get('/github-copilot/session', async (c) => {
  return success(c, getGitHubCopilotProviderSessionPayload())
})

app.post('/github-copilot/start', async (c) => {
  const parsed = await parseJsonBody(c, githubCopilotStartSchema)
  if (!parsed.ok) return parsed.response
  const mode = normalizeGitHubCopilotMode(parsed.data.mode)
  if (!mode) return badRequest(c, 'mode invalido para GitHub Copilot')
  const session = await startGitHubCopilotConnection(mode)
  return success(c, session)
})

app.post('/github-copilot/sync', async (c) => {
  const synced = await syncGitHubCopilotSessionFromGh()
  return success(c, {
    ...getGitHubCopilotProviderSessionPayload(),
    synced,
  })
})

app.post('/github-copilot/cancel', async (c) => {
  return success(c, cancelGitHubCopilotConnection())
})

app.post('/github-copilot/disconnect', async (c) => {
  return success(c, disconnectGitHubCopilotConnection())
})

export default app
