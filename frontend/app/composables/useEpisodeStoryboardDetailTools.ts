import { computed, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { episodeAPI, storyboardAPI } from './useApi'

type UseEpisodeStoryboardDetailToolsInput = {
  episode: Ref<any | null>
  episodeId: ComputedRef<number>
  storyboards: Ref<any[]>
  characters: Ref<any[]>
  scenes: Ref<any[]>
  episodeMessages: Record<string, any>
  episodeCommon: Record<string, any>
  t: (path: string, params?: Record<string, string | number>) => string
  formatSceneLabel: (location: string, time: string) => string
  getVideoUrl: (storyboard: any) => string | null
  hasComposeSource: (storyboard: any) => boolean
  isTTSIgnorable: (storyboard: any) => boolean
}

export function useEpisodeStoryboardDetailTools(input: UseEpisodeStoryboardDetailToolsInput) {
  const motionPresetValues = ['hold', 'drift', 'slow_push', 'slow_pull']
  const subtitleModeValues = ['dynamic', 'off']

  function getStoryboardDisplayDurationSeconds(sb: any) {
    const effective = Number(sb?.effective_duration ?? sb?.effectiveDuration)
    if (Number.isFinite(effective) && effective > 0) return effective
    const planned = Number(sb?.duration || 10)
    return Number.isFinite(planned) && planned > 0 ? planned : 10
  }

  function normalizeDisplayDuration(value: any) {
    const safe = Number(value || 0)
    if (!Number.isFinite(safe) || safe <= 0) return 0
    return Math.round(safe * 10) / 10
  }

  function formatDurationLabel(value: any) {
    const normalized = normalizeDisplayDuration(value)
    if (!normalized) return '0s'
    return Number.isInteger(normalized) ? `${normalized}s` : `${normalized.toFixed(1)}s`
  }

  function formatStoryboardDuration(sb: any) {
    return formatDurationLabel(getStoryboardDisplayDurationSeconds(sb))
  }

  function normalizeMotionPresetValue(value: any) {
    const text = String(value || '').trim()
    return motionPresetValues.includes(text) ? text : 'drift'
  }

  function normalizeSubtitleModeValue(value: any) {
    const text = String(value || '').trim()
    return subtitleModeValues.includes(text) ? text : 'dynamic'
  }

  function getMotionPresetLabel(value: any) {
    return input.episodeMessages.motionPresets[normalizeMotionPresetValue(value)]
  }

  function getStoryboardMotionPresetOverride(sb: any) {
    const raw = sb?.motion_preset_override ?? sb?.motionPresetOverride
    return motionPresetValues.includes(String(raw || '').trim()) ? String(raw) : ''
  }

  function getEffectiveMotionPreset(sb: any) {
    const override = getStoryboardMotionPresetOverride(sb)
    if (override) return override
    return episodeMotionPresetValue.value
  }

  async function saveEpisodeMotionPreset(value: any) {
    const normalized = normalizeMotionPresetValue(value)
    if (!input.episode.value || !input.episodeId.value) return

    const previous = normalizeMotionPresetValue(input.episode.value.default_motion_preset || input.episode.value.defaultMotionPreset)
    if (previous === normalized) return

    input.episode.value.default_motion_preset = normalized
    input.episode.value.defaultMotionPreset = normalized
    for (const sb of input.storyboards.value) {
      if (getStoryboardMotionPresetOverride(sb)) continue
      sb.effective_motion_preset = normalized
      sb.effectiveMotionPreset = normalized
    }

    try {
      await episodeAPI.update(input.episodeId.value, { default_motion_preset: normalized })
    } catch (error: any) {
      input.episode.value.default_motion_preset = previous
      input.episode.value.defaultMotionPreset = previous
      for (const sb of input.storyboards.value) {
        if (getStoryboardMotionPresetOverride(sb)) continue
        sb.effective_motion_preset = previous
        sb.effectiveMotionPreset = previous
      }
      toast.error(error?.message || input.episodeMessages.toasts.renderSettingsSaveFailed)
    }
  }

  async function saveEpisodeSubtitleMode(value: any) {
    const normalized = normalizeSubtitleModeValue(value)
    if (!input.episode.value || !input.episodeId.value) return

    const previous = normalizeSubtitleModeValue(input.episode.value.default_subtitle_mode || input.episode.value.defaultSubtitleMode)
    if (previous === normalized) return

    input.episode.value.default_subtitle_mode = normalized
    input.episode.value.defaultSubtitleMode = normalized
    for (const sb of input.storyboards.value) {
      sb.effective_subtitle_mode = normalized
      sb.effectiveSubtitleMode = normalized
    }

    try {
      await episodeAPI.update(input.episodeId.value, { default_subtitle_mode: normalized })
    } catch (error: any) {
      input.episode.value.default_subtitle_mode = previous
      input.episode.value.defaultSubtitleMode = previous
      for (const sb of input.storyboards.value) {
        sb.effective_subtitle_mode = previous
        sb.effectiveSubtitleMode = previous
      }
      toast.error(error?.message || input.episodeMessages.toasts.renderSettingsSaveFailed)
    }
  }

  const motionPresetOptions = computed(() => motionPresetValues.map(value => ({
    label: input.episodeMessages.motionPresets[value],
    value,
  })))

  const subtitleModeOptions = computed(() => subtitleModeValues.map(value => ({
    label: input.episodeMessages.subtitleModes[value],
    value,
  })))

  const motionPresetOverrideOptions = computed(() => ([
    { label: input.episodeMessages.storyboardDetail.motionUseEpisodeDefault, value: '' },
    ...motionPresetOptions.value,
  ]))

  const episodeMotionPresetValue = computed({
    get: () => normalizeMotionPresetValue(input.episode.value?.default_motion_preset || input.episode.value?.defaultMotionPreset),
    set: (value) => {
      void saveEpisodeMotionPreset(value)
    },
  })

  const episodeSubtitleModeValue = computed({
    get: () => normalizeSubtitleModeValue(input.episode.value?.default_subtitle_mode || input.episode.value?.defaultSubtitleMode),
    set: (value) => {
      void saveEpisodeSubtitleMode(value)
    },
  })

  const totalDurationSeconds = computed(() => input.storyboards.value.reduce((sum, sb) => sum + getStoryboardDisplayDurationSeconds(sb), 0))
  const totalDurationValue = computed(() => normalizeDisplayDuration(totalDurationSeconds.value))
  const totalDurationLabel = computed(() => formatDurationLabel(totalDurationSeconds.value))

  const sceneSelectOptions = computed(() => [
    { label: input.episodeMessages.storyboardDetail.fields.bindScenePlaceholder, value: '' },
    ...input.scenes.value.map(scene => ({
      label: input.formatSceneLabel(scene.location, scene.time),
      value: scene.id,
    })),
  ])

  function toCamel(field: string) {
    return field.replace(/_([a-z])/g, (_, char) => char.toUpperCase())
  }

  function updateField(sb: any, field: string, value: any) {
    const current = sb[field] ?? sb[toCamel(field)]
    if (current === value) return
    sb[field] = value
    const camelField = toCamel(field)
    if (camelField !== field) sb[camelField] = value
    void storyboardAPI.update(sb.id, { [field]: value })
  }

  function getStoryboardSceneSelectValue(sb: any) {
    return sb?.scene_id || sb?.sceneId || ''
  }

  function updateStoryboardMotionPreset(sb: any, value: any) {
    const normalized = motionPresetValues.includes(String(value || '').trim()) ? String(value) : null
    const current = getStoryboardMotionPresetOverride(sb) || null
    if (current === normalized) return
    sb.motion_preset_override = normalized
    sb.motionPresetOverride = normalized
    const effective = normalized || episodeMotionPresetValue.value
    sb.effective_motion_preset = effective
    sb.effectiveMotionPreset = effective
    void storyboardAPI.update(sb.id, { motion_preset_override: normalized })
  }

  function getStoryboardCharacterIds(sb: any) {
    const rawIds = [...new Set([...(sb?.character_ids || []), ...(sb?.characterIds || [])])]
    return rawIds.filter(id => input.characters.value.some(char => char.id === id))
  }

  function getStoryboardCharacterNames(sb: any) {
    const ids = getStoryboardCharacterIds(sb)
    return input.characters.value.filter(char => ids.includes(char.id)).map(char => char.name)
  }

  function isStoryboardCharacterSelected(sb: any, charId: number) {
    return getStoryboardCharacterIds(sb).includes(charId)
  }

  function toggleStoryboardCharacter(sb: any, charId: number) {
    const currentIds = getStoryboardCharacterIds(sb)
    const nextIds = currentIds.includes(charId)
      ? currentIds.filter(id => id !== charId)
      : [...currentIds, charId]
    updateField(sb, 'character_ids', nextIds)
  }

  function getSceneName(sb: any) {
    const sceneId = sb?.scene_id || sb?.sceneId
    if (!sceneId) return input.episodeCommon.unboundScene
    const scene = input.scenes.value.find(item => item.id === sceneId)
    return scene
      ? input.formatSceneLabel(scene.location, scene.time)
      : input.t('episode.storyboardDetail.sceneFallback', { id: sceneId })
  }

  function getStoryboardScene(sb: any) {
    const sceneId = sb?.scene_id || sb?.sceneId
    return input.scenes.value.find(scene => scene.id === sceneId) || null
  }

  function getStoryboardCharacters(sb: any) {
    const ids = getStoryboardCharacterIds(sb)
    return input.characters.value.filter(char => ids.includes(char.id))
  }

  function storyboardUsesVideoSource(sb: any) {
    return !!input.getVideoUrl(sb)
  }

  function getEffectiveSubtitleMode() {
    return normalizeSubtitleModeValue(episodeSubtitleModeValue.value)
  }

  function isStoryboardRenderSettingsDirty(sb: any) {
    const motionDirty = input.hasComposeSource(sb)
      && !storyboardUsesVideoSource(sb)
      && normalizeMotionPresetValue(sb?.last_composed_motion_preset ?? sb?.lastComposedMotionPreset) !== getEffectiveMotionPreset(sb)

    const subtitleDirty = !input.isTTSIgnorable(sb)
      && normalizeSubtitleModeValue(sb?.last_composed_subtitle_mode ?? sb?.lastComposedSubtitleMode) !== getEffectiveSubtitleMode()

    return motionDirty || subtitleDirty
  }

  const renderSettingsDirtyCount = computed(() => input.storyboards.value.filter(isStoryboardRenderSettingsDirty).length)

  function getStoryboardMotionScopeNote(sb: any) {
    return storyboardUsesVideoSource(sb)
      ? input.episodeMessages.storyboardDetail.motionVideoNote
      : input.episodeMessages.storyboardDetail.motionImageNote
  }

  return {
    motionPresetOptions,
    subtitleModeOptions,
    motionPresetOverrideOptions,
    episodeMotionPresetValue,
    episodeSubtitleModeValue,
    renderSettingsDirtyCount,
    totalDurationValue,
    totalDurationLabel,
    sceneSelectOptions,
    formatStoryboardDuration,
    getMotionPresetLabel,
    getStoryboardMotionPresetOverride,
    getEffectiveMotionPreset,
    updateField,
    getStoryboardSceneSelectValue,
    updateStoryboardMotionPreset,
    getStoryboardCharacterIds,
    getStoryboardCharacterNames,
    isStoryboardCharacterSelected,
    toggleStoryboardCharacter,
    getSceneName,
    storyboardUsesVideoSource,
    getStoryboardMotionScopeNote,
    getStoryboardCharacters,
    getStoryboardScene,
  }
}
