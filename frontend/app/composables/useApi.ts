import type {
  AIConfigMutation,
  AIConfigTestResult,
  AIServiceConfig,
  PromptHistoryRecord,
  PromptTemplateRecord,
  ProviderConnectionsStatus,
  WorkflowJobRow,
} from '~/types/api'

const BASE = '/api/v1'
const DEFAULT_LOCAL_ADMIN_TOKEN = 'huobao-local-admin'
const ADMIN_AUTH_REQUIRED_MESSAGE = 'Sessao administrativa necessaria. Abra Configuracoes e autentique-se.'
const DEFAULT_OBSERVABILITY_PAGE_SIZE = 50
const DEFAULT_ASSET_HISTORY_PAGE_SIZE = 120

function isLocalHost() {
  if (!import.meta.client) return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

function resolveAdminToken() {
  if (isLocalHost()) return DEFAULT_LOCAL_ADMIN_TOKEN
  return ''
}

function buildHeaders(includeJson = true): HeadersInit {
  const headers: Record<string, string> = {}
  if (includeJson) headers['Content-Type'] = 'application/json'
  const adminToken = resolveAdminToken()
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`
  return headers
}

async function parseJsonResponse(resp: Response) {
  const contentType = resp.headers.get('content-type') || ''
  const raw = await resp.text()

  if (!raw.trim()) {
    throw new Error(`Empty response body (${resp.status} ${contentType || 'unknown content-type'})`)
  }

  try {
    return JSON.parse(raw)
  } catch {
    const preview = raw.length > 300 ? `${raw.slice(0, 300)}...` : raw
    throw new Error(`Invalid JSON response (${resp.status} ${contentType || 'unknown content-type'}): ${preview}`)
  }
}

async function req<T = any>(method: string, path: string, body?: any): Promise<T> {
  const opts: RequestInit = { method, headers: buildHeaders(true), credentials: 'same-origin' }
  if (body) opts.body = JSON.stringify(body)

  const start = performance.now()
  console.log(`%c[API] %c${method} %c${path}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc')

  try {
    const resp = await fetch(`${BASE}${path}`, opts)
    const json = await parseJsonResponse(resp)
    const ms = Math.round(performance.now() - start)

    if (!resp.ok || (json.code && json.code >= 400)) {
      const message = resp.status === 401 && json.message === 'admin authorization required'
        ? ADMIN_AUTH_REQUIRED_MESSAGE
        : json.message || `${resp.status}`
      console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', json.message || '')
      throw new Error(message)
    }

    console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return json.data ?? json
  } catch (err: any) {
    if (!err.message?.match(/^\d{3}$/)) {
      const ms = Math.round(performance.now() - start)
      console.log(`%c[API] %c${method} ${path} %cERROR %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', err.message)
    }
    throw err
  }
}

async function uploadReq<T = any>(path: string, formData: FormData): Promise<T> {
  const start = performance.now()
  console.log(`%c[API] %cPOST %c${path}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', '[multipart]')

  try {
    const resp = await fetch(`${BASE}${path}`, {
      method: 'POST',
      body: formData,
      headers: buildHeaders(false),
      credentials: 'same-origin',
    })
    const json = await parseJsonResponse(resp)
    const ms = Math.round(performance.now() - start)

    if (!resp.ok || (json.code && json.code >= 400)) {
      const message = resp.status === 401 && json.message === 'admin authorization required'
        ? ADMIN_AUTH_REQUIRED_MESSAGE
        : json.message || `${resp.status}`
      console.log(`%c[API] %cPOST ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', json.message || '')
      throw new Error(message)
    }

    console.log(`%c[API] %cPOST ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return json.data ?? json
  } catch (err: any) {
    if (!err.message?.match(/^\d{3}$/)) {
      const ms = Math.round(performance.now() - start)
      console.log(`%c[API] %cPOST ${path} %cERROR %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', err.message)
    }
    throw err
  }
}

function unwrapPaginatedItems<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items as T[]
  return []
}

export const api = {
  get: <T = any>(p: string) => req<T>('GET', p),
  post: <T = any>(p: string, b?: any) => req<T>('POST', p, b),
  put: <T = any>(p: string, b?: any) => req<T>('PUT', p, b),
  del: <T = any>(p: string) => req<T>('DELETE', p),
}

export const healthAPI = {
  get: () => api.get('/health'),
}

export const adminSessionAPI = {
  get: () => api.get<{ authenticated: boolean; source: string }>('/admin/session'),
  login: (token: string) => api.post<{ authenticated: boolean; source: string }>('/admin/session', { token }),
  logout: () => api.del<{ authenticated: boolean; source: string }>('/admin/session'),
}

export const dramaAPI = {
  list: () => api.get<{ items: any[] }>('/dramas'),
  get: (id: number) => api.get(`/dramas/${id}`),
  create: (data: any) => api.post('/dramas', data),
  update: (id: number, data: any) => api.put(`/dramas/${id}`, data),
  del: (id: number) => api.del(`/dramas/${id}`),
}

export const episodeAPI = {
  create: (data: any) => api.post('/episodes', data),
  update: (id: number, data: any) => api.put(`/episodes/${id}`, data),
  characters: (id: number) => api.get(`/episodes/${id}/characters`),
  scenes: (id: number) => api.get(`/episodes/${id}/scenes`),
  props: (id: number) => api.get(`/episodes/${id}/props`),
  storyboards: (id: number) => api.get(`/episodes/${id}/storyboards`),
  pipelineStatus: (id: number) => api.get(`/episodes/${id}/pipeline-status`),
  validation: (id: number, stage: string) => api.get(`/episodes/${id}/validation?stage=${encodeURIComponent(stage)}`),
  orchestrate: (id: number, data?: { target?: 'storyboard_review' | 'publish_ready' }) => api.post(`/episodes/${id}/orchestrate`, data || {}),
}

export const storyboardAPI = {
  create: (data: any) => api.post('/storyboards', data),
  update: (id: number, data: any) => api.put(`/storyboards/${id}`, data),
  generateTTS: (id: number) => api.post(`/storyboards/${id}/generate-tts`),
  del: (id: number) => api.del(`/storyboards/${id}`),
}

export const characterAPI = {
  update: (id: number, data: any) => api.put(`/characters/${id}`, data),
  voiceSample: (id: number, episodeId: number) => api.post(`/characters/${id}/generate-voice-sample`, { episode_id: episodeId }),
  generateImage: (id: number, episodeId: number, prompt?: string) => api.post(`/characters/${id}/generate-image`, { episode_id: episodeId, prompt }),
  batchImages: (items: Array<{ id: number; prompt?: string }>, episodeId: number) => api.post('/characters/batch-generate-images', { items, character_ids: items.map(item => item.id), episode_id: episodeId }),
}

export const sceneAPI = {
  update: (id: number, data: any) => api.put(`/scenes/${id}`, data),
  generateImage: (id: number, episodeId: number, prompt?: string) => api.post(`/scenes/${id}/generate-image`, { episode_id: episodeId, prompt }),
}

export const imageAPI = {
  generate: (d: any) => api.post('/images', d),
  list: async (params?: { drama_id?: number; storyboard_id?: number; status?: string; page?: number; page_size?: number }) => {
    const query = new URLSearchParams()
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    if (params?.status) query.set('status', params.status)
    query.set('page', String(params?.page || 1))
    query.set('page_size', String(params?.page_size || DEFAULT_ASSET_HISTORY_PAGE_SIZE))
    const response = await api.get(`/images${query.size ? `?${query.toString()}` : ''}`)
    return unwrapPaginatedItems(response)
  },
}
export const gridAPI = {
  prompt: (d: any) => api.post('/grid/prompt', d),
  generate: (d: any) => api.post('/grid/generate', d),
  status: (id: number) => api.get(`/grid/status/${id}`),
  split: (d: any) => api.post('/grid/split', d),
}
export const videoAPI = {
  generate: (d: any) => api.post('/videos', d),
  get: (id: number) => api.get(`/videos/${id}`),
  list: async (params?: { drama_id?: number; storyboard_id?: number; status?: string; page?: number; page_size?: number }) => {
    const query = new URLSearchParams()
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    if (params?.status) query.set('status', params.status)
    query.set('page', String(params?.page || 1))
    query.set('page_size', String(params?.page_size || DEFAULT_ASSET_HISTORY_PAGE_SIZE))
    const response = await api.get(`/videos${query.size ? `?${query.toString()}` : ''}`)
    return unwrapPaginatedItems(response)
  },
}
export const uploadAPI = {
  image: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return uploadReq('/upload/image', form)
  },
  video: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return uploadReq('/upload/video', form)
  },
  audio: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return uploadReq('/upload/audio', form)
  },
  audioWithMeta: (file: File, meta?: Record<string, any>) => {
    const form = new FormData()
    form.append('file', file)
    for (const [key, value] of Object.entries(meta || {})) {
      if (value == null || value === '') continue
      form.append(key, String(value))
    }
    return uploadReq('/upload/audio', form)
  },
}
export const composeAPI = {
  shot: (id: number) => api.post(`/compose/storyboards/${id}/compose`),
  all: (epId: number) => api.post(`/compose/episodes/${epId}/compose-all`),
  status: (epId: number) => api.get(`/compose/episodes/${epId}/compose-status`),
}
export const mergeAPI = {
  merge: (epId: number, data?: { transition?: string }) => api.post(`/merge/episodes/${epId}/merge`, data || {}),
  status: (epId: number) => api.get(`/merge/episodes/${epId}/merge`),
  mergeDrama: (dramaId: number, data?: { transition?: string }) => api.post(`/merge/dramas/${dramaId}/merge`, data || {}),
  statusDrama: (dramaId: number) => api.get(`/merge/dramas/${dramaId}/merge`),
}
export const aiConfigAPI = {
  list: (t?: string) => api.get<AIServiceConfig[]>(`/ai-configs${t ? `?service_type=${t}` : ''}`),
  create: (d: AIConfigMutation & { service_type: string; provider: string }) => api.post<AIServiceConfig>('/ai-configs', d),
  update: (id: number, d: AIConfigMutation) => api.put<AIServiceConfig>(`/ai-configs/${id}`, d),
  del: (id: number) => api.del(`/ai-configs/${id}`),
  test: (d: AIConfigMutation & { service_type: string; provider: string }) => api.post<AIConfigTestResult>('/ai-configs/test', d),
  testSaved: (id: number) => api.post<AIConfigTestResult>(`/ai-configs/${id}/test`, {}),
}

export const agentConfigAPI = {
  list: () => api.get('/agent-configs'),
  get: (id: number) => api.get(`/agent-configs/${id}`),
  create: (d: any) => api.post('/agent-configs', d),
  update: (id: number, d: any) => api.put(`/agent-configs/${id}`, d),
  del: (id: number) => api.del(`/agent-configs/${id}`),
}

export const skillsAPI = {
  list: () => api.get('/skills'),
  get: (id: string) => api.get(`/skills/${id}`),
  create: (data: { id: string; name: string; description?: string }) => api.post('/skills', data),
  update: (id: string, content: string) => api.put(`/skills/${id}`, { content }),
  del: (id: string) => api.del(`/skills/${id}`),
}

export const voicesAPI = {
  list: (provider?: string) => api.get(`/ai-voices${provider ? `?provider=${provider}` : ''}`),
  sync: () => api.post('/ai-voices/sync', {}),
}

export const workflowJobsAPI = {
  list: async (params?: { kind?: string; status?: string; related_entity_type?: string; related_entity_id?: number; episode_id?: number; drama_id?: number; page?: number; page_size?: number }) => {
    const query = new URLSearchParams()
    if (params?.kind) query.set('kind', params.kind)
    if (params?.status) query.set('status', params.status)
    if (params?.related_entity_type) query.set('related_entity_type', params.related_entity_type)
    if (params?.related_entity_id != null) query.set('related_entity_id', String(params.related_entity_id))
    if (params?.episode_id != null) query.set('episode_id', String(params.episode_id))
    if (params?.drama_id != null) query.set('drama_id', String(params.drama_id))
    query.set('page', String(params?.page || 1))
    query.set('page_size', String(params?.page_size || DEFAULT_OBSERVABILITY_PAGE_SIZE))
    const response = await api.get(`/workflow-jobs${query.size ? `?${query.toString()}` : ''}`)
    return unwrapPaginatedItems<WorkflowJobRow>(response)
  },
}

export const systemHealthAPI = {
  get: () => api.get('/system-health'),
}

export const promptTemplatesAPI = {
  list: () => api.get<PromptTemplateRecord[]>('/prompts'),
  save: (data: { key: string; name?: string; description?: string; content: string; variables?: string[] }) => api.post<PromptTemplateRecord>('/prompts', data),
  reset: (key: string) => api.post(`/prompts/${encodeURIComponent(key)}/reset`, {}),
  history: (key: string) => api.get<PromptHistoryRecord[]>(`/prompts/${encodeURIComponent(key)}/history`),
  restore: (key: string, historyId: number) => api.post(`/prompts/${encodeURIComponent(key)}/restore`, { history_id: historyId }),
  test: (content: string, variables: Record<string, any>) => api.post('/prompts/test', { content, variables }),
}

export const providerAvailabilityAPI = {
  get: (provider: string) => api.get(`/provider-availability/${encodeURIComponent(provider)}`),
}

export const providerConnectionsAPI = {
  status: () => api.get<ProviderConnectionsStatus>('/provider-connections/status'),
  codexSession: () => api.get('/provider-connections/openai-codex/session'),
  codexStart: (mode: string) => api.post('/provider-connections/openai-codex/start', { mode }),
  codexSync: () => api.post('/provider-connections/openai-codex/sync', {}),
  codexCancel: () => api.post('/provider-connections/openai-codex/cancel', {}),
  codexDisconnect: () => api.post('/provider-connections/openai-codex/disconnect', {}),
  copilotSession: () => api.get('/provider-connections/github-copilot/session'),
  copilotStart: (mode: string) => api.post('/provider-connections/github-copilot/start', { mode }),
  copilotSync: () => api.post('/provider-connections/github-copilot/sync', {}),
  copilotCancel: () => api.post('/provider-connections/github-copilot/cancel', {}),
  copilotDisconnect: () => api.post('/provider-connections/github-copilot/disconnect', {}),
}

export const audioCuesAPI = {
  list: (scopeType: string, scopeId: number) => api.get(`/audio-cues?scope_type=${encodeURIComponent(scopeType)}&scope_id=${scopeId}`),
  create: (data: any) => api.post('/audio-cues', data),
  update: (id: number, data: any) => api.put(`/audio-cues/${id}`, data),
  del: (id: number) => api.del(`/audio-cues/${id}`),
}

export const ideasAPI = {
  list: () => api.get('/ideas'),
  create: (data: any) => api.post('/ideas', data),
  del: (id: number) => api.del(`/ideas/${id}`),
}

export const discoveryAPI = {
  run: (data: any) => api.post('/discovery/runs', data),
  get: (id: number) => api.get(`/discovery/runs/${id}`),
  apply: (id: number, data: any) => api.post(`/discovery/runs/${id}/apply`, data),
}
