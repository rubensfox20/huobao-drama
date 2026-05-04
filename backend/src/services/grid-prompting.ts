import { eq, inArray } from 'drizzle-orm'
import { createAgent } from '../agents/index.js'
import { db, schema } from '../db/index.js'

type GridStoryboard = typeof schema.storyboards.$inferSelect

export type GridReferenceAsset = {
  path: string
  label: string
  kind: 'scene' | 'character' | 'storyboard'
  sceneId?: number
  characterId?: number
  storyboardId?: number
  imageIndex: number
  imageLabel: string
}

export type GridPromptCell = {
  shot_number: number
  frame_type: string
  prompt: string
}

export type GridPromptPayload = {
  grid_prompt: string
  cell_prompts: GridPromptCell[]
}

function posLabel(index: number, _rows: number, cols: number) {
  const row = Math.floor(index / cols)
  const col = index % cols
  return `row ${row + 1} col ${col + 1}`
}

function cellLabel(index: number, rows: number, cols: number) {
  return `Cell ${index + 1} (${posLabel(index, rows, cols)})`
}

function safeParseJsonArray(value: unknown): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(String(value))
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(item => String(item)) : []
  } catch {
    return []
  }
}

function getStoryboardCharacterIds(storyboardIds: number[]) {
  if (!storyboardIds.length) return new Map<number, number[]>()

  const links = db.select().from(schema.storyboardCharacters)
    .where(inArray(schema.storyboardCharacters.storyboardId, storyboardIds))
    .all()
  const byStoryboard = new Map<number, number[]>()

  for (const link of links) {
    const existing = byStoryboard.get(link.storyboardId) || []
    existing.push(link.characterId)
    byStoryboard.set(link.storyboardId, existing)
  }

  return byStoryboard
}

export function getStoryboardsByIds(storyboardIds: number[]) {
  const uniqueIds = [...new Set(storyboardIds.map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0))]
  if (!uniqueIds.length) return [] as GridStoryboard[]

  const rows = db.select().from(schema.storyboards)
    .where(inArray(schema.storyboards.id, uniqueIds))
    .all()
  const byId = new Map(rows.map(row => [row.id, row]))

  return uniqueIds
    .map(id => byId.get(id) || null)
    .filter((row): row is GridStoryboard => Boolean(row))
}

export function getDramaStyle(dramaId?: number | null) {
  if (!dramaId) return ''
  const [drama] = db.select({ style: schema.dramas.style }).from(schema.dramas)
    .where(eq(schema.dramas.id, dramaId))
    .all()
  return drama?.style || ''
}

export function collectGridReferenceAssets(storyboards: GridStoryboard[]): GridReferenceAsset[] {
  const storyboardIds = storyboards.map(sb => sb.id)
  const storyboardCharacterIds = getStoryboardCharacterIds(storyboardIds)
  const sceneIds = [...new Set(storyboards.map(sb => sb.sceneId).filter((id): id is number => Boolean(id)))]
  const characterIds = [...new Set([...storyboardCharacterIds.values()].flat().filter((id): id is number => Boolean(id)))]

  const scenes = sceneIds.length
    ? db.select().from(schema.scenes).where(inArray(schema.scenes.id, sceneIds)).all()
    : []
  const characters = characterIds.length
    ? db.select().from(schema.characters).where(inArray(schema.characters.id, characterIds)).all()
    : []

  const assets: Array<Omit<GridReferenceAsset, 'imageIndex' | 'imageLabel'>> = []
  const seen = new Set<string>()

  function pushAsset(
    path: string | null | undefined,
    label: string,
    kind: 'scene' | 'character' | 'storyboard',
    extra: { sceneId?: number; characterId?: number; storyboardId?: number } = {},
  ) {
    if (!path || seen.has(path) || assets.length >= 6) return
    seen.add(path)
    assets.push({ path, label, kind, ...extra })
  }

  for (const storyboard of storyboards) {
    pushAsset(storyboard.firstFrameImage, `Shot ${storyboard.storyboardNumber} first frame`, 'storyboard', { storyboardId: storyboard.id })
    pushAsset(storyboard.lastFrameImage, `Shot ${storyboard.storyboardNumber} last frame`, 'storyboard', { storyboardId: storyboard.id })
    pushAsset(storyboard.composedImage, `Shot ${storyboard.storyboardNumber} composite`, 'storyboard', { storyboardId: storyboard.id })
    for (const reference of safeParseJsonArray(storyboard.referenceImages)) {
      pushAsset(reference, `Shot ${storyboard.storyboardNumber} reference`, 'storyboard', { storyboardId: storyboard.id })
    }
  }

  for (const scene of scenes) {
    pushAsset(scene.imageUrl, `${scene.location}${scene.time ? ` (${scene.time})` : ''} scene`, 'scene', { sceneId: scene.id })
  }

  for (const character of characters) {
    pushAsset(character.imageUrl, `${character.name} character`, 'character', { characterId: character.id })
  }

  return assets.map((asset, index) => ({
    ...asset,
    imageIndex: index + 1,
    imageLabel: `Image ${index + 1}`,
  }))
}

