
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { STORAGE_ROOT, resolveStoragePath } from '../utils/storage.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { completeWorkflowJob, failWorkflowJob, startWorkflowJob } from './workflow-jobs.js'
import { canUseMergeTransition, getSafeMergeTransitionDuration, resolveMergeTransition, type MergeTransitionConfig } from './merge-transition.js'
import { mixAudioCuesIntoVideo } from './audio-cue-mix.js'
import { composeStoryboard } from './ffmpeg-compose.js'
import { getStoryboardComposeSource } from './storyboard-compose-source.js'
import { resolveStoryboardMotionPreset } from './storyboard-motion.js'
import { normalizeStoryboardSubtitleMode } from './storyboard-subtitles.js'
import { getStoryboardSpokenDialogue } from './storyboard-speech.js'

function toAbsPath(relativePath: string): string {
  return resolveStoragePath(relativePath)
}


type MergeEpisodeOptions = {
  transition?: string | null
}

type MergeDramaOptions = {
  transition?: string | null
}

type StoryboardTimelineItem = {
  storyboardId: number
  sceneId: number | null
  startSeconds: number
  endSeconds: number
  durationSeconds: number
  dialogue: string
  ttsAudioUrl: string | null
}

function needsRenderSettingsRecompose(
  storyboard: typeof schema.storyboards.$inferSelect,
  episode: typeof schema.episodes.$inferSelect | undefined,
) {
  const composeSource = getStoryboardComposeSource(storyboard)
  if (!composeSource || !storyboard.composedVideoUrl) return false

  const effectiveMotionPreset = resolveStoryboardMotionPreset(
    episode?.defaultMotionPreset,
    storyboard.motionPresetOverride,
  )
  const lastComposedMotionPreset = resolveStoryboardMotionPreset(null, storyboard.lastComposedMotionPreset)
  if (composeSource.kind === 'image' && effectiveMotionPreset !== lastComposedMotionPreset) {
    return true
  }

  const effectiveSubtitleMode = normalizeStoryboardSubtitleMode(episode?.defaultSubtitleMode)
  const lastComposedSubtitleMode = normalizeStoryboardSubtitleMode(storyboard.lastComposedSubtitleMode)
  const hasSpokenDialogue = !!String(getStoryboardSpokenDialogue(storyboard) || '').trim()
  if (hasSpokenDialogue && effectiveSubtitleMode !== lastComposedSubtitleMode) {
    return true
  }

  return false
}

export async function mergeEpisodeVideos(
  episodeId: number,
  dramaId: number,
  workflowJobId?: number | null,
  options: MergeEpisodeOptions = {},
): Promise<number> {
  const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()

  const staleStoryboardIds = storyboards
    .filter((storyboard) => needsRenderSettingsRecompose(storyboard, episode))
    .map((storyboard) => storyboard.id)

  const composedStoryboards = storyboards.filter(sb => !!sb.composedVideoUrl)
  if (composedStoryboards.length !== storyboards.length) {
    throw new Error(`Only composed storyboards can be merged (${composedStoryboards.length}/${storyboards.length} ready)`)
  }
  const videos = composedStoryboards
    .map(sb => sb.composedVideoUrl)
    .filter(Boolean) as string[]

  if (videos.length === 0) throw new Error('No videos to merge')

  const transition = resolveMergeTransition(options.transition)

  logTaskStart('MergeTask', 'episode-merge', { episodeId, dramaId, clips: videos.length, recomposed: staleStoryboardIds.length })


  const ts = now()
  const res = db.insert(schema.videoMerges).values({
    episodeId,
    dramaId,
    title: `Episode ${episodeId} Merge`,
    provider: 'ffmpeg',
    model: transition.kind === 'cut' ? 'ffmpeg-concat-h264-aac' : `ffmpeg-xfade-${transition.kind}-h264-aac`,
    status: 'processing',
    scenes: JSON.stringify(videos),
    createdAt: ts,
  }).run()
  const mergeId = Number(res.lastInsertRowid)
  if (workflowJobId) {
    startWorkflowJob(workflowJobId, {
      metadata: { mergeId, episodeId, dramaId, transition: transition.kind, recomposed: staleStoryboardIds.length },
    })
  }


  doMerge(mergeId, episodeId, transition, staleStoryboardIds, workflowJobId).catch(err => {
    logTaskError('MergeTask', 'episode-merge', { mergeId, episodeId, error: err.message })
    console.error(`[Merge] Failed:`, err)
    db.update(schema.videoMerges)
      .set({ status: 'failed', errorMsg: err.message })
      .where(eq(schema.videoMerges.id, mergeId)).run()
    if (workflowJobId) {
      failWorkflowJob(workflowJobId, err.message, {
        metadata: { mergeId, episodeId, dramaId, transition: transition.kind, recomposed: staleStoryboardIds.length },
      })
    }
  })

  return mergeId
}

