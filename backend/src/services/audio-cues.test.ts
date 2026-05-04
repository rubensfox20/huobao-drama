import path from 'path'
import { describe, expect, it } from 'vitest'
import { assertSafeDownloadUrl, resolveStoragePath } from '../utils/storage.js'
import { assertCueScopeLayerCompatibility, getAudioCueAbsolutePath, normalizeAudioCuePayload } from './audio-cues.js'

describe('audio cue contracts', () => {
  it('accepts only compatible layer types per scope', () => {
    expect(() => assertCueScopeLayerCompatibility('episode', 'score')).not.toThrow()
    expect(() => assertCueScopeLayerCompatibility('scene', 'ambience')).not.toThrow()
    expect(() => assertCueScopeLayerCompatibility('storyboard', 'sfx')).not.toThrow()
    expect(() => assertCueScopeLayerCompatibility('storyboard', 'score')).toThrow(/storyboard aceita apenas cues/i)
    expect(() => assertCueScopeLayerCompatibility('episode', 'sfx')).toThrow(/episode aceita apenas cues/i)
  })

  it('rejects incompatible scope/layer combinations during payload normalization', () => {
    expect(() => normalizeAudioCuePayload({
      scope_type: 'storyboard',
      scope_id: 8,
      layer_type: 'score',
      start_ms: 0,
      volume_db: 0,
      fade_in_ms: 0,
      fade_out_ms: 0,
      loop: false,
      duck_dialogue: false,
      sort_order: 0,
    }, 'create')).toThrow(/storyboard aceita apenas cues/i)
  })

  it('keeps numeric and nullable fields during update normalization', () => {
    expect(normalizeAudioCuePayload({
      start_ms: 0,
      target_duration_ms: 2400,
      volume_db: -16,
      sort_order: 0,
      fade_in_ms: 0,
      fade_out_ms: 0,
      loop: false,
      duck_dialogue: false,
    }, 'update')).toEqual({
      startMs: 0,
      targetDurationMs: 2400,
      volumeDb: -16,
      sortOrder: 0,
      fadeInMs: 0,
      fadeOutMs: 0,
      loop: false,
      duckDialogue: false,
    })
    expect(normalizeAudioCuePayload({ asset_id: null }, 'update')).toEqual({ assetId: null })
    expect(normalizeAudioCuePayload({ target_duration_ms: null }, 'update')).toEqual({ targetDurationMs: null })
    expect(normalizeAudioCuePayload({ target_duration_ms: 0 }, 'update')).toEqual({ targetDurationMs: null })
    expect(normalizeAudioCuePayload({ prompt: '' }, 'update')).toEqual({ prompt: null })
  })

  it('resolves static audio paths against the project data directory instead of backend cwd', () => {
    const resolved = getAudioCueAbsolutePath('static/uploads/audio/test.wav')
    const normalized = path.normalize(String(resolved || ''))

    expect(normalized).toContain(path.normalize('data/static/uploads/audio/test.wav'))
    expect(normalized).not.toContain(path.normalize('backend/data/'))
  })

  it('allows only storage-local media paths', () => {
    const resolved = resolveStoragePath('/static/uploads/audio/test.wav')

    expect(path.normalize(resolved)).toContain(path.normalize('data/static/uploads/audio/test.wav'))
    expect(() => resolveStoragePath('../huobao_drama.db')).toThrow(/escapes storage root/i)
    expect(() => resolveStoragePath('static/../huobao_drama.db')).toThrow(/escapes storage root/i)
    expect(() => resolveStoragePath('C:\\temp\\audio.wav')).toThrow(/absolute storage paths/i)
    expect(getAudioCueAbsolutePath('../huobao_drama.db')).toBeNull()
  })

  it('rejects unsafe remote media download URLs by default', async () => {
    await expect(assertSafeDownloadUrl('file:///tmp/video.mp4')).rejects.toThrow(/http or https/i)
    await expect(assertSafeDownloadUrl('http://localhost/video.mp4')).rejects.toThrow(/private or reserved/i)
    await expect(assertSafeDownloadUrl('http://127.0.0.1/video.mp4')).rejects.toThrow(/private or reserved/i)
    await expect(assertSafeDownloadUrl('http://[::1]/video.mp4')).rejects.toThrow(/private or reserved/i)
    await expect(assertSafeDownloadUrl('https://user:pass@example.com/video.mp4')).rejects.toThrow(/credentials/i)
  })

  it('allows private remote media downloads only when explicitly enabled', async () => {
    const previousValue = process.env.HUOBAO_ALLOW_PRIVATE_DOWNLOADS
    process.env.HUOBAO_ALLOW_PRIVATE_DOWNLOADS = '1'

    try {
      await expect(assertSafeDownloadUrl('http://127.0.0.1/video.mp4')).resolves.toBeUndefined()
      await expect(assertSafeDownloadUrl('file:///tmp/video.mp4')).rejects.toThrow(/http or https/i)
    } finally {
      if (previousValue === undefined) {
        delete process.env.HUOBAO_ALLOW_PRIVATE_DOWNLOADS
      } else {
        process.env.HUOBAO_ALLOW_PRIVATE_DOWNLOADS = previousValue
      }
    }
  })
})