export function buildReferenceLegend(referenceAssets: Array<{ imageLabel: string; label: string }>) {
  if (!referenceAssets.length) return ''
  return referenceAssets.map(asset => `${asset.imageLabel}=${asset.label}`).join('; ')
}

function buildStoryboardReferenceHints(
  storyboard: GridStoryboard,
  referenceAssets: GridReferenceAsset[],
  storyboardCharacterIds: Map<number, number[]>,
) {
  const hints: string[] = []
  const characterIds = storyboardCharacterIds.get(storyboard.id) || []

  for (const asset of referenceAssets) {
    if (asset.kind === 'scene' && storyboard.sceneId && asset.sceneId === storyboard.sceneId) {
      hints.push(`${asset.imageLabel}（${asset.label}）`)
    }

    if (asset.kind === 'character' && asset.characterId && characterIds.includes(asset.characterId)) {
      hints.push(`${asset.imageLabel}（${asset.label}）`)
    }

    if (asset.kind === 'storyboard' && asset.storyboardId === storyboard.id) {
      hints.push(`${asset.imageLabel}（${asset.label}）`)
    }
  }

  return [...new Set(hints)].slice(0, 4)
}

export function buildGridPrompt(
  mode: string,
  storyboards: GridStoryboard[],
  rows: number,
  cols: number,
  dramaStyle: string,
  referenceAssets: GridReferenceAsset[],
) {
  const style = dramaStyle || 'cinematic'
  const storyboardCharacterIds = getStoryboardCharacterIds(storyboards.map(sb => sb.id))
  const legend = buildReferenceLegend(referenceAssets)

  if (mode === 'first_frame') {
    const cells = storyboards.map((storyboard, index) => {
      const description = storyboard.imagePrompt || storyboard.description || storyboard.title || `shot ${index + 1}`
      const refs = buildStoryboardReferenceHints(storyboard, referenceAssets, storyboardCharacterIds)
      return `${cellLabel(index, rows, cols)}: ${refs.length ? `Reference ${refs.join(', ')}, ` : ''}${description}`
    })
    return [
      `${rows}x${cols} grid layout, consistent art style, ${style},`,
      legend ? `Reference map: ${legend}` : '',
      'When the frame involves characters or scenes, prefer the corresponding image numbers to preserve consistency.',
      ...cells,
      'high quality, cinematic lighting, no text, no watermark',
    ].filter(Boolean).join('\n')
  }

  if (mode === 'first_last') {
    const totalCells = rows * cols
    const cells = Array.from({ length: totalCells }, (_, index) => {
      const storyboard = storyboards[index % storyboards.length]
      const description = storyboard.imagePrompt || storyboard.description || storyboard.title || `shot ${index + 1}`
      const action = storyboard.action || storyboard.movement || ''
      const refs = buildStoryboardReferenceHints(storyboard, referenceAssets, storyboardCharacterIds)
      const frameHint = index % 2 === 0
        ? 'opening moment'
        : `${action ? `${action}, ` : ''}closing moment, subtle motion change`
      return `${cellLabel(index, rows, cols)}: ${refs.length ? `Reference ${refs.join(', ')}, ` : ''}${description}, ${frameHint}`
    })
    return [
      `${rows}x${cols} grid layout, consistent art style, ${style},`,
      legend ? `Reference map: ${legend}` : '',
      'first/last frame visual rhythm, alternating opening and closing beats across the grid,',
      ...cells,
      'continuous motion implied between left and right, high quality, no text',
    ].filter(Boolean).join('\n')
  }

  if (mode === 'multi_ref') {
    const storyboard = storyboards[0]
    const description = storyboard.imagePrompt || storyboard.description || storyboard.title || 'scene'
    const angles = [
      'wide establishing shot', 'medium shot character focus',
      'close-up detail', 'dramatic low angle', 'over-the-shoulder view',
      'bird eye view', 'side profile', 'atmospheric detail',
      'extreme close-up', 'dutch angle', 'silhouette shot',
      'depth of field focus', 'symmetrical composition', 'leading lines',
      'negative space', 'high angle looking down', 'ground level',
      'panoramic wide', 'intimate two-shot', 'reflection shot',
      'shadow play', 'backlit silhouette', 'macro detail',
      'split lighting', 'rim light portrait',
    ]

    const totalCells = rows * cols
    const cells = Array.from({ length: totalCells }, (_, index) => {
      return `${cellLabel(index, rows, cols)}: ${legend ? `Reference ${legend}, ` : ''}${description}, ${angles[index % angles.length]}`
    })

    return [
      `${rows}x${cols} grid layout, same scene different angles and compositions, ${style},`,
      legend ? `Reference map: ${legend}` : '',
      `main scene: ${description},`,
      ...cells,
      'consistent lighting and color palette, high quality, no text',
    ].filter(Boolean).join('\n')
  }

  return `${rows}x${cols} grid, ${style}, storyboard frames, high quality`
}

