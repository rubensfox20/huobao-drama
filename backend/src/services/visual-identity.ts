import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { deriveGenerationSeed } from './generation-seeds.js'
import { normalizeCharacterName, normalizeSceneLocation, normalizeSceneTime } from './extraction-entities.js'
import { normalizeLocationEnglish, sanitizeVisualPrompt, translateVisualText } from './storyboard-prompts.js'
import { normalizeStoryboardContinuityMode } from './storyboard-review.js'

export type CharacterVisualProfile = {
  version: 'v1'
  identityLabel: string
  roleLabel?: string
  ageBand?: string
  genderPresentation?: string
  eraSignature?: string
  faceSignature: string[]
  silhouetteSignature: string[]
  wardrobeSignature: string[]
  paletteSignature: string[]
  distinctiveTraits: string[]
  negativeRules: string[]
  contrastCast: string[]
  referenceAssetPaths: string[]
}

export type SceneVisualProfile = {
  version: 'v1'
  productionLabel: string
  locationCore: string
  timeVariant?: string
  setFamily?: string
  distinctiveAnchor?: string
  eraSignature?: string
  paletteSignature: string[]
  environmentRules: string[]
  negativeRules: string[]
  referenceAssetPaths: string[]
}

export type StoryboardGenerationSpec = {
  version: 'v1'
  storyboardId: number
  episodeId: number
  sceneId?: number | null
  characterIds: number[]
  propIds: number[]
  baseVisualDescription: string
  cameraStyle: string[]
  sceneProfile?: Pick<SceneVisualProfile, 'productionLabel' | 'locationCore' | 'timeVariant' | 'paletteSignature'>
  castProfiles: Array<{
    characterId: number
    identityLabel: string
    promptAnchor: string
    referenceAssetPaths: string[]
  }>
  propAnchors: string[]
  referenceAssetPaths: string[]
  continuity: {
    sourceStoryboardId: number | null
    sourceReason: string
    inheritedReferencePaths: string[]
    resolvedReferenceMode: 'none' | 'single' | 'multiple' | 'first_last'
  }
  continuityRules: string[]
  negativeRules: string[]
  seedPlan: {
    default: number
    byFrameType: Record<string, number>
  }
}

export type PreparedVisualImageRequest = {
  prompt: string
  referenceImages: string[]
  seed?: number
  characterProfile?: CharacterVisualProfile | null
  sceneProfile?: SceneVisualProfile | null
  storyboardSpec?: StoryboardGenerationSpec | null
}

export type PreparedStoryboardVideoRequest = {
  prompt: string
  referenceMode: 'none' | 'single' | 'multiple' | 'first_last'
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  referenceImageUrls?: string[]
  storyboardSpec?: StoryboardGenerationSpec | null
}

const ROLE_HINT_RE = /\b(?:captain|officer|soldier|detective|doctor|nurse|merchant|king|queen|prince|princess|mother|father|son|daughter|guard|pilot|driver|scientist|witch|mage|hunter|warrior|sailor|crew|marinheiro|capitao|capitão|oficial|soldado|rei|rainha|principe|príncipe|princesa|doutor|doutora|guarda|piloto|ca[cç]ador|guerreiro|curandeira|investigator|leader|commander)\b/i
const EXPRESSION_HINT_RE = /\b(?:expression|gaze|eyes|posture|stance|stoic|calm|tense|concerned|determined|resolute|anxious|controlled|wounded|exhausted)\b/i
const PROFILE_NON_ENGLISH_MARKERS = /\b(?:mas|demonstram|demonstra|familia|fam[ií]lia|quando|enquanto|sobreviventes|navio|ilha|praia|costa|tempestade|caos|irrompe|aparece|surge|chega|passa|grupo)\b/i

function normalizeWhitespace(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([,;:])\s*/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function compactUnique(parts: Array<string | null | undefined>, limit = 6) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const part of parts) {
    const value = normalizeWhitespace(String(part || '').replace(/[.]+$/g, ''))
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
    if (result.length >= limit) break
  }
  return result
}

function parseJsonArray(value: string | null | undefined) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '')).filter(Boolean) : []
  } catch {
    return []
  }
}

function mergeReferences(...groups: Array<Array<string | null | undefined>>) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const group of groups) {
    for (const raw of group) {
      const value = normalizeWhitespace(raw)
      if (!value || seen.has(value)) continue
      seen.add(value)
      result.push(value)
    }
  }
  return result.slice(0, 8)
}

function normalizeAssetPath(value: unknown) {
  return normalizeWhitespace(value)
}

function collectContinuitySourceReferenceAssets(storyboard: Record<string, any>) {
  return mergeReferences(
    [storyboard.lastFrameImage, storyboard.composedImage, storyboard.firstFrameImage],
    parseJsonArray(storyboard.referenceImages),
  )
}

