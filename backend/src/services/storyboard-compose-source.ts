export type StoryboardComposeSource = {
  kind: 'video' | 'image'
  url: string
  field: 'videoUrl' | 'composedImage' | 'firstFrameImage' | 'lastFrameImage'
}

type StoryboardComposeSourceCandidate = {
  videoUrl?: string | null
  composedImage?: string | null
  firstFrameImage?: string | null
  lastFrameImage?: string | null
}

function normalizeAssetPath(value?: string | null) {
  const text = String(value || '').trim()
  return text || null
}

export function getStoryboardComposeSource(storyboard: StoryboardComposeSourceCandidate): StoryboardComposeSource | null {
  const videoUrl = normalizeAssetPath(storyboard.videoUrl)
  if (videoUrl) {
    return {
      kind: 'video',
      url: videoUrl,
      field: 'videoUrl',
    }
  }

  const imageCandidates: Array<[StoryboardComposeSource['field'], string | null]> = [
    ['composedImage', normalizeAssetPath(storyboard.composedImage)],
    ['firstFrameImage', normalizeAssetPath(storyboard.firstFrameImage)],
    ['lastFrameImage', normalizeAssetPath(storyboard.lastFrameImage)],
  ]

  for (const [field, url] of imageCandidates) {
    if (!url) continue
    return {
      kind: 'image',
      url,
      field,
    }
  }

  return null
}

export function hasStoryboardComposeSource(storyboard: StoryboardComposeSourceCandidate) {
  return !!getStoryboardComposeSource(storyboard)
}
