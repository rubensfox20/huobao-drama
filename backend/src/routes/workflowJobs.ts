import { Hono } from 'hono'
import { success } from '../utils/response.js'
import { listWorkflowJobs } from '../services/workflow-jobs.js'
import { toSnakeCaseArray } from '../utils/transform.js'
import { parseQuery, z } from '../utils/validation.js'
import { requireAdminAuth } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminAuth)

const workflowJobQuerySchema = z.object({
  kind: z.string().optional(),
  status: z.string().optional(),
  related_entity_type: z.string().optional(),
  related_entity_id: z.coerce.number().int().positive().optional(),
  drama_id: z.coerce.number().int().positive().optional(),
  episode_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(200).optional().default(50),
})

app.get('/', (c) => {
  const parsed = parseQuery(c, workflowJobQuerySchema)
  if (!parsed.ok) return parsed.response
  const query = parsed.data

  const jobs = listWorkflowJobs({
    kind: query.kind,
    status: query.status,
    relatedEntityType: query.related_entity_type,
    relatedEntityId: query.related_entity_id,
    dramaId: query.drama_id,
    episodeId: query.episode_id,
  }, {
    page: query.page,
    pageSize: query.page_size,
  })
  return success(c, {
    items: toSnakeCaseArray(jobs.items),
    pagination: {
      page: jobs.pagination.page,
      page_size: jobs.pagination.pageSize,
      total: jobs.pagination.total,
      total_pages: jobs.pagination.totalPages,
    },
  })
})

export default app