function readContinuitySourceStoryboard(storyboard: Record<string, any>) {
  const mode = normalizeStoryboardContinuityMode(storyboard.continuityMode)
  if (mode === 'off') {
    return { sourceStoryboard: null as Record<string, any> | null, sourceReason: 'disabled' }
  }

  const episodeId = Number(storyboard.episodeId || 0)
  if (!episodeId) {
    return { sourceStoryboard: null as Record<string, any> | null, sourceReason: 'missing_episode' }
  }

  const explicitSourceId = Number(storyboard.continuitySourceStoryboardId || 0)
  const priorStoryboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()
    .filter((row) => !row.deletedAt && Number(row.id) !== Number(storyboard.id))
    .sort((left, right) => (
      Number(left.storyboardNumber || 0) - Number(right.storyboardNumber || 0)
      || Number(left.id || 0) - Number(right.id || 0)
    ))

  const explicitSource = explicitSourceId
    ? priorStoryboards.find((row) => Number(row.id) === explicitSourceId) || null
    : null

  const previousStoryboard = priorStoryboards
    .filter((row) => Number(row.storyboardNumber || 0) < Number(storyboard.storyboardNumber || 0))
    .at(-1) || null

  const candidate = explicitSource || previousStoryboard
  if (!candidate) {
    return { sourceStoryboard: null as Record<string, any> | null, sourceReason: explicitSourceId ? 'explicit_missing' : 'no_previous_storyboard' }
  }

  if (mode === 'force') {
    return {
      sourceStoryboard: candidate,
      sourceReason: explicitSource ? 'forced_explicit_source' : 'forced_previous_storyboard',
    }
  }

  const sameScene = (
    Number(candidate.sceneId || 0) > 0
    && Number(storyboard.sceneId || 0) > 0
    && Number(candidate.sceneId) === Number(storyboard.sceneId)
  )

  if (!sameScene) {
    return {
      sourceStoryboard: null as Record<string, any> | null,
      sourceReason: explicitSource ? 'explicit_source_scene_mismatch' : 'previous_storyboard_scene_mismatch',
    }
  }

  return {
    sourceStoryboard: candidate,
    sourceReason: explicitSource ? 'explicit_same_scene_source' : 'previous_same_scene_storyboard',
  }
}

function buildStoryboardVideoReferencePlan(input: {
  storyboard: Record<string, any>
  continuitySource?: Record<string, any> | null
  continuityRefs?: string[]
}) {
  const storyboard = input.storyboard
  const continuityAnchor = normalizeAssetPath(input.continuitySource?.lastFrameImage)
  const currentOpening = normalizeAssetPath(storyboard.firstFrameImage || storyboard.composedImage)
  const currentClosing = normalizeAssetPath(storyboard.lastFrameImage)
  const extraRefs = mergeReferences(
    parseJsonArray(storyboard.referenceImages),
    input.continuityRefs || [],
  ).filter((ref) => ref !== continuityAnchor && ref !== currentOpening && ref !== currentClosing)

  if (continuityAnchor && currentClosing) {
    return {
      referenceMode: 'first_last' as const,
      firstFrameUrl: continuityAnchor,
      lastFrameUrl: currentClosing,
      referenceImageUrls: [] as string[],
    }
  }

  if (currentOpening && currentClosing) {
    return {
      referenceMode: 'first_last' as const,
      firstFrameUrl: currentOpening,
      lastFrameUrl: currentClosing,
      referenceImageUrls: [] as string[],
    }
  }

  const allRefs = mergeReferences(
    continuityAnchor ? [continuityAnchor] : [],
    currentOpening ? [currentOpening] : [],
    extraRefs,
  )

  if (allRefs.length > 1) {
    return {
      referenceMode: 'multiple' as const,
      referenceImageUrls: allRefs,
      imageUrl: null,
      firstFrameUrl: null,
      lastFrameUrl: null,
    }
  }

  if (allRefs.length === 1) {
    return {
      referenceMode: 'single' as const,
      imageUrl: allRefs[0],
      referenceImageUrls: [] as string[],
      firstFrameUrl: null,
      lastFrameUrl: null,
    }
  }

  return {
    referenceMode: 'none' as const,
    referenceImageUrls: [] as string[],
    imageUrl: null,
    firstFrameUrl: null,
    lastFrameUrl: null,
  }
}

function splitVisualFragments(...values: Array<string | null | undefined>) {
  return values
    .map((value) => translateVisualText(value || ''))
    .join(', ')
    .split(/\s*(?:,|;|\.|\|)\s*/g)
    .map((part) => normalizeWhitespace(part))
    .filter((part) => !!part && !PROFILE_NON_ENGLISH_MARKERS.test(part))
}

function findFirstMatch(source: string, patterns: RegExp[]) {
  return patterns.find((pattern) => pattern.test(source)) || null
}

