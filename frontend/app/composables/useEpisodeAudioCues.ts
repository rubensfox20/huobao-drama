import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { audioCuesAPI, uploadAPI } from './useApi'

type UseEpisodeAudioCuesInput = {
  dramaId: number
  episodeId: ComputedRef<number>
  episodeAudioCues: Ref<any[]>
  scenes: Ref<any[]>
  storyboards: Ref<any[]>
  episodeMessages: Record<string, any>
  t: (path: string, params?: Record<string, string | number>) => string
  refresh: () => Promise<void>
  pickAudioFile: () => Promise<File | null>
  copyPromptValue: (value: string) => Promise<void>
  isMediaPathAvailable?: (path: string | null | undefined) => boolean
}

export function useEpisodeAudioCues(input: UseEpisodeAudioCuesInput) {
  const pendingDeleteAudioCue = ref<any | null>(null)
  const deletingAudioCue = ref(false)

  function toCamel(field: string) {
    return field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  }

  function getAudioCues(scope: any) {
    return scope?.audio_cues || scope?.audioCues || []
  }

  function getCueLayerType(cue: any) {
    return cue?.layer_type || cue?.layerType || ''
  }

  function isSingleLayerAudioScope(scopeType: string, layerType: string) {
    return (scopeType === 'episode' || scopeType === 'scene') && (layerType === 'score' || layerType === 'ambience')
  }

  function hasAudioCueLayer(cues: any[], layerType: string) {
    return (Array.isArray(cues) ? cues : []).some(cue => getCueLayerType(cue) === layerType)
  }

  function getAudioCueCreateLabel(scopeType: string, cues: any[], layerType: string) {
    if (isSingleLayerAudioScope(scopeType, layerType) && hasAudioCueLayer(cues, layerType)) {
      return layerType === 'score'
        ? input.episodeMessages.production.audio.scoreCreated
        : input.episodeMessages.production.audio.ambienceCreated
    }
    if (layerType === 'score') return input.episodeMessages.production.audio.addScore
    if (layerType === 'ambience') return input.episodeMessages.production.audio.addAmbience
    return input.episodeMessages.production.audio.addSfx
  }

  function getCueSortOrder(cue: any) {
    return Number(cue?.sort_order ?? cue?.sortOrder ?? 0) || 0
  }

  function getCueAsset(cue: any) {
    return cue?.asset || null
  }

  function getCueAssetPath(cue: any) {
    const asset = getCueAsset(cue)
    return asset?.source_path || asset?.sourcePath || asset?.url || asset?.local_path || asset?.localPath || null
  }

  function getCuePromptValue(cue: any, fallback = '') {
    return String(cue?.prompt || '').trim() || String(fallback || '').trim()
  }

  function normalizeAudioPromptText(value: string) {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function translateAudioLocation(value: string) {
    const text = normalizeAudioPromptText(value)
    if (!text) return ''

    return text
      .replace(/\bArquipelago de Ilhas Flutuantes\b/gi, 'archipelago of floating islands')
      .replace(/\bEntre as Ilhas Flutuantes\b/gi, 'between the floating islands')
      .replace(/\bSobre as Ilhas Flutuantes\b/gi, 'above the floating islands')
      .replace(/\bIlhas Flutuantes\b/gi, 'floating islands')
      .replace(/\bRua da Vila\b/gi, 'village street')
      .replace(/\bPraca da Vila\b/gi, 'village square')
      .replace(/\bPatio da Vila\b/gi, 'village courtyard')
      .replace(/\bCentro da Vila\b/gi, 'village center')
      .replace(/\bVila de ([A-Za-z' -]+)\b/gi, '$1 village')
  }

  function translateAudioTime(value: string) {
    const text = normalizeAudioPromptText(value)
    if (!text) return ''

    return text
      .replace(/\bEntardecer\b/gi, 'dusk')
      .replace(/\bNoite\b/gi, 'night')
      .replace(/\bAmanhecer\b/gi, 'dawn')
      .replace(/\bDia\b/gi, 'daylight')
  }

  function joinAudioPromptParts(parts: Array<string | null | undefined>) {
    return parts
      .map(part => String(part || '').trim())
      .filter(Boolean)
      .join(', ')
  }

  function getEpisodeAudioFallbackPrompt(layerType: string) {
    if (layerType === 'score') {
      return 'cinematic episode score, evolving emotional arc, smooth transitions between scenes, instrumental only, no vocals'
    }
    return 'continuous environmental ambience bed, subtle spatial texture, smooth transitions between scenes, no voices, no melody'
  }

  function getSceneAudioFallbackPrompt(scene: any, layerType: string) {
    const location = translateAudioLocation(scene?.location)
    const time = translateAudioTime(scene?.time)
    if (layerType === 'score') {
      return joinAudioPromptParts([
        'cinematic scene score',
        location,
        time,
        'emotional underscore',
        'instrumental only',
        'no vocals',
      ])
    }
    return joinAudioPromptParts([
      'environment ambience',
      location,
      time,
      'subtle environmental texture',
      'no voices',
    ])
  }

  function getStoryboardScene(sb: any) {
    const sceneId = sb?.scene_id || sb?.sceneId
    return input.scenes.value.find(scene => scene.id === sceneId) || null
  }

  function getStoryboardAudioCueFallback(sb: any, layerType: string) {
    const stored = layerType === 'sfx'
      ? String(sb?.sound_effect || sb?.soundEffect || '').trim()
      : String(sb?.bgm_prompt || sb?.bgmPrompt || '').trim()
    if (stored) return stored

    const scene = getStoryboardScene(sb)
    const location = translateAudioLocation(sb?.location || scene?.location)
    const time = translateAudioTime(sb?.time || scene?.time)
    if (layerType === 'sfx') {
      return joinAudioPromptParts([
        'cinematic foley',
        location,
        time,
        'focused motion detail',
        'isolated effect',
        'no voices',
      ])
    }
    return joinAudioPromptParts([
      'localized ambience',
      location,
      time,
      'subtle environmental texture',
      'no voices',
    ])
  }

  function getCuePreviewUrl(cue: any) {
    const source = getCueAssetPath(cue)
    if (!source) return ''
    return source.startsWith('/') ? source : `/${source}`
  }

  function cueHasAsset(cue: any) {
    const path = getCueAssetPath(cue)
    return !!path && (input.isMediaPathAvailable ? input.isMediaPathAvailable(path) : true)
  }

  function cueLayerLabel(layerType: string) {
    if (layerType === 'score') return input.episodeMessages.production.audio.layers.score
    if (layerType === 'ambience') return input.episodeMessages.production.audio.layers.ambience
    return input.episodeMessages.production.audio.layers.sfx
  }

  function getAudioScopeSummary(count: number) {
    return input.t('episode.production.audio.scopeSummary', { count: Number(count || 0) })
  }

  function cueScopeLabel(scopeType: string) {
    if (scopeType === 'episode') return input.episodeMessages.production.audio.sections.episodeTitle
    if (scopeType === 'scene') return input.episodeMessages.production.audio.sections.scenesTitle
    return input.episodeMessages.production.audio.sections.storyboardsTitle
  }

  function nextAudioCueSortOrder(cues: any[]) {
    const values = cues.map(getCueSortOrder)
    return values.length ? Math.max(...values) + 1 : 0
  }

  const allAudioCues = computed(() => [
    ...input.episodeAudioCues.value,
    ...input.scenes.value.flatMap(scene => getAudioCues(scene)),
    ...input.storyboards.value.flatMap(sb => getAudioCues(sb)),
  ])

  const audioCueReadyCount = computed(() => allAudioCues.value.filter(cueHasAsset).length)
  const audioCueTotal = computed(() => allAudioCues.value.length)

  function requestDeleteAudioCue(cue: any) {
    pendingDeleteAudioCue.value = cue
  }

  function closeDeleteAudioCueDialog() {
    if (deletingAudioCue.value) return
    pendingDeleteAudioCue.value = null
  }

  function getDeleteAudioCueTitle(cue: any) {
    if (!cue) return ''
    return cueLayerLabel(getCueLayerType(cue))
  }

  function getDeleteAudioCueMeta(cue: any) {
    if (!cue) return ''
    return cueScopeLabel(cue.scope_type || cue.scopeType)
  }

  function getCuePromptForEpisode(cue: any) {
    return getCuePromptValue(cue, getEpisodeAudioFallbackPrompt(getCueLayerType(cue)))
  }

  function getCuePromptForScene(cue: any) {
    const scopeId = Number(cue?.scope_id || cue?.scopeId || 0)
    const scene = input.scenes.value.find(item => item.id === scopeId) || null
    return getCuePromptValue(cue, getSceneAudioFallbackPrompt(scene, getCueLayerType(cue)))
  }

  function getCuePromptForStoryboard(cue: any, sb: any) {
    return getCuePromptValue(cue, getStoryboardAudioCueFallback(sb, getCueLayerType(cue)))
  }

  function getCueScopeMeta(cue: any) {
    const scopeType = cue?.scope_type || cue?.scopeType
    const scopeId = Number(cue?.scope_id || cue?.scopeId || 0)
    if (scopeType === 'storyboard') {
      const storyboard = input.storyboards.value.find(sb => sb.id === scopeId)
      return {
        drama_id: input.dramaId,
        episode_id: input.episodeId.value,
        storyboard_id: storyboard?.id || null,
        storyboard_num: storyboard?.storyboard_number || storyboard?.storyboardNumber || null,
        category: getCueLayerType(cue),
      }
    }

    return {
      drama_id: input.dramaId,
      episode_id: input.episodeId.value,
      category: getCueLayerType(cue),
    }
  }

  async function copyAudioCuePrompt(cue: any, fallback = '') {
    return input.copyPromptValue(getCuePromptValue(cue, fallback))
  }

  function hasSuggestedAudioCuePrompt(cue: any, fallback = '') {
    const suggested = String(fallback || '').trim()
    const current = String(cue?.prompt || '').trim()
    return !!suggested && suggested !== current
  }

  function applySuggestedAudioCuePrompt(cue: any, fallback = '') {
    const suggested = String(fallback || '').trim()
    if (!suggested) return
    return saveAudioCueField(cue, 'prompt', suggested)
  }

  function setCueLocalField(cue: any, field: string, value: any) {
    cue[field] = value
    const camelField = toCamel(field)
    if (camelField !== field) cue[camelField] = value
  }

  function getInputEventValue(event: any) {
    return event?.target && 'value' in event.target ? event.target.value : ''
  }

  function getInputEventChecked(event: any) {
    return !!(event?.target && 'checked' in event.target && event.target.checked)
  }

  function saveAudioCueTextInput(cue: any, field: string, event: any) {
    return saveAudioCueField(cue, field, getInputEventValue(event))
  }

  function saveAudioCueNumberInput(cue: any, field: string, event: any, options: Record<string, any> = {}) {
    const raw = String(getInputEventValue(event)).trim()
    const fallback = options.fallback ?? 0
    if (!raw) return saveAudioCueField(cue, field, options.nullable ? null : fallback)

    const numericValue = Number(raw)
    if (options.nullable && Number.isFinite(numericValue) && numericValue <= 0) {
      return saveAudioCueField(cue, field, null)
    }
    return saveAudioCueField(cue, field, Number.isFinite(numericValue) ? numericValue : fallback)
  }

  function saveAudioCueBooleanInput(cue: any, field: string, event: any) {
    return saveAudioCueField(cue, field, getInputEventChecked(event))
  }

  function normalizeAudioCueFieldValue(field: string, value: any) {
    if (typeof value !== 'number') return value
    if (Number.isFinite(value)) return value
    return field === 'target_duration_ms' ? null : 0
  }

  function isSameAudioCueFieldValue(cue: any, field: string, value: any) {
    const current = cue[field] ?? cue[toCamel(field)]
    if (current === value) return true
    if (value === null && (current === null || current === undefined || current === '')) return true
    if (field === 'prompt' && !String(current || '').trim() && !String(value || '').trim()) return true
    if (typeof value === 'number' && current !== null && current !== undefined && current !== '') {
      return Number(current) === value
    }
    return false
  }

  async function saveAudioCueField(cue: any, field: string, value: any) {
    const nextValue = normalizeAudioCueFieldValue(field, value)
    if (isSameAudioCueFieldValue(cue, field, nextValue)) return
    setCueLocalField(cue, field, nextValue)
    try {
      const updatedCue = await audioCuesAPI.update(cue.id, { [field]: nextValue })
      Object.assign(cue, updatedCue)
    } catch (error: any) {
      toast.error(error?.message || input.episodeMessages.toasts.audioCueUpdateFailed)
    }
  }

  async function createAudioCue(scopeType: string, scopeId: number, layerType: string, fallbackPrompt = '', existingCues: any[] = []) {
    const normalizedScopeId = Number(scopeId || 0)
    if (!normalizedScopeId) {
      toast.warning(input.episodeMessages.toasts.audioCueScopeUnavailable)
      return
    }
    if (isSingleLayerAudioScope(scopeType, layerType) && hasAudioCueLayer(existingCues, layerType)) {
      toast.warning(input.t('episode.toasts.audioCueLayerExists', { layer: cueLayerLabel(layerType) }))
      return
    }
    try {
      await audioCuesAPI.create({
        scope_type: scopeType,
        scope_id: normalizedScopeId,
        layer_type: layerType,
        prompt: String(fallbackPrompt || '').trim() || null,
        sort_order: nextAudioCueSortOrder(existingCues),
        duck_dialogue: layerType === 'score',
        loop: layerType !== 'sfx',
        volume_db: layerType === 'score' ? -16 : layerType === 'ambience' ? -20 : -6,
        fade_in_ms: layerType === 'score' ? 1200 : layerType === 'ambience' ? 800 : 50,
        fade_out_ms: layerType === 'score' ? 1200 : layerType === 'ambience' ? 800 : 180,
      })
      await input.refresh()
      toast.success(input.episodeMessages.toasts.audioCueCreated)
    } catch (error: any) {
      toast.error(error?.message || input.episodeMessages.toasts.audioCueCreateFailed)
    }
  }

  async function attachAudioCueAsset(cue: any) {
    const file = await input.pickAudioFile()
    if (!file) return
    try {
      const uploaded = await uploadAPI.audioWithMeta(file, getCueScopeMeta(cue))
      await audioCuesAPI.update(cue.id, { asset_id: uploaded.asset_id })
      await input.refresh()
      toast.success(input.episodeMessages.toasts.audioCueAttached)
    } catch (error: any) {
      toast.error(error?.message || input.episodeMessages.toasts.audioCueAttachFailed)
    }
  }

  async function clearAudioCueAsset(cue: any) {
    try {
      await audioCuesAPI.update(cue.id, { asset_id: null })
      await input.refresh()
      toast.success(input.episodeMessages.toasts.audioCueCleared)
    } catch (error: any) {
      toast.error(error?.message || input.episodeMessages.toasts.audioCueClearFailed)
    }
  }

  async function confirmDeleteAudioCue() {
    const cue = pendingDeleteAudioCue.value
    if (!cue) return
    deletingAudioCue.value = true
    try {
      await audioCuesAPI.del(cue.id)
      pendingDeleteAudioCue.value = null
      await input.refresh()
      toast.success(input.episodeMessages.toasts.audioCueRemoved)
    } catch (error: any) {
      toast.error(error?.message || input.episodeMessages.toasts.audioCueDeleteFailed)
    } finally {
      deletingAudioCue.value = false
    }
  }

  return {
    pendingDeleteAudioCue,
    deletingAudioCue,
    getAudioCues,
    getCueLayerType,
    hasAudioCueLayer,
    getAudioCueCreateLabel,
    getEpisodeAudioFallbackPrompt,
    getSceneAudioFallbackPrompt,
    getStoryboardAudioCueFallback,
    getCuePreviewUrl,
    cueHasAsset,
    cueLayerLabel,
    getAudioScopeSummary,
    cueScopeLabel,
    allAudioCues,
    audioCueReadyCount,
    audioCueTotal,
    requestDeleteAudioCue,
    closeDeleteAudioCueDialog,
    getDeleteAudioCueTitle,
    getDeleteAudioCueMeta,
    getCuePromptForEpisode,
    getCuePromptForScene,
    getCuePromptForStoryboard,
    copyAudioCuePrompt,
    hasSuggestedAudioCuePrompt,
    applySuggestedAudioCuePrompt,
    saveAudioCueTextInput,
    saveAudioCueNumberInput,
    saveAudioCueBooleanInput,
    createAudioCue,
    attachAudioCueAsset,
    clearAudioCueAsset,
    confirmDeleteAudioCue,
  }
}
