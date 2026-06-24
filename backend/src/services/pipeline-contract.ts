import fs from 'fs'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { getLatestMergeForEpisode } from './merge-status.js'
import { dedupeAdjacentStoryboardDialogues } from './storyboard-dialogue.js'
import { sanitizeEpisodeCharacterRows, sanitizeEpisodeSceneRows } from './extraction-entities.js'
import { getStoryboardSpokenDialogue } from './storyboard-speech.js'
import { validateEpisodeAudioCoverage, validateEpisodeForCompose, validateEpisodeForMerge, validateEpisodeScript } from './pipeline-validation.js'
import { getAudioCueAbsolutePath, listAudioCuesForScope } from './audio-cues.js'
import { getEffectiveStoryboardReviewStatus, storyboardHasBaseVisual } from './storyboard-review.js'
import { resolveStoragePath } from '../utils/storage.js'

export type CanonicalPipelineState =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'needs_review'
  | 'complete'
  | 'not_applicable'

export type PipelineStageSummary = {
  key: string
  state: CanonicalPipelineState
  status: 'pending' | 'ready' | 'partial' | 'done' | 'blocked' | 'running' | 'not_applicable'
  count?: number
  total?: number
  blocked?: boolean
  issues?: Array<{ code: string; severity: string; message: string; entityType?: string; entityId?: number | null }>
  meta?: Record<string, any>
}

export type PipelineContract = {
  episodeId: number
  stages: Record<string, PipelineStageSummary>
  steps: Record<string, Record<string, any>>
  nextAction: { key: string; label: string } | null
}

function normalizeLegacyStatus(state: CanonicalPipelineState): PipelineStageSummary['status'] {
  if (state === 'complete') return 'done'
  if (state === 'in_progress' || state === 'needs_review') return 'partial'
  if (state === 'blocked') return 'blocked'
  if (state === 'not_applicable') return 'not_applicable'
  return 'pending'
}

function summarizeCount(current: number, total: number) {
  if (total <= 0) return 'not_started' as const
  if (current <= 0) return 'not_started' as const
  if (current >= total) return 'complete' as const
  return 'in_progress' as const
}

function isNarratorLikeCharacter(character: typeof schema.characters.$inferSelect) {
  const text = `${character.name || ''} ${character.role || ''}`.toLowerCase()
  return /\b(narrator|narrador|narradora|narracao|narração)\b/.test(text)
}

function audioIssueBlocksStage(issue: { code?: string; severity?: string }) {
  if (issue.severity !== 'error') return false
  const code = String(issue.code || '').toLowerCase()
  return code.includes('missing_audio_cue_asset')
    || code.includes('invalid_audio_cue')
    || code.includes('broken_audio')
    || code.includes('missing_tts')
}

function stage(key: string, state: CanonicalPipelineState, patch: Partial<PipelineStageSummary> = {}): PipelineStageSummary {
  return {
    key,
    state,
    status: normalizeLegacyStatus(state),
    ...patch,
  }
}

function cueHasValidAsset(cue: ReturnType<typeof listAudioCuesForScope>[number]) {
  if (!cue?.assetId) return false
  const sourcePath = cue.asset?.sourcePath || cue.asset?.url || cue.asset?.localPath || null
  const absolutePath = getAudioCueAbsolutePath(sourcePath)
  return !!absolutePath && fs.existsSync(absolutePath)
}

function storyboardHasValidTtsAudio(storyboard: typeof schema.storyboards.$inferSelect) {
  const relativePath = String(storyboard.ttsAudioUrl || '').trim()
  if (!relativePath) return false
  try {
    return fs.existsSync(resolveStoragePath(relativePath))
  } catch {
    return false
  }
}