function inferAgeBand(source: string) {
  if (findFirstMatch(source, [/\bchild\b/i, /\bboy\b/i, /\bgirl\b/i])) return 'child'
  if (findFirstMatch(source, [/\bteen(?:ager)?\b/i, /\byouth\b/i])) return 'teenager'
  if (findFirstMatch(source, [/\byoung adult\b/i, /\byoung man\b/i, /\byoung woman\b/i])) return 'young adult'
  if (findFirstMatch(source, [/\bmiddle-aged\b/i, /\bmidlife\b/i])) return 'middle-aged'
  if (findFirstMatch(source, [/\belderly\b/i, /\bold\b/i, /\baged\b/i])) return 'older adult'
  return ''
}

function inferGenderPresentation(source: string) {
  if (findFirstMatch(source, [/\bfemale\b/i, /\bwoman\b/i])) return 'female presentation'
  if (findFirstMatch(source, [/\bmale\b/i, /\bman\b/i])) return 'male presentation'
  return ''
}

function inferPalette(source: string) {
  return compactUnique([
    /\bstorm|rain|cold|blue|gray|grey|moon/i.test(source) ? 'cold gray-blue palette' : '',
    /\bgolden|warm|amber|sunset|torch/i.test(source) ? 'warm amber highlights' : '',
    /\bdark|shadow|night|somber/i.test(source) ? 'dark low-key contrast' : '',
    /\bearth|mud|dust|coast|forest/i.test(source) ? 'natural earth textures' : '',
  ], 3)
}

function inferSceneSetFamily(source: string, locationCore: string) {
  const text = normalizeWhitespace([locationCore, source].join(', '))
  if (/\b(?:aboard|board|deck|cabin|bridge|hold|mast|rigging|quarterdeck|gunwale|conv[eéê]s|cabine|ponte de comando|por[aã]o)\b/i.test(text)) {
    return '18th century shipboard environment'
  }
  if (/\b(?:open sea|sea open|atlantic|ocean|offshore|storm sea|high seas|mar aberto|oceano|atl[aâ]ntico)\b/i.test(text)) {
    return 'storm-lashed open sea around a wooden sailing ship'
  }
  if (/\b(?:cape|horn|headland|promontory|cliff|cabo|peninsula|península)\b/i.test(text)) {
    return 'dangerous cape approach with steep coastal waters'
  }
  if (/\b(?:gulf|bay|inlet|fjord|cove|golfo|ba[ií]a|enseada)\b/i.test(text)) {
    return 'isolated coastal inlet with cold water and rugged terrain'
  }
  if (/\b(?:beach|shore|coast|praia|costa|littoral)\b/i.test(text)) {
    return 'remote subantarctic coastline with surf, wet rocks, and harsh exposure'
  }
  if (/\b(?:camp|encampment|campfire|shelter|acampamento|abrigo)\b/i.test(text)) {
    return 'temporary survival camp on a harsh remote coast'
  }
  return 'historically grounded environment with coherent geography'
}

function inferSceneDistinctiveAnchor(source: string, locationCore: string) {
  const text = normalizeWhitespace([locationCore, source].join(', '))
  return compactUnique([
    /\b(?:broken mast|wreck|shipwreck|wreckage|casco quebrado|destro[cç]os do navio)\b/i.test(text) ? 'wrecked wooden ship remains as the primary anchor' : '',
    /\b(?:deck|rigging|mast|sails|conv[eéê]s|mastros?|velas?)\b/i.test(text) ? 'wet rigging, masts, and timber lines dominating the frame' : '',
    /\b(?:camp|campfire|tent|shelter|fogueira|barraca|abrigo)\b/i.test(text) ? 'small survival camp carved into the hostile landscape' : '',
    /\b(?:cliff|rocky|shoal|reef|rochas|penhasco|arrebenta[cç][aã]o)\b/i.test(text) ? 'dark rock formations and violent surf shaping the geography' : '',
    /\b(?:forest|treeline|pine|floresta|arvores?)\b/i.test(text) ? 'treeline pressing against the exposed shoreline' : '',
    /\b(?:fog|mist|rain|storm|neblina|chuva|tempestade)\b/i.test(text) ? 'cold weather veil reducing visibility across the set' : '',
  ], 2).join(', ')
}

function inferWardrobeFragments(source: string) {
  return compactUnique([
    /\buniform\b/i.test(source) ? 'historical uniform' : '',
    /\bnaval coat\b/i.test(source) ? 'naval coat' : '',
    /\bcoat\b/i.test(source) ? 'weathered coat' : '',
    /\bcloak\b/i.test(source) ? 'cloak' : '',
    /\barmor\b/i.test(source) ? 'light armor' : '',
    /\btunic\b/i.test(source) ? 'tunic' : '',
    /\bdress\b/i.test(source) ? 'dress' : '',
    /\bboots\b/i.test(source) ? 'sturdy boots' : '',
    ...splitVisualFragments(source).filter((part) => /\b(?:coat|cloak|armor|tunic|dress|uniform|boots|hat|jacket|shirt|trousers|cape)\b/i.test(part)).slice(0, 3),
  ], 4)
}

