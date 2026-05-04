import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import { resolveStoragePath } from '../utils/storage.js'

type DurationCacheEntry = {
  duration: number
  mtimeMs: number
}

const durationCache = new Map<string, DurationCacheEntry>()

function probeDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        resolve(null)
        return
      }
      const duration = Number(metadata?.format?.duration || 0)
      resolve(Number.isFinite(duration) && duration > 0 ? duration : null)
    })
  })
}

export async function getRelativeMediaDuration(relativePath?: string | null): Promise<number | null> {
  const safeRelativePath = String(relativePath || '').trim()
  if (!safeRelativePath) return null

  const absolutePath = resolveStoragePath(safeRelativePath)
  if (!fs.existsSync(absolutePath)) return null

  const stats = fs.statSync(absolutePath)
  const cached = durationCache.get(absolutePath)
  if (cached && cached.mtimeMs === stats.mtimeMs) return cached.duration

  const duration = await probeDuration(absolutePath)
  if (duration == null) return null

  durationCache.set(absolutePath, {
    duration,
    mtimeMs: stats.mtimeMs,
  })
  return duration
}