export async function mergeDramaVideos(
  dramaId: number,
  workflowJobId?: number | null,
  options: MergeDramaOptions = {},
): Promise<number> {
  const episodes = db.select().from(schema.episodes)
    .where(eq(schema.episodes.dramaId, dramaId))
    .orderBy(schema.episodes.episodeNumber)
    .all()
    .filter((episode) => !episode.deletedAt && !!episode.videoUrl)

  if (episodes.length < 2) {
    throw new Error('At least 2 finalized episodes are required to build the drama compilation')
  }

  const transition = resolveMergeTransition(options.transition)
  const ts = now()
  const res = db.insert(schema.videoMerges).values({
    episodeId: null,
    dramaId,
    title: `Drama ${dramaId} Compilation`,
    provider: 'ffmpeg',
    model: transition.kind === 'cut' ? 'ffmpeg-concat-h264-aac' : `ffmpeg-xfade-${transition.kind}-h264-aac`,
    status: 'processing',
    scenes: JSON.stringify(episodes.map((episode) => ({
      episode_id: episode.id,
      episode_number: episode.episodeNumber,
      title: episode.title,
      video_url: episode.videoUrl,
    }))),
    createdAt: ts,
  }).run()
  const mergeId = Number(res.lastInsertRowid)

  if (workflowJobId) {
    startWorkflowJob(workflowJobId, {
      metadata: { mergeId, dramaId, episodeCount: episodes.length, transition: transition.kind },
    })
  }

  doDramaMerge(mergeId, dramaId, transition, workflowJobId).catch((err) => {
    logTaskError('MergeTask', 'drama-merge', { mergeId, dramaId, error: err.message })
    db.update(schema.videoMerges)
      .set({ status: 'failed', errorMsg: err.message })
      .where(eq(schema.videoMerges.id, mergeId))
      .run()
    if (workflowJobId) {
      failWorkflowJob(workflowJobId, err.message, {
        metadata: { mergeId, dramaId, transition: transition.kind },
      })
    }
  })

  return mergeId
}

async function doMerge(
  mergeId: number,
  episodeId: number,
  transition: MergeTransitionConfig,
  staleStoryboardIds: number[],
  workflowJobId?: number | null,
) {
  if (staleStoryboardIds.length) {
    for (const storyboardId of staleStoryboardIds) {
      await composeStoryboard(storyboardId)
    }
  }

  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()
  const videos = storyboards
    .map((storyboard) => storyboard.composedVideoUrl)
    .filter(Boolean) as string[]

  const { mergedRelative, duration } = await renderMergedVideo(videos, transition)


  db.update(schema.videoMerges)
    .set({ status: 'completed', mergedUrl: mergedRelative, duration, completedAt: now() })
    .where(eq(schema.videoMerges.id, mergeId)).run()


  db.update(schema.episodes)
    .set({ videoUrl: mergedRelative, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId)).run()

  if (workflowJobId) {
    completeWorkflowJob(workflowJobId, {
      outputSummary: `merge:${mergeId}`,
      metadata: { mergeId, episodeId, output: mergedRelative, duration, clips: videos.length, transition: transition.kind },
    })
  }

  logTaskSuccess('MergeTask', 'episode-merge', { mergeId, episodeId, output: mergedRelative, duration, clips: videos.length })
}