function inferFaceFragments(source: string) {
  return compactUnique([
    /\bscar\b/i.test(source) ? 'scarred face' : '',
    /\bbeard\b/i.test(source) ? 'beard' : '',
    /\bmustache\b/i.test(source) ? 'mustache' : '',
    /\bbald\b/i.test(source) ? 'bald head' : '',
    /\blong hair\b/i.test(source) ? 'long hair' : '',
    /\bshort hair\b/i.test(source) ? 'short hair' : '',
    /\bweathered\b/i.test(source) ? 'weathered facial features' : '',
    /\bgaunt\b/i.test(source) ? 'gaunt face' : '',
    ...splitVisualFragments(source).filter((part) => /\b(?:face|eyes|hair|beard|scar|jaw|brow|gaze)\b/i.test(part)).slice(0, 3),
  ], 4)
}

function inferSilhouetteFragments(source: string) {
  return compactUnique([
    /\bathletic\b/i.test(source) ? 'athletic build' : '',
    /\bslender\b/i.test(source) ? 'slender silhouette' : '',
    /\bgaunt\b/i.test(source) ? 'gaunt silhouette' : '',
    /\bbroad\b/i.test(source) ? 'broad frame' : '',
    /\btall\b/i.test(source) ? 'tall silhouette' : '',
    /\bshort\b/i.test(source) ? 'shorter silhouette' : '',
    /\blimp\b/i.test(source) ? 'unsteady posture' : '',
    ...splitVisualFragments(source).filter((part) => /\b(?:build|silhouette|posture|frame|stance)\b/i.test(part)).slice(0, 3),
  ], 4)
}

function inferDistinctiveTraits(source: string) {
  return compactUnique([
    /\bcommander|captain|officer\b/i.test(source) ? 'command presence' : '',
    /\bexhausted|wounded|injured\b/i.test(source) ? 'worn physical state' : '',
    /\bcalm|stoic\b/i.test(source) ? 'controlled expression' : '',
    /\banxious|concerned\b/i.test(source) ? 'tense expression' : '',
    /\bdetermined|resolute\b/i.test(source) ? 'resolute gaze' : '',
    ...splitVisualFragments(source)
      .filter((part) => EXPRESSION_HINT_RE.test(part))
      .slice(0, 2),
  ], 5)
}

function inferEraSignature(source: string, fallback = '') {
  if (/\b18th century|174\d|17\d{2}|historical\b/i.test(source)) return '18th century historical realism'
  if (/\bfantasy|kingdom|artifact|magic\b/i.test(source)) return 'grounded fantasy period look'
  return fallback
}

function buildPromptBlock(label: string, values: string[]) {
  return values.length ? `${label}: ${values.join(', ')}` : ''
}

function collectCharacterReferenceAssets(character: Record<string, any>) {
  return mergeReferences(
    parseJsonArray(character.referenceImages),
    [character.imageUrl, character.localPath],
  )
}

function collectSceneReferenceAssets(scene: Record<string, any>) {
  return mergeReferences([scene.imageUrl, scene.localPath])
}

function collectStoryboardReferenceAssets(storyboard: Record<string, any>) {
  return mergeReferences(
    parseJsonArray(storyboard.referenceImages),
    [storyboard.firstFrameImage, storyboard.lastFrameImage, storyboard.composedImage],
  )
}

function buildCharacterPromptAnchor(profile: CharacterVisualProfile) {
  return compactUnique([
    profile.ageBand,
    profile.genderPresentation,
    ...profile.faceSignature,
    ...profile.silhouetteSignature,
    ...profile.wardrobeSignature,
    ...profile.distinctiveTraits,
  ], 5).join(', ')
}

export function buildCharacterVisualProfile(character: Record<string, any>, peers: Record<string, any>[] = []): CharacterVisualProfile {
  const identityLabel = normalizeCharacterName(character.name || '') || String(character.name || '').trim()
  const rawRoleLabel = normalizeWhitespace(translateVisualText(character.role || ''))
  const source = normalizeWhitespace([
    rawRoleLabel,
    translateVisualText(character.appearance || ''),
    translateVisualText(character.description || ''),
    translateVisualText(character.personality || ''),
  ].filter(Boolean).join(', '))

  const contrastCast = compactUnique(
    peers
      .filter((peer) => peer.id !== character.id)
      .map((peer) => normalizeCharacterName(peer.name || '') || String(peer.name || '').trim()),
    4,
  )

  return {
    version: 'v1',
    identityLabel,
    roleLabel: rawRoleLabel && ROLE_HINT_RE.test(rawRoleLabel) ? rawRoleLabel : undefined,
    ageBand: inferAgeBand(source) || undefined,
    genderPresentation: inferGenderPresentation(source) || undefined,
    eraSignature: inferEraSignature(source, 'period-authentic cinematic realism'),
    faceSignature: inferFaceFragments(source),
    silhouetteSignature: inferSilhouetteFragments(source),
    wardrobeSignature: inferWardrobeFragments(source),
    paletteSignature: inferPalette(source),
    distinctiveTraits: inferDistinctiveTraits(source),
    negativeRules: compactUnique([
      'do not merge this face with any other recurring character',
      'avoid duplicated facial structure, hairstyle, costume, or silhouette',
      'no extra limbs, no malformed hands, no cloned background figures posing as lead characters',
    ], 4),
    contrastCast,
    referenceAssetPaths: collectCharacterReferenceAssets(character),
  }
}

