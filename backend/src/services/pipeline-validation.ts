import fs from 'fs'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { dedupeAdjacentStoryboardDialogues } from './storyboard-dialogue.js'
import { hasStoryboardComposeSource } from './storyboard-compose-source.js'
import { getAudioCueAbsolutePath, listAudioCuesForScope } from './audio-cues.js'
import { findScriptStructuralIssues } from './script-sanitizer.js'
import { getStoryboardSpokenDialogue } from './storyboard-speech.js'
import { resolveStoragePath } from '../utils/storage.js'

export type ValidationIssue = {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  entityType?: string
  entityId?: number | null
}

type ResolvedCue = ReturnType<typeof listAudioCuesForScope>[number]

const CHINESE_RE = /[\u3400-\u9fff]/
const DIALOGUE_IN_VISUAL_RE = /\b(dialogue|caption|subtitle|narration|voice ?over|lip ?sync|fala|legendas?)\b/i
const PORTUGUESE_VISUAL_RE = /\b(?:de|da|do|das|dos|uma|um|para|com|sem|entre|sobre|quando|enquanto|preocupação|preocupacao|determin[aã]ção|determinacao|l[aá]grimas|clar[aã]o|ilha|ilhas|c[eé]u|noite|entardecer)\b/i

function cueHasValidAsset(cue: ResolvedCue | null | undefined) {
  if (!cue?.assetId) return false
  const sourcePath = cue.asset?.sourcePath || cue.asset?.url || cue.asset?.localPath || null
  const absolutePath = getAudioCueAbsolutePath(sourcePath)
  return !!absolutePath && fs.existsSync(absolutePath)
}

function storyboardHasDialogue(storyboard: typeof schema.storyboards.$inferSelect) {
  return !!String(getStoryboardSpokenDialogue(storyboard) || '').trim()
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

function storyboardHasSoundPrompt(storyboard: typeof schema.storyboards.$inferSelect) {
  return !!String(storyboard.soundEffect || '').trim()
}

function formatSceneScopeLabel(scene: typeof schema.scenes.$inferSelect | null | undefined, sceneId: number) {
  if (!scene) return `Cenario #${sceneId}`
  const location = String(scene.location || '').trim()
  const time = String(scene.time || '').trim()
  return [location, time].filter(Boolean).join(' · ') || `Cenario #${sceneId}`
}

export function validateExpectedLanguage(content: string, expected: 'pt-BR' | 'en', code: string): ValidationIssue[] {
  const text = String(content || '').trim()
  if (!text) return [{ code, severity: 'error', message: 'Conteudo vazio.' }]

  if (expected === 'pt-BR' && CHINESE_RE.test(text)) {
    return [{ code, severity: 'error', message: 'Conteudo contem texto em chines, mas a etapa exige pt-BR.' }]
  }

  return []
}

export function validateVisualPrompt(prompt: string, code = 'visual_prompt') {
  const text = String(prompt || '').trim()
  if (!text) return [{ code, severity: 'error', message: 'Prompt visual vazio.' }]
  if (DIALOGUE_IN_VISUAL_RE.test(text)) {
    return [{ code, severity: 'error', message: 'Prompt visual contem fala, legenda ou instrucao de audio.' }]
  }
  if (CHINESE_RE.test(text)) {
    return [{ code, severity: 'warning', message: 'Prompt visual ainda contem caracteres chineses.' }]
  }
  if (PORTUGUESE_VISUAL_RE.test(text)) {
    return [{ code, severity: 'warning', message: 'Prompt visual ainda contem termos em portugues; o pipeline visual exige ingles.' }]
  }
  return []
}

export function validateStoryboardForTTS(storyboardId: number): ValidationIssue[] {
  const [storyboard] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!storyboard) return [{ code: 'storyboard_not_found', severity: 'error', message: 'Tomada nao encontrada.', entityType: 'storyboard', entityId: storyboardId }]

  const dialogue = String(getStoryboardSpokenDialogue(storyboard) || '').trim()
  if (!dialogue) return [{ code: 'tts_missing_dialogue', severity: 'warning', message: 'Tomada sem fala; TTS nao e necessario.', entityType: 'storyboard', entityId: storyboardId }]
  if (!storyboardHasValidTtsAudio(storyboard)) {
    return [{ code: 'tts_missing_audio', severity: 'error', message: 'Tomada com fala sem arquivo de audio TTS valido.', entityType: 'storyboard', entityId: storyboardId }]
  }
  return []
}