async function doDramaMerge(
  mergeId: number,
  dramaId: number,
  transition: MergeTransitionConfig,
  workflowJobId?: number | null,
) {
  const episodes = db.select().from(schema.episodes)
    .where(eq(schema.episodes.dramaId, dramaId))
    .orderBy(schema.episodes.episodeNumber)
    .all()
    .filter((episode) => !episode.deletedAt && !!episode.videoUrl)

  if (episodes.length < 2) {
    throw new Error('At least 2 finalized episodes are required to build the drama compilation')
  }

  const videos = episodes
    .map((episode) => episode.videoUrl)
    .filter(Boolean) as string[]

  const { mergedRelative, duration } = await renderMergedVideo(videos, transition)

  db.update(schema.videoMerges)
    .set({
      status: 'completed',
      mergedUrl: mergedRelative,
      duration,
      completedAt: now(),
      scenes: JSON.stringify(episodes.map((episode) => ({
        episode_id: episode.id,
        episode_number: episode.episodeNumber,
        title: episode.title,
        video_url: episode.videoUrl,
      }))),
    })
    .where(eq(schema.videoMerges.id, mergeId))
    .run()

  if (workflowJobId) {
    completeWorkflowJob(workflowJobId, {
      outputSummary: `merge-drama:${mergeId}`,
      metadata: {
        mergeId,
        dramaId,
        output: mergedRelative,
        duration,
        episodeCount: episodes.length,
        transition: transition.kind,
      },
    })
  }

  logTaskSuccess('MergeTask', 'drama-merge', { mergeId, dramaId, output: mergedRelative, duration, clips: videos.length })
}

async function renderMergedVideo(
  videos: string[],
  transition: MergeTransitionConfig,
) {
  if (!videos.length) throw new Error('No videos to merge')

  const videoInfos = await Promise.all(videos.map((video) => getVideoInfo(toAbsPath(video))))
  const baseVideoInfo = videoInfos[0]
  const targetWidth = normalizeDimension(baseVideoInfo.width, 1280)
  const targetHeight = normalizeDimension(baseVideoInfo.height, 720)


  const outputDir = path.join(STORAGE_ROOT, 'merged')
  fs.mkdirSync(outputDir, { recursive: true })
  const baseOutputFilename = `${uuid()}.base.mp4`
  const baseOutputPath = path.join(outputDir, baseOutputFilename)
  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  if (canUseMergeTransition(videoInfos.map((info) => info.duration), transition)) {
    await mergeWithTransitions(baseOutputPath, videos, videoInfos, targetWidth, targetHeight, transition)
  } else {
    await mergeWithConcat(baseOutputPath, videos, targetWidth, targetHeight)
  }

  const baseDuration = await getPreciseVideoDuration(baseOutputPath)
  await mixAudioCuesIntoVideo({
    inputVideoPath: baseOutputPath,
    outputVideoPath: outputPath,
    cues: [],
    videoDurationSeconds: baseDuration,
    normalizeAudio: true,
    duckingRatio: 0.34,
  })
  if (fs.existsSync(baseOutputPath)) fs.rmSync(baseOutputPath, { force: true })


  const duration = await getVideoDuration(outputPath)

  const mergedRelative = `static/merged/${outputFilename}`
  return { mergedRelative, duration }
}

function composedStoryboardsForEpisode(episodeId: number) {
  return db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()
    .filter((storyboard) => !!storyboard.composedVideoUrl)
}

function buildStoryboardTimeline(
  storyboards: Array<typeof schema.storyboards.$inferSelect>,
  videoInfos: Array<{ width: number; height: number; duration: number }>,
  transition: MergeTransitionConfig,
): StoryboardTimelineItem[] {
  const items: StoryboardTimelineItem[] = []
  let cursor = 0

  storyboards.forEach((storyboard, index) => {
    const durationSeconds = Math.max(0.1, Number(videoInfos[index]?.duration || 0.1))
    const startSeconds = cursor
    const endSeconds = startSeconds + durationSeconds
    items.push({
      storyboardId: storyboard.id,
      sceneId: storyboard.sceneId ?? null,
      startSeconds,
      endSeconds,
      durationSeconds,
      dialogue: String(storyboard.dialogue || ''),
      ttsAudioUrl: storyboard.ttsAudioUrl || null,
    })

    const nextDuration = Math.max(0.1, Number(videoInfos[index + 1]?.duration || 0.1))
    const transitionDuration = index < storyboards.length - 1
      ? getSafeMergeTransitionDuration(durationSeconds, nextDuration, transition.durationSeconds)
      : 0
    cursor = endSeconds - transitionDuration
  })

  return items
}