export function buildSceneVisualProfile(scene: Record<string, any>): SceneVisualProfile {
  const locationCore = normalizeLocationEnglish(String(scene.location || ''))
  const timeVariant = normalizeWhitespace(translateVisualText(scene.time || '')) || undefined
  const source = normalizeWhitespace([
    locationCore,
    timeVariant || '',
    translateVisualText(scene.prompt || ''),
  ].filter(Boolean).join(', '))
  const setFamily = inferSceneSetFamily(source, locationCore)
  const distinctiveAnchor = inferSceneDistinctiveAnchor(source, locationCore) || undefined
  const locationParts = compactUnique(locationCore.split(/\s*,\s*/g), 8).map((part) => part.toLowerCase())
  const timeParts = compactUnique(String(timeVariant || '').split(/\s*,\s*/g), 8).map((part) => part.toLowerCase())
  const sourceFragments = splitVisualFragments(source).filter((part) => {
    const lower = part.toLowerCase()
    return lower !== locationCore.toLowerCase()
      && lower !== String(timeVariant || '').toLowerCase()
      && lower !== setFamily.toLowerCase()
      && lower !== String(distinctiveAnchor || '').toLowerCase()
      && !locationParts.some((item) => item && (lower === item || lower.includes(item) || item.includes(lower)))
      && !timeParts.some((item) => item && (lower === item || lower.includes(item) || item.includes(lower)))
  })

  return {
    version: 'v1',
    productionLabel: compactUnique([locationCore, timeVariant], 2).join(' · ') || locationCore,
    locationCore,
    timeVariant,
    setFamily,
    distinctiveAnchor,
    eraSignature: inferEraSignature(source, 'historically grounded environment'),
    paletteSignature: inferPalette(source),
    environmentRules: compactUnique([
      ...sourceFragments.slice(0, 4),
      /\bstorm|rain|wind\b/i.test(source) ? 'weather should stay consistent across shots' : '',
      /\bbeach|coast|shore\b/i.test(source) ? 'coastal geography should remain coherent' : '',
    ], 5),
    negativeRules: compactUnique([
      'do not change the core geography between related shots',
      'avoid modern objects, modern architecture, or anachronistic lighting',
      'no text, subtitles, or watermarks',
    ], 4),
    referenceAssetPaths: collectSceneReferenceAssets(scene),
  }
}

function selectRelevantPropsForStoryboard(storyboard: Record<string, any>, props: Record<string, any>[]) {
  const context = normalizeWhitespace([
    storyboard.title,
    storyboard.description,
    storyboard.action,
    storyboard.imagePrompt,
    storyboard.location,
    storyboard.time,
  ].filter(Boolean).join(' ')).toLowerCase()

  return props.filter((prop) => {
    const name = normalizeWhitespace(String(prop.name || '')).toLowerCase()
    if (!name) return false
    return context.includes(name)
  })
}

