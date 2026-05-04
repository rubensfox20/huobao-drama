import { Hono, type Context } from 'hono'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { badRequest, success } from '../utils/response.js'
import { requireAdminAuth } from '../middleware/admin-auth.js'
import { parseJsonBody, z } from '../utils/validation.js'

const app = new Hono()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = path.resolve(__dirname, '../../../skills')
const SKILLS_ROOT = path.resolve(SKILLS_DIR)

const skillCreateSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
})

const skillUpdateSchema = z.object({
  content: z.string(),
})

app.use('*', requireAdminAuth)

function normalizeSkillId(rawId: string) {
  const skillId = String(rawId || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const validPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)*$/

  if (!skillId || !validPattern.test(skillId)) {
    throw new Error('Invalid skill id')
  }

  return skillId
}

function resolveSkillPaths(rawId: string) {
  const id = normalizeSkillId(rawId)
  const skillDir = path.resolve(SKILLS_ROOT, id)
  const safeRoot = `${SKILLS_ROOT}${path.sep}`
  if (skillDir !== SKILLS_ROOT && !skillDir.startsWith(safeRoot)) {
    throw new Error('Invalid skill path')
  }

  return {
    id,
    skillDir,
    skillPath: path.join(skillDir, 'SKILL.md'),
  }
}

function getSkillIdFromWildcard(c: Context) {
  const raw = c.req.param('*')
  if (typeof raw === 'string' && raw.trim()) return raw
  return c.req.path.slice('/api/v1/skills/'.length)
}

// GET /skills — List all skills (recursive, supports nested dirs)
app.get('/', async (c) => {
  const skills: { id: string; name: string; description: string }[] = []

  if (!fs.existsSync(SKILLS_ROOT)) {
    return success(c, skills)
  }

  function scanDir(dir: string, prefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const fullPath = path.join(dir, entry.name)
      const skillPath = path.join(fullPath, 'SKILL.md')
      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, 'utf-8')
        const nameMatch = content.match(/^name:\s*(.+)$/m)
        const descMatch = content.match(/^description:\s*(.+)$/m)
        const id = prefix ? `${prefix}/${entry.name}` : entry.name
        skills.push({
          id,
          name: nameMatch ? nameMatch[1].trim() : entry.name,
          description: descMatch ? descMatch[1].trim() : '',
        })
      }
      scanDir(fullPath, prefix ? `${prefix}/${entry.name}` : entry.name)
    }
  }

  scanDir(SKILLS_ROOT)
  return success(c, skills)
})

// GET /skills/:id — Get skill content
app.get('/*', async (c) => {
  try {
    const { id, skillPath } = resolveSkillPaths(getSkillIdFromWildcard(c))
    if (!fs.existsSync(skillPath)) return badRequest(c, 'Skill not found')
    const content = fs.readFileSync(skillPath, 'utf-8')
    return success(c, { id, content })
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : 'Invalid skill id')
  }
})

// PUT /skills/:id — Update skill content
app.put('/*', async (c) => {
  const bodyResult = await parseJsonBody(c, skillUpdateSchema)
  if (!bodyResult.ok) return bodyResult.response

  try {
    const { skillDir, skillPath } = resolveSkillPaths(getSkillIdFromWildcard(c))
    if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(skillPath, bodyResult.data.content, 'utf-8')
    return success(c)
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : 'Invalid skill id')
  }
})

// POST /skills — Create new skill directory
app.post('/', async (c) => {
  const bodyResult = await parseJsonBody(c, skillCreateSchema)
  if (!bodyResult.ok) return bodyResult.response

  try {
    const { id, skillDir } = resolveSkillPaths(bodyResult.data.id)
    if (fs.existsSync(skillDir)) return badRequest(c, 'Skill already exists')

    fs.mkdirSync(skillDir, { recursive: true })
    const content = `---
name: ${bodyResult.data.name || id}
description: ${bodyResult.data.description || ''}
---

# ${bodyResult.data.name || id}

Write your skill content here.
`
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8')
    return success(c, { id, name: bodyResult.data.name || id, description: bodyResult.data.description || '' })
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : 'Invalid skill id')
  }
})

// DELETE /skills/:id — Delete skill directory
app.delete('/*', async (c) => {
  try {
    const { skillDir } = resolveSkillPaths(getSkillIdFromWildcard(c))
    if (!fs.existsSync(skillDir)) return badRequest(c, 'Skill not found')
    fs.rmSync(skillDir, { recursive: true, force: true })
    return success(c)
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : 'Invalid skill id')
  }
})

export default app
