import { Hono } from 'hono'
import { badRequest, success } from '../utils/response.js'
import { applyDiscoveryCandidate, getDiscoveryRun, runDiscovery } from '../services/discovery.js'
import { toSnakeCase } from '../utils/transform.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

app.post('/runs', async (c) => {
  const body = await c.req.json()
  const mode = body.mode === 'web' ? 'web' : 'no-web'
  const run = await runDiscovery({
    ideaId: body.idea_id != null ? Number(body.idea_id) : null,
    mode,
    query: body.query || '',
    sources: Array.isArray(body.sources) ? body.sources : [],
  })
  if (!run) return badRequest(c, 'Discovery run could not be created')
  return success(c, {
    ...toSnakeCase(run),
    candidates: (run?.candidates || []).map((candidate: any) => toSnakeCase(candidate)),
    sources: (run?.sources || []).map((source: any) => toSnakeCase(source)),
  })
})

app.get('/runs/:id', (c) => {
  const run = getDiscoveryRun(Number(c.req.param('id')))
  if (!run) return badRequest(c, 'Discovery run not found')
  return success(c, {
    ...toSnakeCase(run),
    candidates: (run.candidates || []).map((candidate: any) => toSnakeCase(candidate)),
    sources: (run.sources || []).map((source: any) => toSnakeCase(source)),
  })
})

app.post('/runs/:id/apply', async (c) => {
  const body = await c.req.json()
  if (!body.candidate_id) return badRequest(c, 'candidate_id is required')
  const drama = applyDiscoveryCandidate(Number(c.req.param('id')), Number(body.candidate_id), Number(body.total_episodes || 3))
  if (!drama) return badRequest(c, 'Candidate not found')
  return success(c, toSnakeCase(drama))
})

export default app
