export type AIServiceConfig = {
  id: number
  service_type: string
  provider: string
  name: string
  base_url: string
  model: string[]
  priority: number
  is_active: boolean
  has_api_key: boolean
  api_key_hint: string | null
  connection_status?: string
  connection_label?: string | null
}

export type AIConfigMutation = {
  service_type?: string
  provider?: string
  name?: string
  api_key?: string
  clear_api_key?: boolean
  base_url?: string
  model?: string[]
  priority?: number
  is_active?: boolean
}

export type AIConfigTestResult = {
  ok: boolean
  reachable: boolean
  status: number | null
  status_text?: string
  method?: string
  url?: string
  message?: string
  response_preview?: string
}

export type WorkflowJobRow = {
  id: number
  kind: string
  status: string
  related_entity_type?: string | null
  related_entity_id?: number | null
  provider?: string | null
  model?: string | null
  error_msg?: string | null
  output_summary?: string | null
}

export type PromptTemplateRecord = {
  id?: number
  key: string
  name: string
  description?: string | null
  category: string
  content: string
  variables: string[]
  version: number
  created_at?: string
}

export type PromptHistoryRecord = {
  id: number
  version: number
  action: string
  content: string
  variables: string[]
  created_at: string
}

export type ProviderConnectionSession = {
  connected?: boolean
  account_label?: string | null
  active_source?: string | null
  verification_uri?: string | null
  user_code?: string | null
  available_models?: string[]
  session?: {
    status?: string
    stage?: string
    message?: string
  }
}

export type ProviderConnectionsStatus = {
  connections: Array<Record<string, unknown>>
  runtime_sessions: Array<Record<string, unknown>>
  providers: Record<string, ProviderConnectionSession>
}

export type CanonicalPipelineState =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'needs_review'
  | 'complete'
  | 'not_applicable'

export type PipelineStageStatus =
  | 'pending'
  | 'ready'
  | 'partial'
  | 'done'
  | 'blocked'
  | 'running'
  | 'not_applicable'

export type PipelineIssue = {
  code: string
  severity: string
  message: string
  entityType?: string
  entityId?: number | null
  entity_type?: string
  entity_id?: number | null
}

export type PipelineStageSummary = {
  key: string
  state: CanonicalPipelineState
  status: PipelineStageStatus
  count?: number
  total?: number
  blocked?: boolean
  issues?: PipelineIssue[]
  meta?: Record<string, unknown>
}

export type EpisodePipelineStatus = {
  episodeId: number
  stages: Record<string, PipelineStageSummary>
  steps: Record<string, Record<string, unknown>>
  nextAction: { key: string; label: string } | null
}
