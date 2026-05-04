import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { generateImage } from './image-generation.js'
import { generateVideo } from './video-generation.js'
import { generateTTS } from './tts-generation.js'
import { composeStoryboard } from './ffmpeg-compose.js'
import { mergeEpisodeVideos } from './ffmpeg-merge.js'
import { getAudioConfigById } from './ai.js'
import { resolveStoryboardVoiceSelection } from './storyboard-voice.js'
import { getStoryboardSpokenDialogue } from './storyboard-speech.js'
import { prepareStoryboardVideoRequest, prepareVisualImageRequest } from './visual-identity.js'
import { validateEpisodeForMerge } from './pipeline-validation.js'
import { getEffectiveStoryboardReviewStatus } from './storyboard-review.js'

const IGNORE_TTS_SPEAKERS = /^(sfx|sound ?effect|bgm|ambient)$/i
const IGNORE_TTS_TEXT = /^(none|null|n\/a|na|bgm|sfx|ambient)$/i
const DEFAULT_POLL_INTERVAL_MS = 2000
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

export type EpisodeOrchestratorTarget = 'storyboard_review' | 'publish_ready'

export type EpisodeOrchestrationResult = {
  status: 'needs_review' | 'blocked' | 'completed'
  target: EpisodeOrchestratorTarget
  updatedStoryboardIds: number[]
  pendingReviewCount: number
  mergeId?: number | null
  mergedUrl?: string | null
  blockedReasons?: string[]
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseDialogueForTTS(dialogue?: string | null) {
  const raw = dialogue?.trim() || ''
  if (!raw) return { speaker: '', pureText: '', ignorable: true }
  const speakerMatch = raw.match(/^(.+?)[:：]/)
  const speaker = speakerMatch ? speakerMatch[1].replace(/[（(].+?[)）]/g, '').trim() : ''
  const pureText = raw.replace(/^.+?[:：]\s*/, '').replace(/[（(].+?[)）]/g, '').trim()
  const ignorable = (!!speaker && IGNORE_TTS_SPEAKERS.test(speaker)) || !pureText || IGNORE_TTS_TEXT.test(pureText)
  return { speaker, pureText, ignorable }
}

function getEpisodeCharacters(episodeId: number, dramaId: number) {
  const linkedCharacterIds = new Set(
    db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId))
      .all()
      .map((link) => link.characterId),
  )

  return db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId))
    .all()
    .filter((character) => !character.deletedAt && linkedCharacterIds.has(character.id))
}

function getEpisodeScenes(episodeId: number, dramaId: number) {
  const linkedSceneIds = new Set(
    db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.episodeId, episodeId))
      .all()
      .map((link) => link.sceneId),
  )

  return db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, dramaId))
    .all()
    .filter((scene) => !scene.deletedAt && linkedSceneIds.has(scene.id))
}

function getEpisodeStoryboards(episodeId: number) {
  return db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()
    .filter((storyboard) => !storyboard.deletedAt)
    .sort((left, right) => Number(left.storyboardNumber || 0) - Number(right.storyboardNumber || 0))
}

function getStoryboardCharacterIds(storyboardId: number) {
  return db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    .all()
    .map((link) => link.characterId)
}

