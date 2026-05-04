import { Hono } from 'hono'
import type { Context } from 'hono'
import path from 'path'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { saveUploadedFile } from '../utils/storage.js'
import { getRelativeMediaDuration } from '../services/media-duration.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

function hasAllowedMime(file: File, prefix: string) {
  return !file.type || file.type.startsWith(prefix)
}

async function handleUpload(c: Context, options: { type: 'image' | 'video' | 'audio'; subDir: string }) {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || !(file instanceof File)) {
    return badRequest(c, 'file is required')
  }

  if (!hasAllowedMime(file, `${options.type}/`)) {
    return badRequest(c, `${options.type} file is required`)
  }

  const buffer = await file.arrayBuffer()
  const path = await saveUploadedFile(buffer, options.subDir, file.name)
  return success(c, { url: `/${path}`, path })
}

// POST /upload/image
app.post('/image', async (c) => {
  return handleUpload(c, { type: 'image', subDir: 'uploads/images' })
})

// POST /upload/video
app.post('/video', async (c) => {
  return handleUpload(c, { type: 'video', subDir: 'uploads/videos' })
})

// POST /upload/audio
app.post('/audio', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || !(file instanceof File)) {
    return badRequest(c, 'file is required')
  }

  if (!hasAllowedMime(file, 'audio/')) {
    return badRequest(c, 'audio file is required')
  }

  const buffer = await file.arrayBuffer()
  const uploadedPath = await saveUploadedFile(buffer, 'uploads/audio', file.name)
  const durationSeconds = await getRelativeMediaDuration(uploadedPath)
  const assetResult = db.insert(schema.assets).values({
    dramaId: body['drama_id'] ? Number(body['drama_id']) : null,
    episodeId: body['episode_id'] ? Number(body['episode_id']) : null,
    storyboardId: body['storyboard_id'] ? Number(body['storyboard_id']) : null,
    storyboardNum: body['storyboard_num'] ? Number(body['storyboard_num']) : null,
    name: file.name,
    type: 'audio',
    category: String(body['category'] || 'audio').trim() || 'audio',
    url: uploadedPath,
    localPath: uploadedPath,
    fileSize: Number(file.size || 0),
    mimeType: String(file.type || '').trim() || null,
    duration: durationSeconds != null ? Math.max(1, Math.round(durationSeconds)) : null,
    format: path.extname(file.name).replace(/^\./, '').toLowerCase() || null,
    createdAt: now(),
    updatedAt: now(),
  }).run()

  return success(c, {
    asset_id: Number(assetResult.lastInsertRowid),
    url: `/${uploadedPath}`,
    path: uploadedPath,
    duration: durationSeconds,
    duration_ms: durationSeconds != null ? Math.round(durationSeconds * 1000) : null,
    mime_type: file.type || null,
    file_size: Number(file.size || 0),
    format: path.extname(file.name).replace(/^\./, '').toLowerCase() || null,
    name: file.name,
    category: String(body['category'] || 'audio').trim() || 'audio',
  })
})

export default app
