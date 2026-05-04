import { Hono } from 'hono'
import { and, desc, eq, inArray, isNull, like, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, notFound, created, now, badRequest } from '../utils/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'
import { parseJsonBody, parseParams, parseQuery, idParamSchema, z } from '../utils/validation.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

const listDramaQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.string().trim().optional(),
  keyword: z.string().trim().optional(),
})

const createDramaSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  genre: z.string().optional(),
  style: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.string().optional(),
  total_episodes: z.coerce.number().int().positive().optional().default(1),
})

const updateDramaSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  genre: z.string().optional(),
  style: z.string().optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.string().optional(),
})

const nullableStringSchema = z.union([z.string(), z.null()]).optional()
const nullableTrimmedStringSchema = z.union([z.string().trim(), z.null()]).optional()
const nullableIntSchema = z.union([z.coerce.number().int(), z.null()]).optional()

const characterMutationSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1).optional(),
  role: nullableTrimmedStringSchema,
  description: nullableStringSchema,
  appearance: nullableStringSchema,
  personality: nullableStringSchema,
  voice_style: nullableTrimmedStringSchema,
  voiceStyle: nullableTrimmedStringSchema,
  voice_provider: nullableTrimmedStringSchema,
  voiceProvider: nullableTrimmedStringSchema,
  image_url: nullableTrimmedStringSchema,
  imageUrl: nullableTrimmedStringSchema,
  local_path: nullableTrimmedStringSchema,
  localPath: nullableTrimmedStringSchema,
  sort_order: nullableIntSchema,
  sortOrder: nullableIntSchema,
}).strict().superRefine((value, ctx) => {
  const hasEditableField = [
    value.name,
    value.role,
    value.description,
    value.appearance,
    value.personality,
    value.voice_style,
    value.voiceStyle,
    value.voice_provider,
    value.voiceProvider,
    value.image_url,
    value.imageUrl,
    value.local_path,
    value.localPath,
    value.sort_order,
    value.sortOrder,
  ].some(field => field !== undefined)

  if (!value.id && !value.name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['name'],
      message: 'name is required for new characters',
    })
  }

  if (value.id && !hasEditableField) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['id'],
      message: 'at least one editable field is required when updating a character',
    })
  }
})

const bulkCharactersSchema = z.object({
  characters: z.array(characterMutationSchema).max(200),
}).strict()

const episodeMutationSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  episode_number: z.coerce.number().int().positive().optional(),
  episodeNumber: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(1).optional(),
  content: nullableStringSchema,
  script_content: nullableStringSchema,
  scriptContent: nullableStringSchema,
  description: nullableStringSchema,
  duration: nullableIntSchema,
  status: nullableTrimmedStringSchema,
  thumbnail: nullableTrimmedStringSchema,
  image_config_id: nullableIntSchema,
  imageConfigId: nullableIntSchema,
  video_config_id: nullableIntSchema,
  videoConfigId: nullableIntSchema,
  audio_config_id: nullableIntSchema,
  audioConfigId: nullableIntSchema,
  default_motion_preset: nullableTrimmedStringSchema,
  defaultMotionPreset: nullableTrimmedStringSchema,
  default_subtitle_mode: nullableTrimmedStringSchema,
  defaultSubtitleMode: nullableTrimmedStringSchema,
}).strict().superRefine((value, ctx) => {
  const hasEditableField = [
    value.episode_number,
    value.episodeNumber,
    value.title,
    value.content,
    value.script_content,
    value.scriptContent,
    value.description,
    value.duration,
    value.status,
    value.thumbnail,
    value.image_config_id,
    value.imageConfigId,
    value.video_config_id,
    value.videoConfigId,
    value.audio_config_id,
    value.audioConfigId,
    value.default_motion_preset,
    value.defaultMotionPreset,
    value.default_subtitle_mode,
    value.defaultSubtitleMode,
  ].some(field => field !== undefined)

  if (value.id && !hasEditableField) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['id'],
      message: 'at least one editable field is required when updating an episode',
    })
  }
})

const bulkEpisodesSchema = z.object({
  episodes: z.array(episodeMutationSchema).max(200),
}).strict()