async function waitForRecordCompletion<T extends { status?: string | null; errorMsg?: string | null }>(
  reader: () => T | undefined,
  label: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const startedAt = Date.now()
  while ((Date.now() - startedAt) < timeoutMs) {
    const record = reader()
    const status = String(record?.status || '').toLowerCase()
    if (status === 'completed') return record
    if (status === 'failed') {
      throw new Error(`${label} failed: ${record?.errorMsg || 'unknown error'}`)
    }
    await sleep(DEFAULT_POLL_INTERVAL_MS)
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`)
}

async function ensureCharacterImage(character: typeof schema.characters.$inferSelect, episode: typeof schema.episodes.$inferSelect) {
  const before = String(character.imageUrl || '').trim()
  if (before) return false

  const prepared = prepareVisualImageRequest({
    characterId: character.id,
    episodeId: episode.id,
    prompt: '',
    frameType: 'character_portrait',
    referenceImages: [],
  })

  const generation = await generateImage({
    characterId: character.id,
    dramaId: character.dramaId,
    episodeId: episode.id,
    prompt: prepared.prompt,
    referenceImages: prepared.referenceImages,
    seed: prepared.seed,
    configId: episode.imageConfigId ?? undefined,
  })

  if (!generation.cacheHit) {
    await waitForRecordCompletion(
      () => db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, generation.id)).all()[0],
      `character image ${character.id}`,
    )
  }

  const [updated] = db.select().from(schema.characters).where(eq(schema.characters.id, character.id)).all()
  return !before && !!String(updated?.imageUrl || '').trim()
}

async function ensureSceneImage(scene: typeof schema.scenes.$inferSelect, episode: typeof schema.episodes.$inferSelect) {
  const before = String(scene.imageUrl || '').trim()
  if (before) return false

  const prepared = prepareVisualImageRequest({
    sceneId: scene.id,
    episodeId: episode.id,
    prompt: '',
    frameType: 'scene_environment',
    referenceImages: [],
  })

  const generation = await generateImage({
    sceneId: scene.id,
    dramaId: scene.dramaId,
    episodeId: episode.id,
    prompt: prepared.prompt,
    referenceImages: prepared.referenceImages,
    seed: prepared.seed,
    configId: episode.imageConfigId ?? undefined,
  })

  if (!generation.cacheHit) {
    await waitForRecordCompletion(
      () => db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, generation.id)).all()[0],
      `scene image ${scene.id}`,
    )
  }

  const [updated] = db.select().from(schema.scenes).where(eq(schema.scenes.id, scene.id)).all()
  return !before && !!String(updated?.imageUrl || '').trim()
}

async function ensureStoryboardBaseFrame(storyboard: typeof schema.storyboards.$inferSelect, episode: typeof schema.episodes.$inferSelect) {
  const before = String(storyboard.composedImage || '').trim()
  if (before) return false

  const prepared = prepareVisualImageRequest({
    storyboardId: storyboard.id,
    episodeId: episode.id,
    prompt: '',
    frameType: 'composed',
    referenceImages: [],
  })

  const generation = await generateImage({
    storyboardId: storyboard.id,
    dramaId: episode.dramaId,
    episodeId: episode.id,
    prompt: prepared.prompt,
    referenceImages: prepared.referenceImages,
    seed: prepared.seed,
    frameType: 'composed',
    configId: episode.imageConfigId ?? undefined,
  })

  if (!generation.cacheHit) {
    await waitForRecordCompletion(
      () => db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, generation.id)).all()[0],
      `storyboard frame ${storyboard.id}`,
    )
  }

  const [updated] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboard.id)).all()
  return !before && !!String(updated?.composedImage || '').trim()
}

async function ensureStoryboardTTS(storyboard: typeof schema.storyboards.$inferSelect, episode: typeof schema.episodes.$inferSelect) {
  const before = String(storyboard.ttsAudioUrl || '').trim()
  if (before) return false

  const parsedDialogue = parseDialogueForTTS(getStoryboardSpokenDialogue(storyboard))
  if (parsedDialogue.ignorable || !parsedDialogue.pureText) return false

  const audioProvider = getAudioConfigById(episode.audioConfigId ?? null)?.provider || null
  const linkedCharacterIds = getStoryboardCharacterIds(storyboard.id)
  const allCharacters = getEpisodeCharacters(episode.id, episode.dramaId)
  const linkedCharacters = allCharacters.filter((character) => linkedCharacterIds.includes(character.id))
  const { voiceId } = resolveStoryboardVoiceSelection({
    provider: audioProvider,
    speaker: parsedDialogue.speaker,
    linkedCharacters,
    allCharacters,
  })

  const audioPath = await generateTTS({
    text: parsedDialogue.pureText,
    voice: voiceId,
    configId: episode.audioConfigId ?? undefined,
  })

  db.update(schema.storyboards)
    .set({ ttsAudioUrl: audioPath, updatedAt: new Date().toISOString() })
    .where(eq(schema.storyboards.id, storyboard.id))
    .run()

  const [updated] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboard.id)).all()
  return !before && !!String(updated?.ttsAudioUrl || '').trim()
}

async function ensureStoryboardVideo(storyboard: typeof schema.storyboards.$inferSelect, episode: typeof schema.episodes.$inferSelect) {
  if (String(storyboard.videoUrl || '').trim()) return false

  const prepared = prepareStoryboardVideoRequest({
    storyboardId: storyboard.id,
    prompt: storyboard.videoPrompt || storyboard.description || storyboard.action || storyboard.title || '',
  })

  const generation = await generateVideo({
    storyboardId: storyboard.id,
    dramaId: episode.dramaId,
    episodeId: episode.id,
    prompt: prepared.prompt,
    referenceMode: prepared.referenceMode,
    imageUrl: prepared.imageUrl || undefined,
    firstFrameUrl: prepared.firstFrameUrl || undefined,
    lastFrameUrl: prepared.lastFrameUrl || undefined,
    referenceImageUrls: prepared.referenceImageUrls,
    duration: Number(storyboard.duration || 5),
    configId: episode.videoConfigId ?? undefined,
  })

  if (!generation.cacheHit) {
    await waitForRecordCompletion(
      () => db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, generation.id)).all()[0],
      `storyboard video ${storyboard.id}`,
    )
  }

  return true
}

function markStoryboardsPendingReview(storyboardIds: number[]) {
  const uniqueIds = [...new Set(storyboardIds.filter(Boolean))]
  if (!uniqueIds.length) return

  for (const storyboardId of uniqueIds) {
    db.update(schema.storyboards)
      .set({ reviewStatus: 'pending_review', updatedAt: new Date().toISOString() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
  }
}

function getReviewBlockingStoryboards(episodeId: number) {
  return getEpisodeStoryboards(episodeId).filter((storyboard) => getEffectiveStoryboardReviewStatus(storyboard) !== 'approved')
}

async function waitForMergeCompletion(mergeId: number) {
  const merge = await waitForRecordCompletion(
    () => db.select().from(schema.videoMerges).where(eq(schema.videoMerges.id, mergeId)).all()[0],
    `episode merge ${mergeId}`,
  )
  return merge
}

export async function orchestrateEpisodeProduction(input: {
  episodeId: number
  target?: EpisodeOrchestratorTarget
}): Promise<EpisodeOrchestrationResult> {
  const target = input.target || 'publish_ready'
  const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, input.episodeId)).all()
  if (!episode) {
    throw new Error('Episode not found')
  }

  const initialStoryboards = getEpisodeStoryboards(episode.id)
  if (!initialStoryboards.length) {
    throw new Error('Episode has no storyboards to orchestrate')
  }

  const updatedStoryboardIds = new Set<number>()

  const characters = getEpisodeCharacters(episode.id, episode.dramaId)
  for (const character of characters) {
    await ensureCharacterImage(character, episode)
  }

  const scenes = getEpisodeScenes(episode.id, episode.dramaId)
  for (const scene of scenes) {
    await ensureSceneImage(scene, episode)
  }

  for (const storyboard of initialStoryboards) {
    if (await ensureStoryboardBaseFrame(storyboard, episode)) {
      updatedStoryboardIds.add(storyboard.id)
    }
  }

  const refreshedForAudio = getEpisodeStoryboards(episode.id)
  for (const storyboard of refreshedForAudio) {
    if (await ensureStoryboardTTS(storyboard, episode)) {
      updatedStoryboardIds.add(storyboard.id)
    }
  }

  if (updatedStoryboardIds.size > 0) {
    markStoryboardsPendingReview([...updatedStoryboardIds])
  }

  const reviewBlockingStoryboards = getReviewBlockingStoryboards(episode.id)
  if (target === 'storyboard_review' && (updatedStoryboardIds.size > 0 || reviewBlockingStoryboards.length > 0)) {
    return {
      status: 'needs_review',
      target,
      updatedStoryboardIds: [...updatedStoryboardIds],
      pendingReviewCount: reviewBlockingStoryboards.length,
    }
  }

  if (reviewBlockingStoryboards.length > 0) {
    return {
      status: 'needs_review',
      target,
      updatedStoryboardIds: [...updatedStoryboardIds],
      pendingReviewCount: reviewBlockingStoryboards.length,
    }
  }

  const refreshedStoryboards = getEpisodeStoryboards(episode.id)
  for (const storyboard of refreshedStoryboards) {
    await ensureStoryboardVideo(storyboard, episode)
  }

  const readyToCompose = getEpisodeStoryboards(episode.id)
  for (const storyboard of readyToCompose) {
    if (!String(storyboard.composedVideoUrl || '').trim()) {
      await composeStoryboard(storyboard.id)
    }
  }

  const mergeIssues = validateEpisodeForMerge(episode.id)
  const blockingMergeIssues = mergeIssues.filter((issue) => issue.severity === 'error')
  if (blockingMergeIssues.length > 0) {
    return {
      status: 'blocked',
      target,
      updatedStoryboardIds: [...updatedStoryboardIds],
      pendingReviewCount: 0,
      blockedReasons: blockingMergeIssues.map((issue) => issue.message),
    }
  }

  const mergeId = await mergeEpisodeVideos(episode.id, episode.dramaId, null)
  const merge = await waitForMergeCompletion(mergeId)

  return {
    status: 'completed',
    target,
    updatedStoryboardIds: [...updatedStoryboardIds],
    pendingReviewCount: 0,
    mergeId,
    mergedUrl: merge?.mergedUrl || null,
  }
}
