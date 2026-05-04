import { deleteCookie, setCookie } from 'hono/cookie'
import { Hono } from 'hono'
import { badRequest, success, unauthorized } from '../utils/response.js'
import {
  ADMIN_SESSION_COOKIE,
  getProvidedAdminToken,
  isAuthorizedAdminRequest,
  isProductionRuntime,
  resolveAdminToken,
} from '../middleware/admin-auth.js'
import { parseJsonBody, z } from '../utils/validation.js'

const app = new Hono()

const adminSessionSchema = z.object({
  token: z.string().trim().min(1),
})

function getSessionPayload(request: Request) {
  const expectedToken = resolveAdminToken()
  if (!expectedToken) {
    return {
      authenticated: false,
      source: 'unconfigured',
    }
  }

  const auth = isAuthorizedAdminRequest(request)
  if (!auth.authorized) {
    return {
      authenticated: false,
      source: 'none',
    }
  }

  return {
    authenticated: true,
    source: auth.source || 'unknown',
  }
}

app.get('/', (c) => {
  return success(c, getSessionPayload(c.req.raw))
})

app.post('/', async (c) => {
  const parsed = await parseJsonBody(c, adminSessionSchema)
  if (!parsed.ok) return parsed.response

  const expectedToken = resolveAdminToken()
  if (!expectedToken) return badRequest(c, 'admin auth is not configured')
  if (parsed.data.token !== expectedToken) return unauthorized(c, 'admin authorization required')

  setCookie(c, ADMIN_SESSION_COOKIE, expectedToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'Strict',
    secure: isProductionRuntime(),
    maxAge: 60 * 60 * 12,
  })

  return success(c, {
    authenticated: true,
    source: getProvidedAdminToken(c.req.raw) ? 'header' : 'session_cookie',
  })
})

app.delete('/', (c) => {
  deleteCookie(c, ADMIN_SESSION_COOKIE, {
    httpOnly: true,
    path: '/',
    sameSite: 'Strict',
    secure: isProductionRuntime(),
  })

  return success(c, { authenticated: false, source: 'none' })
})

export default app