export function buildEpisodePipelineContract(episodeId: number): PipelineContract {
  const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!episode) {
    throw new Error('Episode not found')
  }

  const rawContent = String(episode.content || '').trim()
  const rewrittenScript = String(episode.scriptContent || '').trim()

  const episodeCharacterIds = new Set(
    db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
      .map((link) => link.characterId),
  )
  const episodeSceneIds = new Set(
    db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.episodeId, episodeId)).all()
      .map((link) => link.sceneId),
  )
  const episodePropIds = new Set(
    db.select().from(schema.episodeProps)
      .where(eq(schema.episodeProps.episodeId, episodeId)).all()
      .map((link) => link.propId),
  )

  const characters = sanitizeEpisodeCharacterRows(
    episodeCharacterIds.size
      ? db.select().from(schema.characters)
        .where(and(
          inArray(schema.characters.id, [...episodeCharacterIds]),
          isNull(schema.characters.deletedAt),
        ))
        .all()
      : [],
  ).characters
  const scenes = sanitizeEpisodeSceneRows(
    episodeSceneIds.size
      ? db.select().from(schema.scenes)
        .where(and(
          inArray(schema.scenes.id, [...episodeSceneIds]),
          isNull(schema.scenes.deletedAt),
        ))
        .all()
      : [],
  ).scenes
  const props = episodePropIds.size
    ? db.select().from(schema.props)
      .where(and(
        inArray(schema.props.id, [...episodePropIds]),
        isNull(schema.props.deletedAt),
      ))
      .all()
    : []

  const storyboards = dedupeAdjacentStoryboardDialogues(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .orderBy(schema.storyboards.storyboardNumber)
      .all(),
  )

  const storyboardsWithSpeech = storyboards.filter((row) => String(getStoryboardSpokenDialogue(row) || '').trim())
  const storyboardsWithTts = storyboardsWithSpeech.filter((row) => storyboardHasValidTtsAudio(row))
  const storyboardsWithInvalidTts = storyboardsWithSpeech.filter((row) => {
    const hasTtsReference = String(row.ttsAudioUrl || '').trim()
    return hasTtsReference && !storyboardHasValidTtsAudio(row)
  })
  const charactersWithVoice = characters.filter((row) => row.voiceStyle)
  const charactersWithSample = characters.filter((row) => row.voiceSampleUrl)
  const visualCharacters = characters.filter((row) => !isNarratorLikeCharacter(row))
  const characterVisuals = visualCharacters.filter((row) => row.imageUrl)
  const sceneVisuals = scenes.filter((row) => row.imageUrl)
  const storyboardFrames = storyboards.filter((row) => row.firstFrameImage || row.lastFrameImage || row.composedImage)
  const storyboardVideos = storyboards.filter((row) => row.videoUrl)
  const composedStoryboards = storyboards.filter((row) => row.composedVideoUrl)
  const reviewableStoryboards = storyboards.filter((row) => storyboardHasBaseVisual(row))
  const reviewPendingStoryboards = reviewableStoryboards.filter((row) => getEffectiveStoryboardReviewStatus(row) !== 'approved')
  const approvedReviewStoryboards = reviewableStoryboards.filter((row) => getEffectiveStoryboardReviewStatus(row) === 'approved')
  const latestMerge = getLatestMergeForEpisode(episodeId)

  const episodeAudioCues = listAudioCuesForScope('episode', episodeId)
  const sceneAudioCues = scenes.flatMap((scene) => listAudioCuesForScope('scene', scene.id))
  const storyboardAudioCues = storyboards.flatMap((storyboard) => listAudioCuesForScope('storyboard', storyboard.id))
  const allAudioCues = [...episodeAudioCues, ...sceneAudioCues, ...storyboardAudioCues]
  const readyAudioCueCount = allAudioCues.filter(cueHasValidAsset).length

  const scriptIssues = validateEpisodeScript(episodeId)
  const audioIssues = validateEpisodeAudioCoverage(episodeId)
  const composeIssues = validateEpisodeForCompose(episodeId)
  const mergeIssues = validateEpisodeForMerge(episodeId)

  const stages: Record<string, PipelineStageSummary> = {}

  stages.raw_content = rawContent
    ? stage('raw_content', 'complete')
    : stage('raw_content', 'not_started')

  stages.rewritten_script = rewrittenScript
    ? stage('rewritten_script', scriptIssues.length ? 'needs_review' : 'complete', { issues: scriptIssues })
    : rawContent
      ? stage('rewritten_script', 'not_started')
      : stage('rewritten_script', 'not_started')

  const entityCount = characters.length + scenes.length + props.length
  const entityState = scenes.length > 0 && entityCount > 0
    ? 'complete'
    : rawContent || rewrittenScript
      ? 'not_started'
      : 'not_started'
  stages.entities = stage('entities', entityState, {
    count: entityCount,
    meta: {
      characters: characters.length,
      scenes: scenes.length,
      props: props.length,
    },
  })

  stages.storyboards = storyboards.length
    ? stage('storyboards', 'complete', { count: storyboards.length })
    : rewrittenScript
      ? stage('storyboards', 'not_started', { count: 0 })
      : stage('storyboards', 'not_started', { count: 0 })

  stages.speech_plan = storyboards.length
    ? stage(
      'speech_plan',
      storyboardsWithSpeech.length ? 'complete' : 'not_applicable',
      {
        count: storyboardsWithSpeech.length,
        total: storyboards.length,
      },
    )
    : stage('speech_plan', 'not_started')

  let voiceState: CanonicalPipelineState = 'not_started'
  if (characters.length === 0) {
    voiceState = storyboardsWithSpeech.length ? 'not_applicable' : 'not_started'
  } else {
    voiceState = summarizeCount(charactersWithVoice.length, characters.length)
  }
  stages.voice_assignment = stage('voice_assignment', voiceState, {
    count: charactersWithVoice.length,
    total: characters.length,
  })

  let dubbingState: CanonicalPipelineState = 'not_started'
  if (storyboards.length > 0 && storyboardsWithSpeech.length === 0) {
    dubbingState = 'not_applicable'
  } else if (storyboardsWithSpeech.length > 0) {
    if (storyboardsWithInvalidTts.length > 0) {
      dubbingState = 'blocked'
    } else {
      dubbingState = summarizeCount(storyboardsWithTts.length, storyboardsWithSpeech.length)
    }
  }
  stages.dubbing = stage('dubbing', dubbingState, {
    count: storyboardsWithTts.length,
    total: storyboardsWithSpeech.length,
    blocked: dubbingState === 'blocked',
    issues: storyboardsWithInvalidTts.map((row) => ({
      code: 'invalid_tts_audio',
      severity: 'error',
      message: `Audio TTS da tomada #${row.storyboardNumber} nao foi encontrado no armazenamento.`,
      entityType: 'storyboard',
      entityId: row.id,
    })),
  })

  stages.character_visuals = stage('character_visuals', summarizeCount(characterVisuals.length, visualCharacters.length), {
    count: characterVisuals.length,
    total: visualCharacters.length,
    meta: {
      ignoredNarrators: characters.length - visualCharacters.length,
    },
  })

  stages.scene_visuals = stage('scene_visuals', summarizeCount(sceneVisuals.length, scenes.length), {
    count: sceneVisuals.length,
    total: scenes.length,
  })

  stages.storyboard_frames = stage('storyboard_frames', summarizeCount(storyboardFrames.length, storyboards.length), {
    count: storyboardFrames.length,
    total: storyboards.length,
  })

  const visualTotal = visualCharacters.length + scenes.length + storyboards.length
  const visualReady = characterVisuals.length + sceneVisuals.length + storyboardFrames.length
  stages.visual_assets = stage('visual_assets', summarizeCount(visualReady, visualTotal), {
    count: visualReady,
    total: visualTotal,
    meta: {
      characterImages: characterVisuals.length,
      sceneImages: sceneVisuals.length,
      frames: storyboardFrames.length,
    },
  })

  let reviewState: CanonicalPipelineState = 'not_started'
  if (reviewableStoryboards.length === 0) {
    reviewState = 'not_started'
  } else if (reviewPendingStoryboards.length > 0) {
    reviewState = 'needs_review'
  } else if (reviewableStoryboards.length >= storyboards.length) {
    reviewState = 'complete'
  } else {
    reviewState = 'in_progress'
  }
  stages.review = stage('review', reviewState, {
    count: approvedReviewStoryboards.length,
    total: reviewableStoryboards.length || storyboards.length,
    meta: {
      reviewable: reviewableStoryboards.length,
      pending: reviewPendingStoryboards.length,
    },
  })

  const hasAudioCoverageError = audioIssues.some((issue) => issue.severity === 'error')
  const hasBlockingAudioIssue = audioIssues.some(audioIssueBlocksStage)
  const audioAssetState = hasAudioCoverageError
    ? readyAudioCueCount > 0 ? 'in_progress' : 'not_started'
    : allAudioCues.length ? summarizeCount(readyAudioCueCount, allAudioCues.length) : 'not_started'

  stages.audio_assets = hasBlockingAudioIssue
    ? stage('audio_assets', 'blocked', {
        blocked: true,
        issues: audioIssues,
        count: readyAudioCueCount,
        total: allAudioCues.length,
      })
    : stage(
      'audio_assets',
      audioAssetState,
      {
        blocked: false,
        issues: audioIssues,
        count: readyAudioCueCount,
        total: allAudioCues.length,
      },
    )

  stages.videos = stage('videos', summarizeCount(storyboardVideos.length, storyboards.length), {
    count: storyboardVideos.length,
    total: storyboards.length,
  })

  stages.composition = composeIssues.some((issue) => issue.severity === 'error')
    ? stage('composition', composedStoryboards.length ? 'blocked' : 'blocked', {
      blocked: true,
      issues: composeIssues,
      count: composedStoryboards.length,
      total: storyboards.length,
    })
    : stage('composition', summarizeCount(composedStoryboards.length, storyboards.length), {
      blocked: false,
      issues: composeIssues,
      count: composedStoryboards.length,
      total: storyboards.length,
    })

  let mergeState: CanonicalPipelineState = 'not_started'
  if (latestMerge?.status === 'completed') mergeState = 'complete'
  else if (String(latestMerge?.status || '') === 'processing' || String(latestMerge?.status || '') === 'running') mergeState = 'in_progress'
  else if (mergeIssues.some((issue) => issue.severity === 'error')) mergeState = 'blocked'
  else if (composedStoryboards.length > 0) mergeState = 'not_started'
  stages.merge = stage('merge', mergeState, {
    blocked: mergeIssues.some((issue) => issue.severity === 'error'),
    issues: mergeIssues,
    meta: {
      mergedUrl: latestMerge?.status === 'completed' ? latestMerge?.mergedUrl : null,
      mergeStatus: latestMerge?.status || null,
    },
  })

  const steps = {
    script_rewrite: {
      status: stages.rewritten_script.status === 'done' ? 'done' : rawContent ? 'ready' : 'pending',
      state: stages.rewritten_script.state,
    },
    extract_characters: {
      status: characters.length > 0 ? 'done' : rewrittenScript ? 'pending' : 'pending',
      state: characters.length > 0 ? 'complete' : 'not_started',
      count: characters.length,
    },
    extract_scenes: {
      status: scenes.length > 0 ? 'done' : rewrittenScript ? 'pending' : 'pending',
      state: scenes.length > 0 ? 'complete' : 'not_started',
      count: scenes.length,
    },
    assign_voices: {
      status: stages.voice_assignment.status,
      state: stages.voice_assignment.state,
      assigned: charactersWithVoice.length,
      total: characters.length,
    },
    generate_voice_samples: {
      status: stages.dubbing.status,
      state: stages.dubbing.state,
      completed: storyboardsWithTts.length,
      total: storyboardsWithSpeech.length,
    },
    extract_storyboards: {
      status: storyboards.length ? 'done' : rewrittenScript ? 'pending' : 'pending',
      state: stages.storyboards.state,
      count: storyboards.length,
    },
    generate_images: {
      status: stages.storyboard_frames.status === 'done'
        ? 'done'
        : storyboardFrames.length > 0
          ? 'partial'
          : 'pending',
      state: stages.storyboard_frames.state,
      completed: storyboardFrames.length,
      total: storyboards.length,
    },
    generate_character_images: {
      status: stages.character_visuals.status,
      state: stages.character_visuals.state,
      completed: characterVisuals.length,
      total: visualCharacters.length,
    },
    generate_scene_images: {
      status: stages.scene_visuals.status,
      state: stages.scene_visuals.state,
      completed: sceneVisuals.length,
      total: scenes.length,
    },
    review_storyboards: {
      status: stages.review.state === 'complete'
        ? 'done'
        : stages.review.state === 'needs_review'
          ? 'ready'
          : stages.review.state === 'in_progress'
            ? 'partial'
            : 'pending',
      state: stages.review.state,
      completed: approvedReviewStoryboards.length,
      total: reviewableStoryboards.length || storyboards.length,
    },
    generate_videos: {
      status: stages.videos.status,
      state: stages.videos.state,
      completed: storyboardVideos.length,
      total: storyboards.length,
    },
    compose_shots: {
      status: stages.composition.status,
      state: stages.composition.state,
      completed: composedStoryboards.length,
      total: storyboards.length,
    },
    merge_episode: {
      status: latestMerge?.status === 'completed'
        ? 'done'
        : (latestMerge?.status === 'stale' ? 'pending' : (latestMerge?.status || 'pending')),
      state: stages.merge.state,
      merged_url: latestMerge?.status === 'completed' ? latestMerge?.mergedUrl : null,
    },
  }

  const nextAction = selectNextAction(stages)

  return {
    episodeId,
    stages,
    steps,
    nextAction,
  }
}

function selectNextAction(stages: Record<string, PipelineStageSummary>) {
  const ordered = [
    ['raw_content', 'Fill raw content'],
    ['rewritten_script', 'Rewrite script'],
    ['entities', 'Extract entities'],
    ['storyboards', 'Break into storyboards'],
    ['voice_assignment', 'Assign voices'],
    ['dubbing', 'Generate TTS'],
    ['audio_assets', 'Attach score and ambience'],
    ['character_visuals', 'Generate character visuals'],
    ['scene_visuals', 'Generate scene visuals'],
    ['storyboard_frames', 'Generate storyboard frames'],
    ['review', 'Review storyboard assets'],
    ['videos', 'Generate videos'],
    ['composition', 'Compose shots'],
    ['merge', 'Merge episode'],
  ] as const

  for (const [key, label] of ordered) {
    const stage = stages[key]
    if (!stage) continue
    if (stage.state === 'complete' || stage.state === 'not_applicable') continue
    return { key, label }
  }

  return null
}