export function buildGridCellPrompts(
  mode: string,
  storyboards: GridStoryboard[],
  rows: number,
  cols: number,
  referenceAssets: GridReferenceAsset[],
): GridPromptCell[] {
  if (!storyboards.length) return []
  const storyboardCharacterIds = getStoryboardCharacterIds(storyboards.map(sb => sb.id))

  if (mode === 'multi_ref') {
    const storyboard = storyboards[0]
    const description = storyboard.imagePrompt || storyboard.description || storyboard.title || 'scene'
    const refs = buildStoryboardReferenceHints(storyboard, referenceAssets, storyboardCharacterIds)
    const referencePrefix = refs.length ? `${refs.join(', ')}, ` : ''
    const angles = [
      'wide establishing shot', 'medium shot character focus',
      'close-up detail', 'dramatic low angle', 'over-the-shoulder view',
      'bird eye view', 'side profile', 'atmospheric detail',
      'extreme close-up', 'dutch angle', 'silhouette shot',
      'depth of field focus', 'symmetrical composition', 'leading lines',
      'negative space', 'high angle looking down', 'ground level',
      'panoramic wide', 'intimate two-shot', 'reflection shot',
      'shadow play', 'backlit silhouette', 'macro detail',
      'split lighting', 'rim light portrait',
    ]

    return Array.from({ length: rows * cols }, (_, index) => ({
      shot_number: storyboard.storyboardNumber,
      frame_type: 'reference',
      prompt: `${cellLabel(index, rows, cols)}: ${referencePrefix}${description}, ${angles[index % angles.length]}`,
    }))
  }

  if (mode === 'first_last') {
    return Array.from({ length: rows * cols }, (_, index) => {
      const storyboard = storyboards[index % storyboards.length]
      const description = storyboard.imagePrompt || storyboard.description || storyboard.title || `shot ${storyboard.storyboardNumber || ''}`
      const motion = storyboard.action || storyboard.movement || ''
      const refs = buildStoryboardReferenceHints(storyboard, referenceAssets, storyboardCharacterIds)
      const isFirstFrame = index % 2 === 0

      return {
        shot_number: storyboard.storyboardNumber,
        frame_type: isFirstFrame ? 'first_frame' : 'last_frame',
        prompt: isFirstFrame
          ? `${cellLabel(index, rows, cols)}, first frame: ${refs.length ? `Reference ${refs.join(', ')}, ` : ''}${description}${storyboard.location ? `, ${storyboard.location}` : ''}${storyboard.shotType ? `, ${storyboard.shotType}` : ''}`
          : `${cellLabel(index, rows, cols)}, last frame: ${refs.length ? `Reference ${refs.join(', ')}, ` : ''}${description}${motion ? `, ${motion}` : ''}${storyboard.location ? `, ${storyboard.location}` : ''}${storyboard.shotType ? `, ${storyboard.shotType}` : ''}`,
      }
    })
  }

  return storyboards.slice(0, rows * cols).map((storyboard, index) => {
    const description = storyboard.imagePrompt || storyboard.description || storyboard.title || `shot ${storyboard.storyboardNumber || ''}`
    const refs = buildStoryboardReferenceHints(storyboard, referenceAssets, storyboardCharacterIds)
    return {
      shot_number: storyboard.storyboardNumber,
      frame_type: 'first_frame',
      prompt: `${cellLabel(index, rows, cols)}: ${refs.length ? `Reference ${refs.join(', ')}, ` : ''}${description}${storyboard.location ? `, ${storyboard.location}` : ''}${storyboard.shotType ? `, ${storyboard.shotType}` : ''}, opening scene`,
    }
  })
}