export function buildStoryboardGenerationSpec(input: {
  storyboard: Record<string, any>
  episode: Record<string, any>
  scene?: Record<string, any> | null
  characters?: Record<string, any>[]
  props?: Record<string, any>[]
}): StoryboardGenerationSpec {
  const { storyboard, episode, scene } = input
  const characters = input.characters || []
  const relevantProps = selectRelevantPropsForStoryboard(storyboard, input.props || [])
  const sceneProfile = scene
    ? buildSceneVisualProfile(scene)
    : buildSceneVisualProfile({
      location: storyboard.location || '',
      time: storyboard.time || '',
      prompt: storyboard.imagePrompt || storyboard.description || storyboard.action || '',
    })

  const castProfiles = characters.map((character) => {
    const profile = buildCharacterVisualProfile(character, characters)
    return {
      characterId: character.id,
      identityLabel: profile.identityLabel,
      promptAnchor: buildCharacterPromptAnchor(profile),
      referenceAssetPaths: profile.referenceAssetPaths,
    }
  })

  const cameraStyle = compactUnique([
    normalizeWhitespace(translateVisualText(storyboard.shotType || '')),
    normalizeWhitespace(translateVisualText(storyboard.angle || '')),
    normalizeWhitespace(translateVisualText(storyboard.movement || '')),
  ], 3)

  const { sourceStoryboard, sourceReason } = readContinuitySourceStoryboard(storyboard)
  const inheritedReferencePaths = sourceStoryboard
    ? collectContinuitySourceReferenceAssets(sourceStoryboard)
    : []
  const videoReferencePlan = buildStoryboardVideoReferencePlan({
    storyboard,
    continuitySource: sourceStoryboard,
    continuityRefs: inheritedReferencePaths,
  })

  const referenceAssetPaths = mergeReferences(
    collectStoryboardReferenceAssets(storyboard),
    inheritedReferencePaths,
    sceneProfile.referenceAssetPaths,
    ...castProfiles.map((profile) => profile.referenceAssetPaths),
  )

  return {
    version: 'v1',
    storyboardId: Number(storyboard.id),
    episodeId: Number(storyboard.episodeId || episode.id),
    sceneId: storyboard.sceneId ?? scene?.id ?? null,
    characterIds: castProfiles.map((profile) => profile.characterId),
    propIds: relevantProps.map((prop) => prop.id),
    baseVisualDescription: normalizeWhitespace(translateVisualText(
      storyboard.imagePrompt
      || storyboard.description
      || storyboard.action
      || storyboard.title
      || 'cinematic storyboard frame',
    )),
    cameraStyle,
    sceneProfile: {
      productionLabel: sceneProfile.productionLabel,
      locationCore: sceneProfile.locationCore,
      timeVariant: sceneProfile.timeVariant,
      paletteSignature: sceneProfile.paletteSignature,
    },
    castProfiles,
    propAnchors: compactUnique(relevantProps.map((prop) => normalizeWhitespace(String(prop.name || ''))), 4),
    referenceAssetPaths,
    continuity: {
      sourceStoryboardId: sourceStoryboard ? Number(sourceStoryboard.id) : null,
      sourceReason,
      inheritedReferencePaths,
      resolvedReferenceMode: videoReferencePlan.referenceMode,
    },
    continuityRules: compactUnique([
      'maintain exact character identity established for this drama',
      'keep each recurring character visually distinct from the others',
      'preserve wardrobe and historical continuity inside the same episode',
      'preserve scene geography and prop continuity across adjacent shots',
      sourceStoryboard
        ? `carry forward visual transition cues from storyboard ${Number(sourceStoryboard.storyboardNumber || sourceStoryboard.id)}`
        : '',
    ], 4),
    negativeRules: compactUnique([
      'no merged faces, no duplicated lead characters, no cloned silhouettes',
      'no extra limbs, malformed hands, or broken anatomy',
      'no text, subtitles, speech bubbles, or watermarks',
    ], 4),
    seedPlan: {
      default: deriveGenerationSeed({
        kind: 'storyboard',
        dramaId: episode.dramaId,
        episodeId: episode.id,
        storyboardId: storyboard.id,
        frameType: storyboard.frameType || 'base',
      }),
      byFrameType: {
        composed: deriveGenerationSeed({
          kind: 'storyboard',
          dramaId: episode.dramaId,
          episodeId: episode.id,
          storyboardId: storyboard.id,
          frameType: 'composed',
        }),
        first_frame: deriveGenerationSeed({
          kind: 'storyboard',
          dramaId: episode.dramaId,
          episodeId: episode.id,
          storyboardId: storyboard.id,
          frameType: 'first_frame',
        }),
        last_frame: deriveGenerationSeed({
          kind: 'storyboard',
          dramaId: episode.dramaId,
          episodeId: episode.id,
          storyboardId: storyboard.id,
          frameType: 'last_frame',
        }),
      },
    },
  }
}

export function buildCharacterImagePromptFromProfile(profile: CharacterVisualProfile, customPrompt = '') {
  const basePrompt = normalizeWhitespace(customPrompt) || 'cinematic character design sheet'
  return sanitizeVisualPrompt(compactUnique([
    basePrompt,
    profile.identityLabel,
    profile.roleLabel ? `role: ${profile.roleLabel}` : '',
    profile.ageBand ? `age band: ${profile.ageBand}` : '',
    profile.genderPresentation ? `presentation: ${profile.genderPresentation}` : '',
    profile.eraSignature ? `period: ${profile.eraSignature}` : '',
    buildPromptBlock('face signature', profile.faceSignature),
    buildPromptBlock('silhouette', profile.silhouetteSignature),
    buildPromptBlock('wardrobe', profile.wardrobeSignature),
    buildPromptBlock('palette', profile.paletteSignature),
    buildPromptBlock('distinctive traits', profile.distinctiveTraits),
    profile.contrastCast.length
      ? `must stay clearly different from other recurring characters such as ${profile.contrastCast.join(', ')}`
      : 'must stay clearly different from any other recurring character',
    ...profile.negativeRules,
    'full body reference portrait',
    'clean studio background',
    'high detail',
  ], 20).join(', '))
}

