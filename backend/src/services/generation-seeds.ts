import { createHash } from 'node:crypto'

type SeedInput = {
  kind: 'character' | 'scene' | 'storyboard' | 'grid' | 'generic'
  dramaId?: number | null
  episodeId?: number | null
  sceneId?: number | null
  storyboardId?: number | null
  characterId?: number | null
  frameType?: string | null
  variant?: string | null
  version?: string | null
}

function stableSeedHash(value: string) {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 8)
  const raw = Number.parseInt(hex, 16)
  return Number.isFinite(raw) ? raw : 0
}

export function deriveGenerationSeed(input: SeedInput) {
  const material = [
    input.kind,
    input.version || 'v1',
    input.dramaId ?? 'x',
    input.episodeId ?? 'x',
    input.sceneId ?? 'x',
    input.storyboardId ?? 'x',
    input.characterId ?? 'x',
    input.frameType || 'base',
    input.variant || 'default',
  ].join(':')

  const hash = stableSeedHash(material)
  // Keep inside signed 31-bit range and avoid 0.
  return (hash % 2147483000) + 1
}