function extractJsonCandidate(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const plain = text.match(/\{[\s\S]*\}/)
  return plain?.[0]?.trim() || ''
}

function normalizeGridPayload(payload: any) {
  if (!payload || typeof payload !== 'object') return null

  const gridPrompt = typeof payload.grid_prompt === 'string'
    ? payload.grid_prompt.trim()
    : typeof payload.gridPrompt === 'string'
      ? payload.gridPrompt.trim()
      : ''
  const rawCells = Array.isArray(payload.cell_prompts)
    ? payload.cell_prompts
    : Array.isArray(payload.cellPrompts)
      ? payload.cellPrompts
      : []
  const cellPrompts = rawCells
    .map((cell: any) => ({
      shot_number: Number(cell?.shot_number ?? cell?.shotNumber ?? 0) || 0,
      frame_type: String(cell?.frame_type ?? cell?.frameType ?? 'first_frame'),
      prompt: String(cell?.prompt ?? '').trim(),
    }))
    .filter((cell: GridPromptCell) => cell.prompt)

  if (!gridPrompt) return null
  return { grid_prompt: gridPrompt, cell_prompts: cellPrompts }
}

function findGridPayload(value: any): GridPromptPayload | null {
  if (!value) return null

  const normalized = normalizeGridPayload(value)
  if (normalized) return normalized

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed === 'null') return null

    try {
      const parsed = JSON.parse(trimmed)
      return findGridPayload(parsed)
    } catch {
      const candidate = extractJsonCandidate(trimmed)
      if (!candidate) return null
      try {
        return findGridPayload(JSON.parse(candidate))
      } catch {
        return null
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGridPayload(item)
      if (found) return found
    }
    return null
  }

  if (typeof value === 'object') {
    for (const nested of Object.values(value)) {
      const found = findGridPayload(nested)
      if (found) return found
    }
  }

  return null
}

export async function tryAgentGridPrompt(
  episodeId: number,
  dramaId: number,
  storyboardIds: number[],
  rows: number,
  cols: number,
  mode: string,
  referenceLegend: string,
) {
  const agent = createAgent('grid_prompt_generator', episodeId, dramaId)
  if (!agent) return null

  const result = await agent.generate(
    [{
      role: 'user',
      content: [
        'Generate prompts for the grid image and prefer calling tools to complete the task.',
        `Selected storyboard IDs: ${JSON.stringify(storyboardIds)}`,
        `Rows: ${rows}`,
        `Columns: ${cols}`,
        `Mode: ${mode}`,
        referenceLegend ? `Reference map: ${referenceLegend}` : '',
        'When the prompt refers to a character or scene, directly include the corresponding image number in the prompt, for example: character A from Image 1 stands up, or the room scene from Image 3. Do not mention only the name without the image number.',
        `You must strictly generate a ${rows}x${cols} grid with exactly ${rows * cols} visible panels. Do not merge panels and do not omit panels.`,
        'You must return JSON in this structure: {"grid_prompt":"...","cell_prompts":[{"shot_number":1,"frame_type":"first_frame","prompt":"..."}]}',
      ].join('\n'),
    }],
    { maxSteps: 10 },
  )

  return findGridPayload(result.toolResults) || findGridPayload(result.text)
}
