import { describe, expect, it } from 'vitest'
import { getStoryboardComposeSource, hasStoryboardComposeSource } from './storyboard-compose-source.js'

describe('storyboard compose source', () => {
  it('prefers video when video and images exist', () => {
    expect(getStoryboardComposeSource({
      videoUrl: 'static/videos/shot.mp4',
      composedImage: 'static/images/shot.png',
      firstFrameImage: 'static/images/first.png',
    })).toEqual({
      kind: 'video',
      url: 'static/videos/shot.mp4',
      field: 'videoUrl',
    })
  })

  it('falls back to composed image and then frames', () => {
    expect(getStoryboardComposeSource({
      composedImage: 'static/images/composed.png',
      firstFrameImage: 'static/images/first.png',
      lastFrameImage: 'static/images/last.png',
    })).toEqual({
      kind: 'image',
      url: 'static/images/composed.png',
      field: 'composedImage',
    })
  })

  it('detects when there is no visual source for compose', () => {
    expect(hasStoryboardComposeSource({})).toBe(false)
  })
})