export function buildSceneImagePromptFromProfile(profile: SceneVisualProfile, customPrompt = '') {
  const basePrompt = normalizeWhitespace(customPrompt) || 'cinematic environment concept art'
  return sanitizeVisualPrompt(compactUnique([
    basePrompt,
    profile.locationCore ? `setting: ${profile.locationCore}` : profile.productionLabel,
    profile.timeVariant ? `period: ${profile.timeVariant}` : '',
    profile.setFamily ? `set family: ${profile.setFamily}` : '',
    profile.distinctiveAnchor ? `visual anchor: ${profile.distinctiveAnchor}` : '',
    profile.eraSignature ? `look: ${profile.eraSignature}` : '',
    buildPromptBlock('palette', profile.paletteSignature),
    buildPromptBlock('environment', profile.environmentRules),
    ...profile.negativeRules,
    'high detail',
  ], 18).join(', '))
}

export function buildStoryboardImagePromptFromSpec(spec: StoryboardGenerationSpec, customPrompt = '') {
  const basePrompt = normalizeWhitespace(customPrompt) || spec.baseVisualDescription || 'cinematic storyboard frame'
  const castBlock = spec.castProfiles.map((profile) => `${profile.identityLabel}: ${profile.promptAnchor}`).join('; ')
  return sanitizeVisualPrompt(compactUnique([
    basePrompt,
    spec.sceneProfile?.productionLabel ? `setting: ${spec.sceneProfile.productionLabel}` : '',
    spec.sceneProfile?.timeVariant ? `time: ${spec.sceneProfile.timeVariant}` : '',
    buildPromptBlock('camera', spec.cameraStyle),
    buildPromptBlock('palette', spec.sceneProfile?.paletteSignature || []),
    castBlock ? `cast continuity: ${castBlock}` : '',
    spec.propAnchors.length ? `props: ${spec.propAnchors.join(', ')}` : '',
    ...spec.continuityRules,
    ...spec.negativeRules,
    'high detail',
  ], 24).join(', '))
}

function persistJsonField(table: 'characters' | 'scenes' | 'storyboards', id: number, field: string, value: string, extraUpdates: Record<string, any> = {}) {
  const updates = { [field]: value, updatedAt: now(), ...extraUpdates }
  if (table === 'characters') {
    db.update(schema.characters).set(updates).where(eq(schema.characters.id, id)).run()
    return
  }
  if (table === 'scenes') {
    db.update(schema.scenes).set(updates).where(eq(schema.scenes.id, id)).run()
    return
  }
  db.update(schema.storyboards).set(updates).where(eq(schema.storyboards.id, id)).run()
}

function readStoryboardsCharacters(storyboardId: number) {
  const links = db.select().from(schema.storyboardCharacters).where(eq(schema.storyboardCharacters.storyboardId, storyboardId)).all()
  if (!links.length) return []
  const ids = new Set(links.map((link) => link.characterId))
  return db.select().from(schema.characters).all().filter((character) => ids.has(character.id) && !character.deletedAt)
}

function readEpisodeProps(episodeId: number) {
  const links = db.select().from(schema.episodeProps).where(eq(schema.episodeProps.episodeId, episodeId)).all()
  if (!links.length) return []
  const ids = new Set(links.map((link) => link.propId))
  return db.select().from(schema.props).all().filter((prop) => ids.has(prop.id) && !prop.deletedAt)
}