export function validateEpisodeForCompose(episodeId: number): ValidationIssue[] {
  const storyboards = dedupeAdjacentStoryboardDialogues(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .orderBy(schema.storyboards.storyboardNumber)
      .all(),
  )

  if (!storyboards.length) {
    return [{ code: 'compose_missing_storyboards', severity: 'error', message: 'Episodio sem tomadas.', entityType: 'episode', entityId: episodeId }]
  }

  const issues: ValidationIssue[] = []
  for (const storyboard of storyboards) {
    if (!hasStoryboardComposeSource(storyboard)) {
      issues.push({
        code: 'compose_missing_visual_source',
        severity: 'error',
        message: `Tomada #${storyboard.storyboardNumber} sem midia base para composicao.`,
        entityType: 'storyboard',
        entityId: storyboard.id,
      })
    }
    if (String(storyboard.dialogue || '').trim() && !storyboardHasValidTtsAudio(storyboard)) {
      issues.push({
        code: 'compose_missing_tts',
        severity: 'error',
        message: `Tomada #${storyboard.storyboardNumber} contem fala mas nao tem TTS.`,
        entityType: 'storyboard',
        entityId: storyboard.id,
      })
    }

    const localAudioCues = listAudioCuesForScope('storyboard', storyboard.id)
      .filter((cue) => cue.layerType === 'sfx' || cue.layerType === 'ambience')

    for (const cue of localAudioCues) {
      if (!cue.assetId) continue
      const sourcePath = cue.asset?.sourcePath || cue.asset?.url || cue.asset?.localPath || null
      const absolutePath = getAudioCueAbsolutePath(sourcePath)
      if (!absolutePath || !fs.existsSync(absolutePath)) {
        issues.push({
          code: 'compose_missing_audio_cue_asset',
          severity: 'error',
          message: `Tomada #${storyboard.storyboardNumber} tem cue de audio sem arquivo valido.`,
          entityType: 'storyboard',
          entityId: storyboard.id,
        })
      }
    }
  }
  issues.push(...validateEpisodeAudioCoverage(episodeId))
  return issues
}

export function validateEpisodeForMerge(episodeId: number): ValidationIssue[] {
  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()

  if (!storyboards.length) {
    return [{ code: 'merge_missing_storyboards', severity: 'error', message: 'Episodio sem tomadas.', entityType: 'episode', entityId: episodeId }]
  }

  const issues: ValidationIssue[] = storyboards
    .filter((storyboard) => !storyboard.composedVideoUrl)
    .map((storyboard) => ({
      code: 'merge_missing_composed_video',
      severity: 'error' as const,
      message: `Tomada #${storyboard.storyboardNumber} ainda nao foi composta.`,
      entityType: 'storyboard',
      entityId: storyboard.id,
    }))

  const sceneIds = [...new Set(storyboards.map((storyboard) => storyboard.sceneId).filter((value): value is number => Number.isFinite(Number(value))))]
  const longFormAudioCues = [
    ...listAudioCuesForScope('episode', episodeId),
    ...sceneIds.flatMap((sceneId) => listAudioCuesForScope('scene', sceneId)),
  ]

  for (const cue of longFormAudioCues) {
    if (!cue.assetId) continue
    const sourcePath = cue.asset?.sourcePath || cue.asset?.url || cue.asset?.localPath || null
    const absolutePath = getAudioCueAbsolutePath(sourcePath)
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      issues.push({
        code: 'merge_missing_audio_cue_asset',
        severity: 'error',
        message: `Cue de audio #${cue.id} nao tem arquivo valido para a montagem final.`,
        entityType: cue.scopeType,
        entityId: cue.scopeId,
      })
    }
  }

  issues.push(...validateEpisodeAudioCoverage(episodeId))

  return issues
}

