import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { STORAGE_ROOT, resolveStoragePath } from '../utils/storage.js'

export type VideoFrameKind = 'first' | 'last'

function probeDurationSeconds(filePath: string) {
  return new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err)
        return
      }
      const duration = Number(metadata?.format?.duration || 0)
      resolve(Number.isFinite(duration) && duration > 0 ? duration : 0)
    })
  })
}

export function resolveVideoFrameCaptureTime(durationSeconds: number, frame: VideoFrameKind) {
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0
  if (frame === 'first') return 0
  if (safeDuration <= 0.25) return 0
  return Math.max(0, safeDuration - Math.min(0.2, safeDuration / 2))
}

function renderFrame(inputPath: string, outputPath: string, captureTimeSeconds: number) {
  return new Promise<void>((resolve, reject) => {
    const command = ffmpeg(inputPath)
    if (captureTimeSeconds > 0) {
      command.seekInput(captureTimeSeconds)
    }

    command
      .outputOptions(['-frames:v 1', '-q:v 2'])
      .on('end', () => resolve())
      .on('error', (error) => reject(error))
      .save(outputPath)
  })
}

export async function extractVideoFrameAsset(videoPath: string, frame: VideoFrameKind) {
  const absoluteInput = resolveStoragePath(videoPath)
  const frameDir = path.join(STORAGE_ROOT, 'frames')
  fs.mkdirSync(frameDir, { recursive: true })

  const durationSeconds = await probeDurationSeconds(absoluteInput)
  const captureTimeSeconds = resolveVideoFrameCaptureTime(durationSeconds, frame)
  const filename = `${uuid()}-${frame}.jpg`
  const absoluteOutput = path.join(frameDir, filename)

  await renderFrame(absoluteInput, absoluteOutput, captureTimeSeconds)
  return `static/frames/${filename}`
}

export async function ensureStoryboardVideoFrames(storyboardId: number, videoPath: string) {
  const [storyboard] = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, storyboardId))
    .all()

  if (!storyboard) {
    throw new Error(`Storyboard ${storyboardId} not found while extracting video frames`)
  }

  const updates: Record<string, any> = {}

  if (!String(storyboard.firstFrameImage || '').trim()) {
    updates.firstFrameImage = await extractVideoFrameAsset(videoPath, 'first')
  }

  if (!String(storyboard.lastFrameImage || '').trim()) {
    updates.lastFrameImage = await extractVideoFrameAsset(videoPath, 'last')
  }

  if (Object.keys(updates).length > 0) {
    db.update(schema.storyboards)
      .set({ ...updates, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
  }

  return {
    firstFrameImage: updates.firstFrameImage || storyboard.firstFrameImage || null,
    lastFrameImage: updates.lastFrameImage || storyboard.lastFrameImage || null,
  }
}