function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(0); return }
      resolve(Math.round(metadata.format.duration || 0))
    })
  })
}

function getPreciseVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(0); return }
      resolve(Number(metadata?.format?.duration || 0))
    })
  })
}

function getVideoInfo(filePath: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        resolve({ width: 1280, height: 720, duration: 0 })
        return
      }
      const videoStream = metadata.streams?.find((stream) => stream.codec_type === 'video')
      resolve({
        width: Number(videoStream?.width || 1280),
        height: Number(videoStream?.height || 720),
        duration: Number(metadata?.format?.duration || 0),
      })
    })
  })
}

function normalizeDimension(value: number, fallback: number) {
  const safe = Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
  return safe % 2 === 0 ? safe : safe - 1
}

function formatFilterSeconds(value: number, minimum = 0.01) {
  return Math.max(minimum, value).toFixed(3)
}

function buildNormalizedInputs(videos: string[], targetWidth: number, targetHeight: number) {
  const complexFilters: string[] = []
  videos.forEach((video, index) => {
    void video
    complexFilters.push(`[${index}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24,format=yuv420p,setpts=PTS-STARTPTS[v${index}]`)
    complexFilters.push(`[${index}:a]aformat=sample_rates=48000:channel_layouts=stereo,aresample=48000:async=1:first_pts=0,asetpts=N/SR/TB[a${index}]`)
  })
  return complexFilters
}

async function mergeWithConcat(outputPath: string, videos: string[], targetWidth: number, targetHeight: number) {
  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg()
    const complexFilters = buildNormalizedInputs(videos, targetWidth, targetHeight)
    const concatInputs: string[] = []

    videos.forEach((video, index) => {
      cmd = cmd.input(toAbsPath(video))
      concatInputs.push(`[v${index}][a${index}]`)
    })

    complexFilters.push(`${concatInputs.join('')}concat=n=${videos.length}:v=1:a=1[vout][aout]`)

    cmd.complexFilter(complexFilters)
      .outputOptions([
        '-map', '[vout]',
        '-map', '[aout]',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-ar', '48000',
        '-b:a', '192k',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

async function mergeWithTransitions(
  outputPath: string,
  videos: string[],
  videoInfos: Array<{ width: number; height: number; duration: number }>,
  targetWidth: number,
  targetHeight: number,
  transition: MergeTransitionConfig,
) {
  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg()
    const complexFilters = buildNormalizedInputs(videos, targetWidth, targetHeight)

    videos.forEach((video) => {
      cmd = cmd.input(toAbsPath(video))
    })

    let currentVideoLabel = '[v0]'
    let currentAudioLabel = '[a0]'
    let currentDuration = Math.max(0.1, Number(videoInfos[0]?.duration || 0.1))

    for (let index = 1; index < videos.length; index++) {
      const clipDuration = Math.max(0.1, Number(videoInfos[index]?.duration || 0.1))
      const transitionDuration = getSafeMergeTransitionDuration(currentDuration, clipDuration, transition.durationSeconds)
      const offset = Math.max(0, currentDuration - transitionDuration)
      const nextVideoLabel = `[vx${index}]`
      const nextAudioLabel = `[ax${index}]`

      complexFilters.push(`${currentVideoLabel}[v${index}]xfade=transition=${transition.xfadeTransition}:duration=${formatFilterSeconds(transitionDuration)}:offset=${formatFilterSeconds(offset, 0)}${nextVideoLabel}`)
      complexFilters.push(`${currentAudioLabel}[a${index}]acrossfade=d=${formatFilterSeconds(transitionDuration)}:c1=tri:c2=tri${nextAudioLabel}`)

      currentVideoLabel = nextVideoLabel
      currentAudioLabel = nextAudioLabel
      currentDuration = currentDuration + clipDuration - transitionDuration
    }

    cmd.complexFilter(complexFilters)
      .outputOptions([
        '-map', currentVideoLabel,
        '-map', currentAudioLabel,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-ar', '48000',
        '-b:a', '192k',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}
