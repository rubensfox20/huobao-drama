import type { MiddlewareHandler } from 'hono'
import { unauthorized, serverError } from '../utils/response.js'

export const DEFAULT_LOCAL_ADMIN_TOKEN = 'huobao-local-admin'
export const ADMIN_SESSION_COOKIE = 'huobao_admin_session'

export function isProductionRuntime() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production'
}

export function resolveAdminToken() {
  const explicitToken = String(process.env.HUOBAO_ADMIN_TOKEN || '').trim()
  if (explicitToken) return explicitToken
  if (!isProductionRuntime()) return DEFAULT_LOCAL_ADMIN_TOKEN
  return null
}

function getCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') || ''
  if (!cookieHeader) return ''

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (rawName !== name) continue
    return decodeURIComponent(rawValue.join('=') || '')
  }

  return ''
}

export function getProvidedAdminToken(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim()
  }

  const headerToken = request.headers.get('x-admin-token')?.trim()
  if (headerToken) return headerToken

  return getCookieValue(request, ADMIN_SESSION_COOKIE)
}

export function isAuthorizedAdminRequest(request: Request) {
  const expectedToken = resolveAdminToken()
  if (!expectedToken) {
    return { authorized: false, reason: 'missing_expected_token' as const }
  }

  const providedToken = getProvidedAdminToken(request)
  if (!providedToken || providedToken !== expectedToken) {
    return { authorized: false, reason: 'invalid_token' as const }
  }

  return {
    authorized: true,
    reason: 'ok' as const,
    source: request.headers.get('authorization')
      ? 'authorization_header'
      : request.headers.get('x-admin-token')
        ? 'x-admin-token'
        : 'cookie',
  }
}

export const requireAdminAuth: MiddlewareHandler = async (c, next) => {
  const auth = isAuthorizedAdminRequest(c.req.raw)
  if (auth.reason === 'missing_expected_token') {
    return serverError(c, 'admin auth is not configured')
  }

  if (!auth.authorized) {
    return unauthorized(c, 'admin authorization required')
  }

  await next()
}

export function requireAdminForWriteMethods(
  methods: string[] = ['POST', 'PUT', 'PATCH', 'DELETE'],
): MiddlewareHandler {
  const protectedMethods = new Set(methods.map(method => method.toUpperCase()))

  return async (c, next) => {
    if (!protectedMethods.has(c.req.method.toUpperCase())) {
      await next()
      return
    }

    return requireAdminAuth(c, next)
  }
}
