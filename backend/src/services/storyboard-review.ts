export const STORYBOARD_REVIEW_STATUSES = ['approved', 'pending_review', 'changes_requested'] as const
export type StoryboardReviewStatus = typeof STORYBOARD_REVIEW_STATUSES[number]

export const STORYBOARD_CONTINUITY_MODES = ['auto', 'off', 'force'] as const
export type StoryboardContinuityMode = typeof STORYBOARD_CONTINUITY_MODES[number]

type StoryboardReviewLike = {
  reviewStatus?: string | null
  composedImage?: string | null
  firstFrameImage?: string | null
  lastFrameImage?: string | null
}

function normalizeString(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeStoryboardReviewStatus(value: unknown): StoryboardReviewStatus | null {
  const normalized = normalizeString(value)
  if ((STORYBOARD_REVIEW_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as StoryboardReviewStatus
  }
  return null
}

export function getEffectiveStoryboardReviewStatus(storyboard: StoryboardReviewLike): StoryboardReviewStatus {
  return normalizeStoryboardReviewStatus(storyboard?.reviewStatus) || 'approved'
}

export function normalizeStoryboardContinuityMode(value: unknown): StoryboardContinuityMode {
  const normalized = normalizeString(value)
  if ((STORYBOARD_CONTINUITY_MODES as readonly string[]).includes(normalized)) {
    return normalized as StoryboardContinuityMode
  }
  return 'auto'
}

export function storyboardHasBaseVisual(storyboard: StoryboardReviewLike) {
  return !!String(
    storyboard?.composedImage
    || storyboard?.firstFrameImage
    || storyboard?.lastFrameImage
    || '',
  ).trim()
}

export function storyboardNeedsReview(storyboard: StoryboardReviewLike) {
  return getEffectiveStoryboardReviewStatus(storyboard) !== 'approved'
}
