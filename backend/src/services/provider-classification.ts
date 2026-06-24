export type ProviderAvailabilityStatus =
  | 'available'
  | 'quota_exceeded'
  | 'paid_plan_required'
  | 'invalid_key'
  | 'not_configured'
  | 'unknown_error'

export function classifyProviderIssue(input: {
  status?: number | null
  message?: string | null
  reachable?: boolean | null
}): ProviderAvailabilityStatus {
  const status = Number(input.status || 0)
  const message = String(input.message || '').toLowerCase()

  if (!input.reachable && !status && !message) return 'unknown_error'
  if (message.includes('not configured') || message.includes('no active') || message.includes('missing')) return 'not_configured'
  if (
    status === 429
    || message.includes('quota')
    || message.includes('rate limit')
    || message.includes('resource_exhausted')
    || message.includes('temporarily rate-limited')
    || message.includes('usage_limit_reached')
    || message.includes('usage limit has been reached')
    || message.includes('resets_in_seconds')
    || message.includes('no image-generation tool is available')
    || message.includes('sem uma ferramenta de geração de imagem')
  ) return 'quota_exceeded'
  if (
    message.includes('pre-paid credits')
    || message.includes('paid plan')
    || message.includes('billing')
    || message.includes('credit')
    || message.includes('payment')
  ) return 'paid_plan_required'
  if (
    status === 401
    || status === 403
    || message.includes('api key')
    || message.includes('authentication')
    || message.includes('unauthorized')
    || message.includes('forbidden')
    || message.includes('invalid key')
    || message.includes('key format is incorrect')
  ) return 'invalid_key'
  if (status >= 200 && status < 300) return 'available'
  return 'unknown_error'
}

export function normalizeProviderError(err: unknown) {
  if (err instanceof Error) return err.message
  return String(err || 'Unknown provider error')
}
