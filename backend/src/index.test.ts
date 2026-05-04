import { describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { buildApp } from './index.js'
import { db, schema } from './db/index.js'
import { recoverOrphanedGenerationRecords } from './services/workflow-jobs.js'
import { revealAIConfigApiKey } from './services/ai-configs.js'
import { logTaskPayload } from './utils/task-logger.js'

const adminHeaders = {
  Authorization: 'Bearer huobao-local-admin',
}

async function createDrama(app: ReturnType<typeof buildApp>, suffix: string, totalEpisodes = 1) {
  const response = await app.request('/api/v1/dramas', {
    method: 'POST',
    headers: {
      ...adminHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `test-drama-${suffix}`,
      total_episodes: totalEpisodes,
    }),
  })
  expect(response.status).toBe(201)
  const json = await response.json()
  return Number(json.data.id)
}

async function deleteDrama(app: ReturnType<typeof buildApp>, dramaId: number) {
  await app.request(`/api/v1/dramas/${dramaId}`, {
    method: 'DELETE',
    headers: adminHeaders,
  })
}

async function getDrama(app: ReturnType<typeof buildApp>, dramaId: number) {
  const response = await app.request(`/api/v1/dramas/${dramaId}`, {
    headers: adminHeaders,
  })
  expect(response.status).toBe(200)
  const json = await response.json()
  return json.data
}

