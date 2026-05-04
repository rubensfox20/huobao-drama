import { assertProviderOperationAllowed, reportProviderOperationFailure, reportProviderOperationSuccess } from './provider-governor.js'
import { normalizeProviderError } from './provider-classification.js'
import { recordProviderUsageEvent } from './provider-usage.js'

type ProviderExecutionInput = {
  workflowJobId?: number | null
  serviceType: string
  provider: string
  model?: string | null
  operation: string
  requestHash?: string | null
  metadata?: Record<string, unknown> | null
}

export async function runProviderOperation<T>(input: ProviderExecutionInput, task: () => Promise<T>) {
  assertProviderOperationAllowed(input.provider, input.operation)
  const startedAt = Date.now()
  recordProviderUsageEvent({
    workflowJobId: input.workflowJobId,
    serviceType: input.serviceType,
    provider: input.provider,
    model: input.model,
    operation: input.operation,
    requestHash: input.requestHash,
    status: 'started',
    metadata: input.metadata,
  })

  try {
    const result = await task()
    const latencyMs = Date.now() - startedAt
    recordProviderUsageEvent({
      workflowJobId: input.workflowJobId,
      serviceType: input.serviceType,
      provider: input.provider,
      model: input.model,
      operation: input.operation,
      requestHash: input.requestHash,
      status: 'completed',
      latencyMs,
      metadata: input.metadata,
    })
    reportProviderOperationSuccess(input.provider, input.operation)
    return result
  } catch (error) {
    const message = normalizeProviderError(error)
    const latencyMs = Date.now() - startedAt
    const status = extractStatusCode(message)
    recordProviderUsageEvent({
      workflowJobId: input.workflowJobId,
      serviceType: input.serviceType,
      provider: input.provider,
      model: input.model,
      operation: input.operation,
      requestHash: input.requestHash,
      status: 'failed',
      errorMsg: message,
      latencyMs,
      metadata: input.metadata,
    })
    reportProviderOperationFailure(input.provider, input.operation, message, status)
    throw error
  }
}

function extractStatusCode(message: string) {
  const match = String(message).match(/\b(4\d\d|5\d\d)\b/)
  return match ? Number(match[1]) : null
}
