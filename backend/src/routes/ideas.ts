import { Hono } from 'hono'
import { desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { badRequest, created, now, success } from '../utils/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

app.get('/', (c) => {
  const ideas = db.select().from(schema.ideas)
    .where(isNull(schema.ideas.deletedAt))
    .orderBy(desc(schema.ideas.updatedAt))
    .all()
  return success(c, toSnakeCaseArray(ideas))
})

app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.title) return badRequest(c, 'title is required')
  const ts = now()
  const result = db.insert(schema.ideas).values({
    title: String(body.title),
    description: body.description || null,
    genre: body.genre || null,
    tone: body.tone || null,
    language: body.language || 'pt-BR',
    status: body.status || 'draft',
    seedPrompt: body.seed_prompt || null,
    metadata: body.metadata ? JSON.stringify(body.metadata) : null,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const [idea] = db.select().from(schema.ideas).where(eq(schema.ideas.id, Number(result.lastInsertRowid))).all()
  return created(c, toSnakeCase(idea))
})

app.delete('/:id', (c) => {
  const id = Number(c.req.param('id'))
  db.update(schema.ideas).set({ deletedAt: now(), updatedAt: now() }).where(eq(schema.ideas.id, id)).run()
  return success(c)
})

export default app