function parseTags(raw: string | null | undefined) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeTrimmedString(value: string | null | undefined) {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function pickFirstDefined<T>(...values: Array<T | undefined>) {
  return values.find(value => value !== undefined)
}

function buildCharacterMutationPatch(input: z.infer<typeof characterMutationSchema>) {
  const patch: Partial<typeof schema.characters.$inferInsert> = {}

  if (input.name !== undefined) patch.name = input.name
  if (input.role !== undefined) patch.role = normalizeTrimmedString(input.role)
  if (input.description !== undefined) patch.description = input.description
  if (input.appearance !== undefined) patch.appearance = input.appearance
  if (input.personality !== undefined) patch.personality = input.personality

  const voiceStyle = pickFirstDefined(input.voice_style, input.voiceStyle)
  if (voiceStyle !== undefined) patch.voiceStyle = normalizeTrimmedString(voiceStyle)

  const voiceProvider = pickFirstDefined(input.voice_provider, input.voiceProvider)
  if (voiceProvider !== undefined) patch.voiceProvider = normalizeTrimmedString(voiceProvider)

  const imageUrl = pickFirstDefined(input.image_url, input.imageUrl)
  if (imageUrl !== undefined) patch.imageUrl = normalizeTrimmedString(imageUrl)

  const localPath = pickFirstDefined(input.local_path, input.localPath)
  if (localPath !== undefined) patch.localPath = normalizeTrimmedString(localPath)

  const sortOrder = pickFirstDefined(input.sort_order, input.sortOrder)
  if (sortOrder !== undefined) patch.sortOrder = sortOrder

  return patch
}

function buildEpisodeMutationPatch(input: z.infer<typeof episodeMutationSchema>) {
  const patch: Partial<typeof schema.episodes.$inferInsert> = {}

  const episodeNumber = pickFirstDefined(input.episode_number, input.episodeNumber)
  if (episodeNumber !== undefined) patch.episodeNumber = episodeNumber
  if (input.title !== undefined) patch.title = input.title
  if (input.content !== undefined) patch.content = input.content

  const scriptContent = pickFirstDefined(input.script_content, input.scriptContent)
  if (scriptContent !== undefined) patch.scriptContent = scriptContent

  if (input.description !== undefined) patch.description = input.description
  if (input.duration !== undefined) patch.duration = input.duration
  if (input.status !== undefined) patch.status = normalizeTrimmedString(input.status)
  if (input.thumbnail !== undefined) patch.thumbnail = normalizeTrimmedString(input.thumbnail)

  const imageConfigId = pickFirstDefined(input.image_config_id, input.imageConfigId)
  if (imageConfigId !== undefined) patch.imageConfigId = imageConfigId

  const videoConfigId = pickFirstDefined(input.video_config_id, input.videoConfigId)
  if (videoConfigId !== undefined) patch.videoConfigId = videoConfigId

  const audioConfigId = pickFirstDefined(input.audio_config_id, input.audioConfigId)
  if (audioConfigId !== undefined) patch.audioConfigId = audioConfigId

  const defaultMotionPreset = pickFirstDefined(input.default_motion_preset, input.defaultMotionPreset)
  if (defaultMotionPreset !== undefined) patch.defaultMotionPreset = normalizeTrimmedString(defaultMotionPreset)

  const defaultSubtitleMode = pickFirstDefined(input.default_subtitle_mode, input.defaultSubtitleMode)
  if (defaultSubtitleMode !== undefined) patch.defaultSubtitleMode = normalizeTrimmedString(defaultSubtitleMode)

  return patch
}

app.get('/', async (c) => {
  const parsed = parseQuery(c, listDramaQuerySchema)
  if (!parsed.ok) return parsed.response

  const { page, page_size: pageSize, status, keyword } = parsed.data
  const conditions = [isNull(schema.dramas.deletedAt)]
  if (status) conditions.push(eq(schema.dramas.status, status))
  if (keyword) conditions.push(like(schema.dramas.title, `%${keyword}%`))

  const whereClause = and(...conditions)
  const [countRow] = db.select({ count: sql<number>`count(*)` })
    .from(schema.dramas)
    .where(whereClause)
    .all()

  const items = db.select().from(schema.dramas)
    .where(whereClause)
    .orderBy(desc(schema.dramas.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()

  const dramaIds = items.map(item => item.id)
  const episodes = dramaIds.length
    ? db.select().from(schema.episodes).where(inArray(schema.episodes.dramaId, dramaIds)).all()
    : []
  const characters = dramaIds.length
    ? db.select().from(schema.characters).where(and(inArray(schema.characters.dramaId, dramaIds), isNull(schema.characters.deletedAt))).all()
    : []
  const scenes = dramaIds.length
    ? db.select().from(schema.scenes).where(and(inArray(schema.scenes.dramaId, dramaIds), isNull(schema.scenes.deletedAt))).all()
    : []

  const episodesByDrama = new Map<number, typeof episodes>()
  const charactersByDrama = new Map<number, typeof characters>()
  const scenesByDrama = new Map<number, typeof scenes>()

  for (const episode of episodes) {
    const group = episodesByDrama.get(episode.dramaId) || []
    group.push(episode)
    episodesByDrama.set(episode.dramaId, group)
  }
  for (const character of characters) {
    const group = charactersByDrama.get(character.dramaId) || []
    group.push(character)
    charactersByDrama.set(character.dramaId, group)
  }
  for (const scene of scenes) {
    const group = scenesByDrama.get(scene.dramaId) || []
    group.push(scene)
    scenesByDrama.set(scene.dramaId, group)
  }

  const enriched = items.map((drama) => {
    const dramaEpisodes = episodesByDrama.get(drama.id) || []
    const dramaCharacters = charactersByDrama.get(drama.id) || []
    const dramaScenes = scenesByDrama.get(drama.id) || []
    return {
      ...toSnakeCase(drama),
      tags: parseTags(drama.tags),
      total_episodes: dramaEpisodes.length,
      episodes: toSnakeCaseArray(dramaEpisodes),
      characters: toSnakeCaseArray(dramaCharacters),
      scenes: toSnakeCaseArray(dramaScenes),
    }
  })

  const total = Number(countRow?.count || 0)
  return success(c, {
    items: enriched,
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  })
})

app.post('/', async (c) => {
  const parsed = await parseJsonBody(c, createDramaSchema)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const ts = now()
  const result = db.insert(schema.dramas).values({
    title: body.title,
    description: body.description,
    genre: body.genre,
    style: body.style,
    tags: body.tags ? JSON.stringify(body.tags) : null,
    metadata: body.metadata,
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const [drama] = db.select().from(schema.dramas)
    .where(eq(schema.dramas.id, Number(result.lastInsertRowid))).all()

  for (let episodeNumber = 1; episodeNumber <= body.total_episodes; episodeNumber++) {
    db.insert(schema.episodes).values({
      dramaId: drama.id,
      episodeNumber,
      title: `Episodio ${episodeNumber}`,
      status: 'draft',
      createdAt: ts,
      updatedAt: ts,
    }).run()
  }

  return created(c, toSnakeCase(drama))
})

app.get('/stats', async (c) => {
  const all = db.select().from(schema.dramas).where(isNull(schema.dramas.deletedAt)).all()
  const byStatus = Object.entries(
    all.reduce((acc, row) => {
      const status = row.status || 'draft'
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {} as Record<string, number>),
  ).map(([rowStatus, count]) => ({ status: rowStatus, count }))
  return success(c, { total: all.length, by_status: byStatus })
})

app.get('/:id', async (c) => {
  const parsed = parseParams(c, idParamSchema)
  if (!parsed.ok) return parsed.response

  const id = parsed.data.id
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, id)).all()
  if (!drama) return notFound(c, 'Roteiro nao existe')

  const episodes = db.select().from(schema.episodes).where(eq(schema.episodes.dramaId, id)).all()
  const characters = db.select().from(schema.characters)
    .where(and(eq(schema.characters.dramaId, id), isNull(schema.characters.deletedAt))).all()
  const scenes = db.select().from(schema.scenes)
    .where(and(eq(schema.scenes.dramaId, id), isNull(schema.scenes.deletedAt))).all()
  const props = db.select().from(schema.props)
    .where(and(eq(schema.props.dramaId, id), isNull(schema.props.deletedAt))).all()

  return success(c, {
    ...toSnakeCase(drama),
    tags: parseTags(drama.tags),
    episodes: toSnakeCaseArray(episodes),
    characters: toSnakeCaseArray(characters),
    scenes: toSnakeCaseArray(scenes),
    props: toSnakeCaseArray(props),
  })
})

app.put('/:id', async (c) => {
  const paramResult = parseParams(c, idParamSchema)
  if (!paramResult.ok) return paramResult.response
  const bodyResult = await parseJsonBody(c, updateDramaSchema)
  if (!bodyResult.ok) return bodyResult.response

  const body = bodyResult.data
  const updates: Record<string, unknown> = { updatedAt: now() }
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.genre !== undefined) updates.genre = body.genre
  if (body.style !== undefined) updates.style = body.style
  if (body.status !== undefined) updates.status = body.status
  if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags)
  if (body.metadata !== undefined) updates.metadata = body.metadata
  db.update(schema.dramas).set(updates).where(eq(schema.dramas.id, paramResult.data.id)).run()
  return success(c)
})

app.delete('/:id', async (c) => {
  const parsed = parseParams(c, idParamSchema)
  if (!parsed.ok) return parsed.response
  db.update(schema.dramas).set({ deletedAt: now() }).where(eq(schema.dramas.id, parsed.data.id)).run()
  return success(c)
})

app.put('/:id/characters', async (c) => {
  const paramResult = parseParams(c, idParamSchema)
  if (!paramResult.ok) return paramResult.response
  const bodyResult = await parseJsonBody(c, bulkCharactersSchema)
  if (!bodyResult.ok) return bodyResult.response

  const dramaId = paramResult.data.id
  const [drama] = db.select({ id: schema.dramas.id }).from(schema.dramas)
    .where(and(eq(schema.dramas.id, dramaId), isNull(schema.dramas.deletedAt)))
    .all()
  if (!drama) return notFound(c, 'Roteiro nao existe')

  const characters = bodyResult.data.characters
  const characterIds = characters
    .map(character => character.id)
    .filter((id): id is number => typeof id === 'number')
  const uniqueCharacterIds = new Set(characterIds)
  if (uniqueCharacterIds.size !== characterIds.length) {
    return badRequest(c, 'Duplicate character id in payload')
  }

  const existingCharacters = uniqueCharacterIds.size
    ? db.select({
      id: schema.characters.id,
    }).from(schema.characters)
      .where(and(
        inArray(schema.characters.id, Array.from(uniqueCharacterIds)),
        eq(schema.characters.dramaId, dramaId),
        isNull(schema.characters.deletedAt),
      ))
      .all()
    : []
  const existingCharacterIds = new Set(existingCharacters.map(character => character.id))
  if (existingCharacterIds.size !== uniqueCharacterIds.size) {
    return badRequest(c, 'Character does not belong to this drama')
  }

  const ts = now()
  const updateOperations: Array<{
    id: number
    values: Partial<typeof schema.characters.$inferInsert>
  }> = []
  const insertOperations: Array<typeof schema.characters.$inferInsert> = []

  for (const character of characters) {
    const patch = buildCharacterMutationPatch(character)

    if (character.id) {
      const values: Partial<typeof schema.characters.$inferInsert> = {
        ...patch,
        updatedAt: ts,
      }
      updateOperations.push({
        id: character.id,
        values,
      })
      continue
    }

    if (!patch.name) {
      return badRequest(c, 'name is required for new characters')
    }

    const values: typeof schema.characters.$inferInsert = {
      dramaId,
      name: patch.name,
      role: patch.role,
      description: patch.description,
      appearance: patch.appearance,
      personality: patch.personality,
      voiceStyle: patch.voiceStyle,
      voiceProvider: patch.voiceProvider,
      imageUrl: patch.imageUrl,
      localPath: patch.localPath,
      sortOrder: patch.sortOrder,
      createdAt: ts,
      updatedAt: ts,
    }

    insertOperations.push(values)
  }

  db.transaction((tx) => {
    for (const operation of updateOperations) {
      tx.update(schema.characters)
        .set(operation.values)
        .where(and(
          eq(schema.characters.id, operation.id),
          eq(schema.characters.dramaId, dramaId),
          isNull(schema.characters.deletedAt),
        ))
        .run()
    }

    for (const operation of insertOperations) {
      tx.insert(schema.characters).values(operation).run()
    }
  })

  return success(c)
})

app.put('/:id/episodes', async (c) => {
  const paramResult = parseParams(c, idParamSchema)
  if (!paramResult.ok) return paramResult.response
  const bodyResult = await parseJsonBody(c, bulkEpisodesSchema)
  if (!bodyResult.ok) return bodyResult.response

  const dramaId = paramResult.data.id
  const [drama] = db.select({ id: schema.dramas.id }).from(schema.dramas)
    .where(and(eq(schema.dramas.id, dramaId), isNull(schema.dramas.deletedAt)))
    .all()
  if (!drama) return notFound(c, 'Roteiro nao existe')

  const episodes = bodyResult.data.episodes
  const episodeIds = episodes
    .map(episode => episode.id)
    .filter((id): id is number => typeof id === 'number')
  const uniqueEpisodeIds = new Set(episodeIds)
  if (uniqueEpisodeIds.size !== episodeIds.length) {
    return badRequest(c, 'Duplicate episode id in payload')
  }

  const existingEpisodes = db.select({
    id: schema.episodes.id,
    episodeNumber: schema.episodes.episodeNumber,
  }).from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    .all()
  const existingEpisodesById = new Map(existingEpisodes.map(episode => [episode.id, episode]))

  for (const episodeId of uniqueEpisodeIds) {
    if (!existingEpisodesById.has(episodeId)) {
      return badRequest(c, 'Episode does not belong to this drama')
    }
  }

  const fixedEpisodeNumbers = existingEpisodes
    .filter(episode => !uniqueEpisodeIds.has(episode.id))
    .map(episode => episode.episodeNumber)
  const reservedEpisodeNumbers = new Set(fixedEpisodeNumbers)
  let nextEpisodeNumber = existingEpisodes.length
    ? Math.max(...existingEpisodes.map(episode => episode.episodeNumber)) + 1
    : 1
  const ts = now()
  const updateOperations: Array<{
    id: number
    values: Partial<typeof schema.episodes.$inferInsert>
  }> = []
  const insertOperations: Array<typeof schema.episodes.$inferInsert> = []

  for (const episode of episodes) {
    const patch = buildEpisodeMutationPatch(episode)
    const explicitEpisodeNumber = pickFirstDefined(episode.episode_number, episode.episodeNumber)

    if (episode.id) {
      const existingEpisode = existingEpisodesById.get(episode.id)
      if (!existingEpisode) {
        return badRequest(c, 'Episode does not belong to this drama')
      }

      const finalEpisodeNumber = explicitEpisodeNumber ?? existingEpisode.episodeNumber
      if (reservedEpisodeNumbers.has(finalEpisodeNumber)) {
        return badRequest(c, `Episode number ${finalEpisodeNumber} is already in use for this drama`)
      }

      reservedEpisodeNumbers.add(finalEpisodeNumber)
      const values: Partial<typeof schema.episodes.$inferInsert> = {
        ...patch,
        episodeNumber: finalEpisodeNumber,
        updatedAt: ts,
      }

      updateOperations.push({
        id: episode.id,
        values,
      })
      continue
    }

    while (reservedEpisodeNumbers.has(nextEpisodeNumber)) {
      nextEpisodeNumber += 1
    }

    const resolvedEpisodeNumber = explicitEpisodeNumber ?? nextEpisodeNumber
    if (reservedEpisodeNumbers.has(resolvedEpisodeNumber)) {
      return badRequest(c, `Episode number ${resolvedEpisodeNumber} is already in use for this drama`)
    }

    reservedEpisodeNumbers.add(resolvedEpisodeNumber)
    if (!explicitEpisodeNumber) {
      nextEpisodeNumber = resolvedEpisodeNumber + 1
    }

    const values: typeof schema.episodes.$inferInsert = {
      dramaId,
      episodeNumber: resolvedEpisodeNumber,
      title: patch.title || `Episodio ${resolvedEpisodeNumber}`,
      content: patch.content,
      scriptContent: patch.scriptContent,
      description: patch.description,
      duration: patch.duration,
      status: patch.status,
      thumbnail: patch.thumbnail,
      imageConfigId: patch.imageConfigId,
      videoConfigId: patch.videoConfigId,
      audioConfigId: patch.audioConfigId,
      defaultMotionPreset: patch.defaultMotionPreset,
      defaultSubtitleMode: patch.defaultSubtitleMode,
      createdAt: ts,
      updatedAt: ts,
    }

    insertOperations.push(values)
  }

  db.transaction((tx) => {
    for (const operation of updateOperations) {
      tx.update(schema.episodes)
        .set(operation.values)
        .where(and(
          eq(schema.episodes.id, operation.id),
          eq(schema.episodes.dramaId, dramaId),
          isNull(schema.episodes.deletedAt),
        ))
        .run()
    }

    for (const operation of insertOperations) {
      tx.insert(schema.episodes).values(operation).run()
    }
  })

  return success(c)
})

export default app