describe('buildApp', () => {
  it('serves health endpoint', async () => {
    const app = buildApp()
    const response = await app.request('/api/v1/health')
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.status).toBe('ok')
  })

  it('serves prompts endpoint', async () => {
    const app = buildApp()
    const response = await app.request('/api/v1/prompts', { headers: adminHeaders })
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.data.length).toBeGreaterThan(0)
  })

  it('serves workflow jobs filtered by episode', async () => {
    const app = buildApp()
    const response = await app.request('/api/v1/workflow-jobs?episode_id=1&page_size=1', { headers: adminHeaders })
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(Array.isArray(json.data.items)).toBe(true)
    expect(json.data.pagination).toMatchObject({ page: 1, page_size: 1 })
  })

  it('serves episode validation endpoint', async () => {
    const app = buildApp()
    const response = await app.request('/api/v1/episodes/1/validation?stage=compose')
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.data).toHaveProperty('stage', 'compose')
    expect(Array.isArray(json.data.issues)).toBe(true)
  })

  it('protects administrative endpoints with bearer auth', async () => {
    const app = buildApp()
    const response = await app.request('/api/v1/prompts')
    const json = await response.json()
    expect(response.status).toBe(401)
    expect(json.message).toBe('admin authorization required')
  })

  it('creates admin session cookies when the token is valid', async () => {
    const app = buildApp()
    const response = await app.request('/api/v1/admin/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: 'huobao-local-admin',
      }),
    })
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.data).toMatchObject({ authenticated: true })
    expect(response.headers.get('set-cookie')).toContain('huobao_admin_session=')
  })

  it('protects sensitive write endpoints that trigger generation', async () => {
    const app = buildApp()
    const response = await app.request('/api/v1/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'test prompt',
      }),
    })
    const json = await response.json()
    expect(response.status).toBe(401)
    expect(json.message).toBe('admin authorization required')
  })

  it('requires webhook auth in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    const previousWebhookToken = process.env.HUOBAO_WEBHOOK_TOKEN
    process.env.NODE_ENV = 'production'
    delete process.env.HUOBAO_WEBHOOK_TOKEN

    try {
      const app = buildApp()
      const response = await app.request('/webhooks/vidu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_id: 'vidu-missing-token',
          state: 'failed',
        }),
      })
      const json = await response.json()
      expect(response.status).toBe(500)
      expect(json.message).toBe('webhook auth is not configured')
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
      if (previousWebhookToken === undefined) delete process.env.HUOBAO_WEBHOOK_TOKEN
      else process.env.HUOBAO_WEBHOOK_TOKEN = previousWebhookToken
    }
  })

  it('protects vidu webhook callbacks with a shared token and fails linked workflow jobs', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    const previousWebhookToken = process.env.HUOBAO_WEBHOOK_TOKEN
    process.env.NODE_ENV = 'production'
    process.env.HUOBAO_WEBHOOK_TOKEN = 'vidu-test-token'

    const app = buildApp()
    const ts = new Date().toISOString()
    const workflowJob = db.insert(schema.workflowJobs).values({
      kind: 'video_generate',
      status: 'running',
      relatedEntityType: 'storyboard',
      relatedEntityId: 904001,
      dramaId: 880004,
      provider: 'vidu',
      model: 'viduq3-turbo',
      inputSummary: 'vidu webhook test',
      createdAt: ts,
      updatedAt: ts,
    }).run()
    const videoGeneration = db.insert(schema.videoGenerations).values({
      dramaId: 880004,
      storyboardId: 904001,
      provider: 'vidu',
      prompt: 'vidu webhook test',
      taskId: 'vidu-secure-task',
      workflowJobId: Number(workflowJob.lastInsertRowid),
      status: 'processing',
      createdAt: ts,
      updatedAt: ts,
    }).run()

    try {
      const rejected = await app.request('/webhooks/vidu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_id: 'vidu-secure-task',
          state: 'failed',
          error: 'provider failure',
        }),
      })
      expect(rejected.status).toBe(401)

      const accepted = await app.request('/webhooks/vidu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-huobao-webhook-token': 'vidu-test-token',
        },
        body: JSON.stringify({
          task_id: 'vidu-secure-task',
          state: 'failed',
          error: 'provider failure',
        }),
      })
      expect(accepted.status).toBe(200)

      const [videoRow] = db.select().from(schema.videoGenerations)
        .where(eq(schema.videoGenerations.id, Number(videoGeneration.lastInsertRowid))).all()
      const [jobRow] = db.select().from(schema.workflowJobs)
        .where(eq(schema.workflowJobs.id, Number(workflowJob.lastInsertRowid))).all()

      expect(videoRow).toMatchObject({ status: 'failed', errorMsg: 'provider failure' })
      expect(videoRow.completedAt).toBeTruthy()
      expect(jobRow).toMatchObject({ status: 'failed', errorMsg: 'provider failure' })
      expect(jobRow.completedAt).toBeTruthy()
    } finally {
      db.delete(schema.videoGenerations).where(eq(schema.videoGenerations.id, Number(videoGeneration.lastInsertRowid))).run()
      db.delete(schema.workflowJobs).where(eq(schema.workflowJobs.id, Number(workflowJob.lastInsertRowid))).run()
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
      if (previousWebhookToken === undefined) delete process.env.HUOBAO_WEBHOOK_TOKEN
      else process.env.HUOBAO_WEBHOOK_TOKEN = previousWebhookToken
    }
  })

  it('redacts provider secret headers from task payload logs', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      logTaskPayload('TestSecrets', 'payload', {
        url: 'https://example.test/generate?x-goog-api-key=gemini-secret&safe=1',
        headers: {
          Authorization: 'Bearer auth-secret',
          'x-goog-api-key': 'gemini-secret',
        },
        nested: {
          client_secret: 'client-secret',
          refreshToken: 'refresh-secret',
        },
      })

      const output = spy.mock.calls.map(call => call.join(' ')).join('\n')
      expect(output).not.toContain('gemini-secret')
      expect(output).not.toContain('auth-secret')
      expect(output).not.toContain('client-secret')
      expect(output).not.toContain('refresh-secret')
      expect(output).toContain('"x-goog-api-key": "***"')
    } finally {
      spy.mockRestore()
    }
  })

  it('rejects invalid skill ids even when authenticated', async () => {
    const app = buildApp()
    const response = await app.request('/api/v1/skills', {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: '../secrets',
        name: 'Invalid',
      }),
    })
    const json = await response.json()
    expect(response.status).toBe(400)
    expect(json.message).toBe('Invalid skill id')
  })

  it('paginates image generations with SQL filters', async () => {
    const app = buildApp()
    const ts = new Date().toISOString()
    const dramaId = 880001
    db.insert(schema.imageGenerations).values({
      dramaId,
      storyboardId: 901001,
      prompt: 'image test 1',
      status: 'completed',
      createdAt: ts,
      updatedAt: ts,
    }).run()
    const second = db.insert(schema.imageGenerations).values({
      dramaId,
      storyboardId: 901002,
      prompt: 'image test 2',
      status: 'pending',
      createdAt: ts,
      updatedAt: ts,
    }).run()

    try {
      const response = await app.request(`/api/v1/images?drama_id=${dramaId}&page_size=1`, {
        headers: adminHeaders,
      })
      const json = await response.json()
      expect(response.status).toBe(200)
      expect(Array.isArray(json.data.items)).toBe(true)
      expect(json.data.items).toHaveLength(1)
      expect(json.data.pagination).toMatchObject({ page: 1, page_size: 1, total: 2 })
      expect(Number(json.data.items[0].id)).toBe(Number(second.lastInsertRowid))
    } finally {
      db.delete(schema.imageGenerations).where(eq(schema.imageGenerations.dramaId, dramaId)).run()
    }
  })

  it('paginates video generations with SQL filters', async () => {
    const app = buildApp()
    const ts = new Date().toISOString()
    const dramaId = 880002
    db.insert(schema.videoGenerations).values({
      dramaId,
      storyboardId: 902001,
      prompt: 'video test 1',
      status: 'completed',
      createdAt: ts,
      updatedAt: ts,
    }).run()
    const second = db.insert(schema.videoGenerations).values({
      dramaId,
      storyboardId: 902002,
      prompt: 'video test 2',
      status: 'running',
      createdAt: ts,
      updatedAt: ts,
    }).run()

    try {
      const response = await app.request(`/api/v1/videos?drama_id=${dramaId}&page_size=1`, {
        headers: adminHeaders,
      })
      const json = await response.json()
      expect(response.status).toBe(200)
      expect(Array.isArray(json.data.items)).toBe(true)
      expect(json.data.items).toHaveLength(1)
      expect(json.data.pagination).toMatchObject({ page: 1, page_size: 1, total: 2 })
      expect(Number(json.data.items[0].id)).toBe(Number(second.lastInsertRowid))
    } finally {
      db.delete(schema.videoGenerations).where(eq(schema.videoGenerations.dramaId, dramaId)).run()
    }
  })

  it('marks orphaned media generation rows as failed', () => {
    const ts = new Date().toISOString()
    const dramaId = 880003
    const image = db.insert(schema.imageGenerations).values({
      dramaId,
      storyboardId: 903001,
      prompt: 'orphaned image',
      status: 'processing',
      createdAt: ts,
      updatedAt: ts,
    }).run()
    const video = db.insert(schema.videoGenerations).values({
      dramaId,
      storyboardId: 903002,
      prompt: 'orphaned video',
      status: 'running',
      createdAt: ts,
      updatedAt: ts,
    }).run()
    const merge = db.insert(schema.videoMerges).values({
      dramaId,
      episodeId: 903003,
      title: 'orphaned merge',
      provider: 'ffmpeg',
      model: 'ffmpeg-concat-h264-aac',
      status: 'processing',
      scenes: '[]',
      createdAt: ts,
    }).run()

    try {
      const recovered = recoverOrphanedGenerationRecords('test recovery')
      expect(recovered.records).toEqual(expect.arrayContaining([
        { type: 'image_generation', id: Number(image.lastInsertRowid) },
        { type: 'video_generation', id: Number(video.lastInsertRowid) },
        { type: 'video_merge', id: Number(merge.lastInsertRowid) },
      ]))

      const [imageRow] = db.select().from(schema.imageGenerations)
        .where(eq(schema.imageGenerations.id, Number(image.lastInsertRowid))).all()
      const [videoRow] = db.select().from(schema.videoGenerations)
        .where(eq(schema.videoGenerations.id, Number(video.lastInsertRowid))).all()
      const [mergeRow] = db.select().from(schema.videoMerges)
        .where(eq(schema.videoMerges.id, Number(merge.lastInsertRowid))).all()

      expect(imageRow).toMatchObject({ status: 'failed', errorMsg: 'test recovery' })
      expect(videoRow).toMatchObject({ status: 'failed', errorMsg: 'test recovery' })
      expect(mergeRow).toMatchObject({ status: 'failed', errorMsg: 'test recovery' })
      expect(imageRow.completedAt).toBeTruthy()
      expect(videoRow.completedAt).toBeTruthy()
      expect(mergeRow.completedAt).toBeTruthy()
    } finally {
      db.delete(schema.imageGenerations).where(eq(schema.imageGenerations.dramaId, dramaId)).run()
      db.delete(schema.videoGenerations).where(eq(schema.videoGenerations.dramaId, dramaId)).run()
      db.delete(schema.videoMerges).where(eq(schema.videoMerges.dramaId, dramaId)).run()
    }
  })

  it('rejects extra fields in bulk character updates', async () => {
    const app = buildApp()
    const dramaId = await createDrama(app, `character-extra-${Date.now()}`)

    try {
      const response = await app.request(`/api/v1/dramas/${dramaId}/characters`, {
        method: 'PUT',
        headers: {
          ...adminHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          characters: [
            {
              name: 'Heroi teste',
              deletedAt: '2024-01-01T00:00:00.000Z',
            },
          ],
        }),
      })
      const json = await response.json()
      expect(response.status).toBe(400)
      expect(json.message).toBe('validation_failed')
      expect(json.details.some((issue: any) => issue.code === 'unrecognized_keys')).toBe(true)
    } finally {
      await deleteDrama(app, dramaId)
    }
  })

  it('rejects character updates that target another drama', async () => {
    const app = buildApp()
    const sourceDramaId = await createDrama(app, `character-source-${Date.now()}`)
    const targetDramaId = await createDrama(app, `character-target-${Date.now()}`)

    try {
      const createCharacterResponse = await app.request(`/api/v1/dramas/${sourceDramaId}/characters`, {
        method: 'PUT',
        headers: {
          ...adminHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          characters: [
            {
              name: 'Heroi cruzado',
            },
          ],
        }),
      })
      expect(createCharacterResponse.status).toBe(200)

      const sourceDrama = await getDrama(app, sourceDramaId)
      const characterId = Number(sourceDrama.characters[0]?.id)
      expect(characterId).toBeGreaterThan(0)

      const response = await app.request(`/api/v1/dramas/${targetDramaId}/characters`, {
        method: 'PUT',
        headers: {
          ...adminHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          characters: [
            {
              id: characterId,
              role: 'vilao',
            },
          ],
        }),
      })
      const json = await response.json()
      expect(response.status).toBe(400)
      expect(json.message).toBe('Character does not belong to this drama')
    } finally {
      await deleteDrama(app, sourceDramaId)
      await deleteDrama(app, targetDramaId)
    }
  })

  it('rejects extra fields in bulk episode updates', async () => {
    const app = buildApp()
    const dramaId = await createDrama(app, `episode-extra-${Date.now()}`)

    try {
      const response = await app.request(`/api/v1/dramas/${dramaId}/episodes`, {
        method: 'PUT',
        headers: {
          ...adminHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          episodes: [
            {
              title: 'Novo episodio',
              videoUrl: 'https://example.com/video.mp4',
            },
          ],
        }),
      })
      const json = await response.json()
      expect(response.status).toBe(400)
      expect(json.message).toBe('validation_failed')
      expect(json.details.some((issue: any) => issue.code === 'unrecognized_keys')).toBe(true)
    } finally {
      await deleteDrama(app, dramaId)
    }
  })

  it('rejects episode updates that target another drama', async () => {
    const app = buildApp()
    const sourceDramaId = await createDrama(app, `episode-source-${Date.now()}`)
    const targetDramaId = await createDrama(app, `episode-target-${Date.now()}`)

    try {
      const sourceDrama = await getDrama(app, sourceDramaId)
      const episodeId = Number(sourceDrama.episodes[0]?.id)
      expect(episodeId).toBeGreaterThan(0)

      const response = await app.request(`/api/v1/dramas/${targetDramaId}/episodes`, {
        method: 'PUT',
        headers: {
          ...adminHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          episodes: [
            {
              id: episodeId,
              title: 'Tentativa cruzada',
            },
          ],
        }),
      })
      const json = await response.json()
      expect(response.status).toBe(400)
      expect(json.message).toBe('Episode does not belong to this drama')
    } finally {
      await deleteDrama(app, sourceDramaId)
      await deleteDrama(app, targetDramaId)
    }
  })

  it('hides api keys when listing ai configs', async () => {
    const previousSecretKey = process.env.HUOBAO_SECRET_KEY
    process.env.HUOBAO_SECRET_KEY = 'index-test-secret-key'
    const app = buildApp()
    let createdId: number | null = null

    try {
      const createResponse = await app.request('/api/v1/ai-configs', {
        method: 'POST',
        headers: {
          ...adminHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service_type: 'image',
          provider: 'openai',
          name: 'test-config-hidden-key',
          api_key: 'sk-test-hidden-key',
          base_url: 'https://api.openai.com',
          model: ['gpt-image-1'],
          priority: 0,
        }),
      })
      expect(createResponse.status).toBe(201)
      const created = await createResponse.json()
      createdId = Number(created.data.id)
      expect(created.data).toHaveProperty('has_api_key', true)
      expect(created.data.api_key).toBeUndefined()

      const [rawRow] = db.select().from(schema.aiServiceConfigs)
        .where(eq(schema.aiServiceConfigs.id, createdId))
        .all()
      expect(rawRow).toBeTruthy()
      expect(rawRow!.apiKey).toMatch(/^huobao:v1:/)
      expect(rawRow!.apiKey).not.toContain('sk-test-hidden-key')
      expect(revealAIConfigApiKey(rawRow!.apiKey)).toBe('sk-test-hidden-key')

      const listResponse = await app.request('/api/v1/ai-configs?service_type=image', {
        headers: adminHeaders,
      })
      const listJson = await listResponse.json()
      expect(listResponse.status).toBe(200)
      const createdRow = listJson.data.find((row: any) => row.id === created.data.id)
      expect(createdRow).toBeTruthy()
      expect(createdRow.api_key).toBeUndefined()
      expect(createdRow.has_api_key).toBe(true)
    } finally {
      if (createdId) {
        await app.request(`/api/v1/ai-configs/${createdId}`, {
          method: 'DELETE',
          headers: adminHeaders,
        })
      }
      if (previousSecretKey === undefined) {
        delete process.env.HUOBAO_SECRET_KEY
      } else {
        process.env.HUOBAO_SECRET_KEY = previousSecretKey
      }
    }
  })
})