export function validateEpisodeAudioCoverage(episodeId: number): ValidationIssue[] {
  const storyboards = dedupeAdjacentStoryboardDialogues(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .orderBy(schema.storyboards.storyboardNumber)
      .all(),
  )

  if (!storyboards.length) {
    return [{ code: 'audio_missing_storyboards', severity: 'error', message: 'Episodio sem tomadas para desenhar a trilha e os efeitos.', entityType: 'episode', entityId: episodeId }]
  }

  const issues: ValidationIssue[] = []
  const sceneIds = [...new Set(storyboards.map((storyboard) => Number(storyboard.sceneId || 0)).filter((value) => value > 0))]
  const allScenes = db.select().from(schema.scenes).all()
  const scenesById = new Map(
    allScenes
      .filter((scene) => sceneIds.includes(scene.id))
      .map((scene) => [scene.id, scene]),
  )

  const episodeCues = listAudioCuesForScope('episode', episodeId)
  const hasEpisodeScore = episodeCues.some((cue) => cue.layerType === 'score' && cueHasValidAsset(cue))
  const hasEpisodeAmbience = episodeCues.some((cue) => cue.layerType === 'ambience' && cueHasValidAsset(cue))

  const sceneCueMap = new Map(sceneIds.map((sceneId) => [sceneId, listAudioCuesForScope('scene', sceneId)]))
  const storyboardCueMap = new Map(storyboards.map((storyboard) => [storyboard.id, listAudioCuesForScope('storyboard', storyboard.id)]))
  const storyboardsMissingLocalSoundCue: number[] = []

  const hasAnySceneScore = [...sceneCueMap.values()].some((cues) => cues.some((cue) => cue.layerType === 'score' && cueHasValidAsset(cue)))
  if (!hasEpisodeScore && !hasAnySceneScore) {
    issues.push({
      code: 'audio_missing_score',
      severity: 'error',
      message: 'O episodio ainda nao tem trilha sonora com arquivo anexado.',
      entityType: 'episode',
      entityId: episodeId,
    })
  }

  for (const sceneId of sceneIds) {
    const sceneStoryboards = storyboards.filter((storyboard) => Number(storyboard.sceneId || 0) === sceneId)
    const scene = scenesById.get(sceneId) || null
    const hasDialogueInScene = sceneStoryboards.some(storyboardHasDialogue)
    const sceneCues = sceneCueMap.get(sceneId) || []
    const hasSceneAmbience = sceneCues.some((cue) => cue.layerType === 'ambience' && cueHasValidAsset(cue))
    const hasStoryboardAmbience = sceneStoryboards.some((storyboard) => (storyboardCueMap.get(storyboard.id) || []).some((cue) => cue.layerType === 'ambience' && cueHasValidAsset(cue)))

    if (hasDialogueInScene && !hasEpisodeAmbience && !hasSceneAmbience && !hasStoryboardAmbience) {
      issues.push({
        code: 'audio_missing_ambience',
        severity: 'error',
        message: `${formatSceneScopeLabel(scene, sceneId)} contem falas, mas ainda nao tem ambiencia com arquivo.`,
        entityType: 'scene',
        entityId: sceneId,
      })
    }

    for (const storyboard of sceneStoryboards) {
      if (!storyboardHasSoundPrompt(storyboard)) continue
      const hasLocalSoundCue = (storyboardCueMap.get(storyboard.id) || []).some((cue) => (cue.layerType === 'sfx' || cue.layerType === 'ambience') && cueHasValidAsset(cue))
      if (!hasLocalSoundCue) {
        storyboardsMissingLocalSoundCue.push(storyboard.storyboardNumber)
      }
    }
  }

  if (storyboardsMissingLocalSoundCue.length) {
    issues.push({
      code: 'audio_missing_sfx_batch',
      severity: 'warning',
      message: storyboardsMissingLocalSoundCue.length === 1
        ? `A tomada #${storyboardsMissingLocalSoundCue[0]} ainda tem prompt de efeito sonoro sem cue local com arquivo.`
        : `${storyboardsMissingLocalSoundCue.length} tomadas ainda tem prompt de efeito sonoro sem cue local com arquivo.`,
      entityType: 'episode',
      entityId: episodeId,
    })
  }

  return issues
}

export function validateEpisodeScript(episodeId: number) {
  const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!episode) return [{ code: 'episode_not_found', severity: 'error', message: 'Episodio nao encontrado.', entityType: 'episode', entityId: episodeId }]
  const content = String(episode.scriptContent || episode.content || '')
  const source = String(episode.content || '')
  const issues = validateExpectedLanguage(content, 'pt-BR', 'script_language')
  for (const message of findScriptStructuralIssues(content, source)) {
    issues.push({
      code: 'script_structure',
      severity: 'error',
      message,
      entityType: 'episode',
      entityId: episodeId,
    })
  }
  return issues
}