export function prepareVisualImageRequest(input: {
  prompt?: string | null
  storyboardId?: number
  sceneId?: number
  characterId?: number
  episodeId?: number
  frameType?: string | null
  referenceImages?: string[]
}) : PreparedVisualImageRequest {
  let prompt = normalizeWhitespace(input.prompt)
  let referenceImages = mergeReferences(input.referenceImages || [])
  let seed: number | undefined
  let characterProfile: CharacterVisualProfile | null = null
  let sceneProfile: SceneVisualProfile | null = null
  let storyboardSpec: StoryboardGenerationSpec | null = null

  if (input.storyboardId) {
    const [storyboard] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, input.storyboardId)).all()
    if (storyboard) {
      const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, storyboard.episodeId)).all()
      if (episode) {
        const scene = storyboard.sceneId
          ? db.select().from(schema.scenes).where(eq(schema.scenes.id, storyboard.sceneId)).all()[0] || null
          : null
        const characters = readStoryboardsCharacters(storyboard.id)
        const props = readEpisodeProps(episode.id)
        storyboardSpec = buildStoryboardGenerationSpec({ storyboard, episode, scene, characters, props })
        seed = storyboardSpec.seedPlan.byFrameType[input.frameType || 'composed'] || storyboardSpec.seedPlan.default
        referenceImages = mergeReferences(referenceImages, storyboardSpec.referenceAssetPaths)
        prompt = buildStoryboardImagePromptFromSpec(
          storyboardSpec,
          prompt || storyboard.imagePrompt || storyboard.description || storyboard.action || storyboard.title || '',
        )
        persistJsonField('storyboards', storyboard.id, 'generationSpec', JSON.stringify(storyboardSpec))
      }
    }
  } else {
    if (input.characterId) {
      const [character] = db.select().from(schema.characters).where(eq(schema.characters.id, input.characterId)).all()
      if (character) {
        const peers = db.select().from(schema.characters).where(eq(schema.characters.dramaId, character.dramaId)).all().filter((peer) => !peer.deletedAt)
        characterProfile = buildCharacterVisualProfile(character, peers)
        seed = deriveGenerationSeed({
          kind: 'character',
          dramaId: character.dramaId,
          characterId: character.id,
          frameType: input.frameType || 'portrait',
        })
        referenceImages = mergeReferences(referenceImages, characterProfile.referenceAssetPaths)
        prompt = buildCharacterImagePromptFromProfile(characterProfile, prompt)
        persistJsonField('characters', character.id, 'visualProfile', JSON.stringify(characterProfile), { seedValue: String(seed) })
      }
    }

    if (input.sceneId) {
      const [scene] = db.select().from(schema.scenes).where(eq(schema.scenes.id, input.sceneId)).all()
      if (scene) {
        sceneProfile = buildSceneVisualProfile(scene)
        seed ||= deriveGenerationSeed({
          kind: 'scene',
          dramaId: scene.dramaId,
          episodeId: scene.episodeId,
          sceneId: scene.id,
          frameType: input.frameType || 'environment',
        })
        referenceImages = mergeReferences(referenceImages, sceneProfile.referenceAssetPaths)
        prompt = buildSceneImagePromptFromProfile(sceneProfile, prompt)
        persistJsonField('scenes', scene.id, 'visualProfile', JSON.stringify(sceneProfile))
      }
    }
  }

  return {
    prompt: sanitizeVisualPrompt(prompt),
    referenceImages,
    seed,
    characterProfile,
    sceneProfile,
    storyboardSpec,
  }
}

export function prepareStoryboardVideoRequest(input: {
  storyboardId: number
  prompt?: string | null
  referenceMode?: string | null
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  referenceImageUrls?: string[]
}) : PreparedStoryboardVideoRequest {
  const [storyboard] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, input.storyboardId)).all()
  if (!storyboard) {
    throw new Error(`Storyboard ${input.storyboardId} not found`)
  }

  const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, storyboard.episodeId)).all()
  if (!episode) {
    throw new Error(`Episode ${storyboard.episodeId} not found`)
  }

  const scene = storyboard.sceneId
    ? db.select().from(schema.scenes).where(eq(schema.scenes.id, storyboard.sceneId)).all()[0] || null
    : null
  const characters = readStoryboardsCharacters(storyboard.id)
  const props = readEpisodeProps(episode.id)
  const storyboardSpec = buildStoryboardGenerationSpec({ storyboard, episode, scene, characters, props })
  persistJsonField('storyboards', storyboard.id, 'generationSpec', JSON.stringify(storyboardSpec))

  const prompt = sanitizeVisualPrompt(
    normalizeWhitespace(input.prompt)
    || storyboard.videoPrompt
    || storyboard.imagePrompt
    || storyboard.description
    || storyboard.action
    || storyboard.title
    || 'cinematic motion shot',
  )

  const explicitReferenceMode = normalizeWhitespace(input.referenceMode)
  const explicitImageUrl = normalizeAssetPath(input.imageUrl)
  const explicitFirstFrameUrl = normalizeAssetPath(input.firstFrameUrl)
  const explicitLastFrameUrl = normalizeAssetPath(input.lastFrameUrl)
  const explicitReferenceImageUrls = mergeReferences(input.referenceImageUrls || [])

  if (
    explicitReferenceMode
    || explicitImageUrl
    || explicitFirstFrameUrl
    || explicitLastFrameUrl
    || explicitReferenceImageUrls.length > 0
  ) {
    return {
      prompt,
      referenceMode: (explicitReferenceMode || 'none') as PreparedStoryboardVideoRequest['referenceMode'],
      imageUrl: explicitImageUrl,
      firstFrameUrl: explicitFirstFrameUrl,
      lastFrameUrl: explicitLastFrameUrl,
      referenceImageUrls: explicitReferenceImageUrls,
      storyboardSpec,
    }
  }

  const { sourceStoryboard } = readContinuitySourceStoryboard(storyboard)
  const plan = buildStoryboardVideoReferencePlan({
    storyboard,
    continuitySource: sourceStoryboard,
    continuityRefs: storyboardSpec.continuity.inheritedReferencePaths,
  })

  return {
    prompt,
    referenceMode: plan.referenceMode,
    imageUrl: plan.imageUrl,
    firstFrameUrl: plan.firstFrameUrl,
    lastFrameUrl: plan.lastFrameUrl,
    referenceImageUrls: plan.referenceImageUrls,
    storyboardSpec,
  }
}
