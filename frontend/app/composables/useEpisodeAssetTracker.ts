import { ref, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { composeAPI, imageAPI, videoAPI } from './useApi'

type GenerationPredicate = (row: any) => boolean

type UseEpisodeAssetTrackerInput = {
  dramaId: number
  chars: Ref<any[]>
  scenes: Ref<any[]>
  storyboards: Ref<any[]>
  episodeMessages: Record<string, any>
  t: (path: string, params?: Record<string, string | number>) => string
  getFirstFrame: (storyboard: any) => string | null
  getLastFrame: (storyboard: any) => string | null
  getVideoUrl: (storyboard: any) => string | null
  hasComposed: (storyboard: any) => boolean
  refresh: () => Promise<void>
  sleep: (ms: number) => Promise<unknown>
}

export function useEpisodeAssetTracker(input: UseEpisodeAssetTrackerInput) {
  const pendingCharImageIds = ref<number[]>([])
  const pendingSceneImageIds = ref<number[]>([])
  const pendingShotFrameKeys = ref<string[]>([])
  const pendingVideoIds = ref<number[]>([])
  const pendingComposeIds = ref<number[]>([])
  const failedVideoMessages = ref<Record<number, string>>({})
  const failedComposeMessages = ref<Record<number, string>>({})
  const failedCharImageMessages = ref<Record<number, string>>({})
  const failedSceneImageMessages = ref<Record<number, string>>({})
  const latestImageGenerations = ref<any[]>([])
  const latestVideoGenerations = ref<any[]>([])

  function getLatestImageGeneration(predicate: GenerationPredicate) {
    return [...latestImageGenerations.value]
      .filter(predicate)
      .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0] || null
  }

  function getLatestVideoGeneration(predicate: GenerationPredicate) {
    return [...latestVideoGenerations.value]
      .filter(predicate)
      .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0] || null
  }

  async function refreshGenerationHistory() {
    try {
      const rows = await imageAPI.list({ drama_id: input.dramaId })
      latestImageGenerations.value = Array.isArray(rows) ? rows : []
    } catch {
      latestImageGenerations.value = []
    }

    try {
      const rows = await videoAPI.list({ drama_id: input.dramaId })
      latestVideoGenerations.value = Array.isArray(rows) ? rows : []
    } catch {
      latestVideoGenerations.value = []
    }
  }

  function pruneFailedComposeMessages() {
    failedComposeMessages.value = Object.fromEntries(
      Object.entries(failedComposeMessages.value).filter(([storyboardId]) => {
        const target = input.storyboards.value.find(item => Number(item?.id || 0) === Number(storyboardId))
        return target ? !input.hasComposed(target) : true
      }),
    )
  }

  function framePendingKey(id: number, frameType: string) {
    return `${id}:${frameType}`
  }

  function normalizeImageTaskError(message: string, fallback: string) {
    const text = String(message || '').replace(/\s+/g, ' ').trim()
    if (!text) return fallback
    if (/quota|rate[- ]?limit|resource_exhausted|temporarily rate-limited|exceeded your current quota/i.test(text)) {
      return input.episodeMessages.toasts.providerRateLimited
    }
    if (/timeout|timed out/i.test(text)) {
      return input.episodeMessages.toasts.providerTimeout
    }
    return text.length > 180 ? `${text.slice(0, 177)}...` : text
  }

  function isPendingCharImage(id: number) {
    const char = input.chars.value.find(item => item.id === id)
    if (char?.image_url || char?.imageUrl) return false
    if (pendingCharImageIds.value.includes(id)) return true
    const latest = getLatestImageGeneration(row => Number(row?.character_id || row?.characterId || 0) === id)
    return latest?.status === 'processing'
  }

  function charImageFailMessage(id: number) {
    const char = input.chars.value.find(item => item.id === id)
    if (char?.image_url || char?.imageUrl) return ''
    if (failedCharImageMessages.value[id]) return failedCharImageMessages.value[id]
    const latest = getLatestImageGeneration(row => Number(row?.character_id || row?.characterId || 0) === id)
    if (latest?.status !== 'failed') return ''
    return normalizeImageTaskError(latest?.error_msg || latest?.errorMsg, input.episodeMessages.toasts.charImageFailed)
  }

  function isPendingSceneImage(id: number) {
    const scene = input.scenes.value.find(item => item.id === id)
    if (scene?.image_url || scene?.imageUrl) return false
    if (pendingSceneImageIds.value.includes(id)) return true
    const latest = getLatestImageGeneration(row => Number(row?.scene_id || row?.sceneId || 0) === id)
    return latest?.status === 'processing'
  }

  function sceneImageFailMessage(id: number) {
    const scene = input.scenes.value.find(item => item.id === id)
    if (scene?.image_url || scene?.imageUrl) return ''
    if (failedSceneImageMessages.value[id]) return failedSceneImageMessages.value[id]
    const latest = getLatestImageGeneration(row => Number(row?.scene_id || row?.sceneId || 0) === id)
    if (latest?.status !== 'failed') return ''
    return normalizeImageTaskError(latest?.error_msg || latest?.errorMsg, input.episodeMessages.toasts.sceneImageFailed)
  }

  function isPendingShotFrame(id: number, frameType: string) {
    const target = input.storyboards.value.find(item => item.id === id)
    const done = frameType === 'first_frame' ? !!input.getFirstFrame(target) : !!input.getLastFrame(target)
    if (done) return false
    if (pendingShotFrameKeys.value.includes(framePendingKey(id, frameType))) return true
    const latest = getLatestImageGeneration((row) => {
      const rowStoryboardId = Number(row?.storyboard_id || row?.storyboardId || 0)
      const rowFrameType = String(row?.frame_type || row?.frameType || '')
      return rowStoryboardId === id && rowFrameType === frameType
    })
    return latest?.status === 'processing'
  }

  function isPendingVideo(id: number) {
    const target = input.storyboards.value.find(item => item.id === id)
    if (input.getVideoUrl(target)) return false
    return pendingVideoIds.value.includes(id)
  }

  function videoFailMessage(id: number) {
    const target = input.storyboards.value.find(item => item.id === id)
    if (input.getVideoUrl(target)) return ''
    return failedVideoMessages.value[id] || ''
  }

  function isPendingCompose(id: number) {
    return pendingComposeIds.value.includes(id)
  }

  function composeFailMessage(id: number) {
    const target = input.storyboards.value.find(item => Number(item?.id || 0) === Number(id))
    if (target && input.hasComposed(target)) return ''
    return failedComposeMessages.value[id] || ''
  }

  function clearFailedCharImage(id: number) {
    if (!failedCharImageMessages.value[id]) return
    const next = { ...failedCharImageMessages.value }
    delete next[id]
    failedCharImageMessages.value = next
  }

  function clearFailedSceneImage(id: number) {
    if (!failedSceneImageMessages.value[id]) return
    const next = { ...failedSceneImageMessages.value }
    delete next[id]
    failedSceneImageMessages.value = next
  }

  function clearFailedVideo(id: number) {
    if (!failedVideoMessages.value[id]) return
    const next = { ...failedVideoMessages.value }
    delete next[id]
    failedVideoMessages.value = next
  }

  function clearFailedCompose(id: number) {
    if (!failedComposeMessages.value[id]) return
    const next = { ...failedComposeMessages.value }
    delete next[id]
    failedComposeMessages.value = next
  }

  function startCharImage(id: number) {
    if (!pendingCharImageIds.value.includes(id)) pendingCharImageIds.value.push(id)
    clearFailedCharImage(id)
  }

  function startCharImages(ids: number[]) {
    pendingCharImageIds.value = [...new Set([...pendingCharImageIds.value, ...ids])]
    const nextFailed = { ...failedCharImageMessages.value }
    ids.forEach((id) => { delete nextFailed[id] })
    failedCharImageMessages.value = nextFailed
  }

  function clearCharImagePending(id: number) {
    pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
  }

  function setCharImageFailed(id: number, message: string) {
    clearCharImagePending(id)
    failedCharImageMessages.value = {
      ...failedCharImageMessages.value,
      [id]: message,
    }
  }

  function startSceneImage(id: number) {
    if (!pendingSceneImageIds.value.includes(id)) pendingSceneImageIds.value.push(id)
    clearFailedSceneImage(id)
  }

  function startSceneImages(ids: number[]) {
    pendingSceneImageIds.value = [...new Set([...pendingSceneImageIds.value, ...ids])]
    const nextFailed = { ...failedSceneImageMessages.value }
    ids.forEach((id) => { delete nextFailed[id] })
    failedSceneImageMessages.value = nextFailed
  }

  function clearSceneImagePending(id: number) {
    pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
  }

  function setSceneImageFailed(id: number, message: string) {
    clearSceneImagePending(id)
    failedSceneImageMessages.value = {
      ...failedSceneImageMessages.value,
      [id]: message,
    }
  }

  function startShotFrame(id: number, frameType: string) {
    const key = framePendingKey(id, frameType)
    if (!pendingShotFrameKeys.value.includes(key)) pendingShotFrameKeys.value.push(key)
  }

  function clearShotFramePending(id: number, frameType: string) {
    const key = framePendingKey(id, frameType)
    pendingShotFrameKeys.value = pendingShotFrameKeys.value.filter(item => item !== key)
  }

  function startVideo(id: number) {
    if (!pendingVideoIds.value.includes(id)) pendingVideoIds.value.push(id)
    clearFailedVideo(id)
  }

  function startVideos(ids: number[]) {
    pendingVideoIds.value = [...new Set([...pendingVideoIds.value, ...ids])]
  }

  function clearVideoPending(id: number) {
    pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== id)
  }

  function setVideoFailed(id: number, message: string) {
    clearVideoPending(id)
    failedVideoMessages.value = {
      ...failedVideoMessages.value,
      [id]: message,
    }
  }

  function startCompose(id: number) {
    if (!pendingComposeIds.value.includes(id)) pendingComposeIds.value.push(id)
    clearFailedCompose(id)
  }

  function clearComposePending(id: number) {
    pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== id)
  }

  function setComposeFailed(id: number, message: string) {
    clearComposePending(id)
    failedComposeMessages.value = {
      ...failedComposeMessages.value,
      [id]: message,
    }
  }

  function setPendingComposeIds(ids: number[]) {
    pendingComposeIds.value = [...new Set(ids)]
  }

  function syncComposeFailures(items: any[]) {
    const failedItems = items.filter(item => item.status === 'compose_failed')
    if (failedItems.length) {
      const next = { ...failedComposeMessages.value }
      failedItems.forEach((item) => {
        next[item.id] = item.error_msg || item.errorMsg || input.episodeMessages.toasts.composeFailed
      })
      items
        .filter(item => item.status !== 'compose_failed')
        .forEach((item) => {
          delete next[item.id]
        })
      failedComposeMessages.value = next
      return failedItems
    }

    if (Object.keys(failedComposeMessages.value).length) {
      const next = { ...failedComposeMessages.value }
      items.forEach((item) => {
        delete next[item.id]
      })
      failedComposeMessages.value = next
    }

    return []
  }

  async function monitorImageGeneration({
    kind,
    id,
    frameType,
    attempts = 36,
    delay = 2500,
  }: {
    kind: 'character' | 'scene' | 'storyboard'
    id: number
    frameType?: string
    attempts?: number
    delay?: number
  }) {
    for (let i = 0; i < attempts; i += 1) {
      await input.sleep(delay)
      await input.refresh()

      if (kind === 'character') {
        const char = input.chars.value.find(c => c.id === id)
        if (char?.image_url || char?.imageUrl) {
          clearCharImagePending(id)
          clearFailedCharImage(id)
          return true
        }
        const latest = getLatestImageGeneration(row => Number(row?.character_id || row?.characterId || 0) === id)
        if (latest?.status === 'failed') {
          const errorMessage = normalizeImageTaskError(latest?.error_msg || latest?.errorMsg, input.episodeMessages.toasts.charImageFailed)
          setCharImageFailed(id, errorMessage)
          toast.error(errorMessage)
          return false
        }
        continue
      }

      if (kind === 'scene') {
        const scene = input.scenes.value.find(s => s.id === id)
        if (scene?.image_url || scene?.imageUrl) {
          clearSceneImagePending(id)
          clearFailedSceneImage(id)
          return true
        }
        const latest = getLatestImageGeneration(row => Number(row?.scene_id || row?.sceneId || 0) === id)
        if (latest?.status === 'failed') {
          const errorMessage = normalizeImageTaskError(latest?.error_msg || latest?.errorMsg, input.episodeMessages.toasts.sceneImageFailed)
          setSceneImageFailed(id, errorMessage)
          toast.error(errorMessage)
          return false
        }
        continue
      }

      const target = input.storyboards.value.find(s => s.id === id)
      const done = frameType === 'first_frame' ? !!input.getFirstFrame(target) : !!input.getLastFrame(target)
      if (done) {
        clearShotFramePending(id, frameType || '')
        return true
      }
      const latest = getLatestImageGeneration((row) => {
        const rowStoryboardId = Number(row?.storyboard_id || row?.storyboardId || 0)
        const rowFrameType = String(row?.frame_type || row?.frameType || '')
        return rowStoryboardId === id && rowFrameType === frameType
      })
      if (latest?.status === 'failed') {
        clearShotFramePending(id, frameType || '')
        toast.error(normalizeImageTaskError(latest?.error_msg || latest?.errorMsg, input.episodeMessages.toasts.shotFrameFailed))
        return false
      }
    }

    if (kind === 'character') clearCharImagePending(id)
    if (kind === 'scene') clearSceneImagePending(id)
    if (kind === 'storyboard') clearShotFramePending(id, frameType || '')
    return false
  }

  function watchAsyncResult(check: () => boolean, attempts = 24, delay = 2500) {
    void (async () => {
      for (let i = 0; i < attempts; i += 1) {
        await input.sleep(delay)
        await input.refresh()
        if (check()) return
      }
    })()
  }

  async function pollVideoGeneration(generationId: number | null | undefined, storyboardId: number) {
    if (!generationId) {
      watchAsyncResult(() => {
        const target = input.storyboards.value.find(s => s.id === storyboardId)
        const done = !!(target?.video_url || target?.videoUrl)
        if (done) clearVideoPending(storyboardId)
        return done
      }, 60, 4000)
      return
    }

    for (let i = 0; i < 120; i += 1) {
      await input.sleep(4000)
      try {
        const res = await videoAPI.get(generationId)
        await input.refresh()
        if (res?.status === 'completed') {
          clearVideoPending(storyboardId)
          clearFailedVideo(storyboardId)
          toast.success(input.episodeMessages.toasts.videoReady)
          return
        }
        if (res?.status === 'failed') {
          const message = res?.error_msg || res?.errorMsg || input.episodeMessages.toasts.videoFailed
          setVideoFailed(storyboardId, message)
          toast.error(message)
          return
        }
      } catch {}
    }

    setVideoFailed(storyboardId, input.episodeMessages.toasts.videoTimeout)
    toast.error(input.episodeMessages.toasts.videoTimeout)
  }

  async function pollComposeStatus(episodeId: number) {
    for (let i = 0; i < 120; i += 1) {
      await input.sleep(3000)
      try {
        const res = await composeAPI.status(episodeId)
        await input.refresh()
        const items = Array.isArray(res?.items) ? res.items : []
        const processingIds = items.filter(item => item.status === 'compose_processing').map(item => item.id)
        setPendingComposeIds(processingIds)

        const failedItems = syncComposeFailures(items)
        if (!processingIds.length) {
          if (failedItems.length) toast.error(input.t('episode.toasts.composeBatchFailed', { count: failedItems.length }))
          else toast.success(input.episodeMessages.toasts.composeBatchDone)
          return
        }
      } catch {}
    }
  }

  return {
    framePendingKey,
    normalizeImageTaskError,
    isPendingCharImage,
    charImageFailMessage,
    isPendingSceneImage,
    sceneImageFailMessage,
    isPendingShotFrame,
    isPendingVideo,
    videoFailMessage,
    isPendingCompose,
    composeFailMessage,
    refreshGenerationHistory,
    pruneFailedComposeMessages,
    startCharImage,
    startCharImages,
    clearCharImagePending,
    setCharImageFailed,
    startSceneImage,
    startSceneImages,
    clearSceneImagePending,
    setSceneImageFailed,
    startShotFrame,
    clearShotFramePending,
    startVideo,
    startVideos,
    clearVideoPending,
    setVideoFailed,
    startCompose,
    clearComposePending,
    setComposeFailed,
    setPendingComposeIds,
    monitorImageGeneration,
    watchAsyncResult,
    pollVideoGeneration,
    pollComposeStatus,
  }
}
