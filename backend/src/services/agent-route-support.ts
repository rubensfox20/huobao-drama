import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { fallbackAssignVoices, fallbackExtractAndSaveMetadata } from './agent-fallbacks.js'
import { generateTextCompletion } from './text-provider.js'
import { buildAllowedSpeakerHint, findScriptStructuralIssues, sanitizeRewrittenScript } from './script-sanitizer.js'
import { saveEpisodeStoryboards, type StoryboardDraftInput } from './storyboard-persistence.js'
import { now } from '../utils/response.js'

export { fallbackAssignVoices, fallbackExtractAndSaveMetadata }

export function extractAgentErrorMessage(err: any) {
  const responseBody = String(err?.responseBody || '')
  if (responseBody) {
    try {
      const parsed = JSON.parse(responseBody)
      const errorPayload = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error
      const raw = errorPayload?.metadata?.raw
      const message = errorPayload?.message
      if (raw) return raw
      if (message) return message
    } catch {}
  }

  return err?.message || 'Agent execution failed'
}

export function extractJsonObject(content: string) {
  const text = String(content || '').trim()
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const start = text.indexOf('{')
  if (start >= 0) {
    let depth = 0
    let inString = false
    let escaped = false

    for (let index = start; index < text.length; index += 1) {
      const char = text[index]

      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }
        if (char === '\\') {
          escaped = true
          continue
        }
        if (char === '"') {
          inString = false
        }
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }

      if (char === '{') depth += 1
      if (char === '}') {
        depth -= 1
        if (depth === 0) {
          return text.slice(start, index + 1)
        }
      }
    }
  }

  return text
}

export function normalizeStoryboardDrafts(payload: any): StoryboardDraftInput[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.storyboards)
      ? payload.storyboards
      : Array.isArray(payload?.shots)
        ? payload.shots
        : []

  return rows
    .map((item: any, index: number) => {
      const sceneRef = item?.scene || {}
      const characters = Array.isArray(item?.character_names)
        ? item.character_names
        : Array.isArray(item?.characterNames)
          ? item.characterNames
          : Array.isArray(item?.characters)
            ? item.characters.map((entry: any) => typeof entry === 'string' ? entry : entry?.name).filter(Boolean)
            : []

      return {
        shot_number: Number(item?.shot_number ?? item?.shotNumber ?? index + 1) || index + 1,
        title: String(item?.title || '').trim(),
        shot_type: String(item?.shot_type ?? item?.shotType ?? '').trim(),
        angle: String(item?.angle || '').trim(),
        movement: String(item?.movement || '').trim(),
        location: String(item?.location || item?.scene_location || item?.sceneLocation || sceneRef?.location || '').trim(),
        time: String(item?.time || item?.scene_time || item?.sceneTime || sceneRef?.time || '').trim(),
        action: String(item?.action || '').trim(),
        dialogue: String(item?.dialogue || '').trim(),
        description: String(item?.description || '').trim(),
        result: String(item?.result || '').trim(),
        atmosphere: String(item?.atmosphere || '').trim(),
        image_prompt: String(item?.image_prompt ?? item?.imagePrompt ?? '').trim(),
        video_prompt: String(item?.video_prompt ?? item?.videoPrompt ?? '').trim(),
        bgm_prompt: String(item?.bgm_prompt ?? item?.bgmPrompt ?? '').trim(),
        sound_effect: String(item?.sound_effect ?? item?.soundEffect ?? '').trim(),
        duration: Number(item?.duration ?? 10) || 10,
        scene_id: Number(item?.scene_id ?? item?.sceneId ?? 0) || null,
        character_ids: Array.isArray(item?.character_ids)
          ? item.character_ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value))
          : Array.isArray(item?.characterIds)
            ? item.characterIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value))
            : [],
        character_names: characters.map((value: unknown) => String(value || '').trim()).filter(Boolean),
      } satisfies StoryboardDraftInput
    })
    .filter((item: StoryboardDraftInput) => item.shot_number && (item.title || item.description || item.action || item.location))
}

export async function fallbackGenerateAndSaveStoryboards(episodeId: number, dramaId: number, workflowJobId?: number | null) {
  const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  const script = String(episode?.scriptContent || episode?.content || '').trim()
  if (!episode || !script) {
    throw new Error('Episode has no screenplay to break into storyboards')
  }

  const linkedCharacterIds = new Set(
    db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId))
      .all()
      .map(link => link.characterId),
  )
  const linkedSceneIds = new Set(
    db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.episodeId, episodeId))
      .all()
      .map(link => link.sceneId),
  )

  const characters = db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId))
    .all()
    .filter(character => !character.deletedAt && linkedCharacterIds.has(character.id))
    .map(character => ({
      id: character.id,
      name: character.name,
      role: character.role || '',
      description: character.description || '',
    }))

  const scenes = db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, dramaId))
    .all()
    .filter(scene => !scene.deletedAt && linkedSceneIds.has(scene.id))
    .map(scene => ({
      id: scene.id,
      location: scene.location,
      time: scene.time || '',
      prompt: scene.prompt || '',
    }))

  const response = await generateTextCompletion({
    workflowJobId: workflowJobId ?? null,
    operation: 'storyboard-breaker-fallback',
    temperature: 0.1,
    jsonOnly: true,
    system: [
      'You are a conservative storyboard planner for short-form historical drama.',
      'Return valid JSON only in the format {"storyboards":[...]} and nothing else.',
      'Do not use markdown or code fences.',
      'Editorial fields title, description, action, dialogue, location, time, shot_type, angle, movement, result, atmosphere must be in Brazilian Portuguese.',
      'image_prompt, video_prompt, bgm_prompt, and sound_effect must be only in English.',
      'Use only the provided scenes. Do not invent new scene names or micro-locations.',
      'Use only the provided named characters. Do not invent or infer extra characters.',
      'If the screenplay does not contain explicit Character Name: dialogue for a moment, leave dialogue empty.',
      'Never invent dialogue.',
      'Assign each explicit spoken line to at most one shot.',
      'Output each storyboard item with: shot_number, title, shot_type, angle, movement, location, time, action, dialogue, description, result, atmosphere, image_prompt, video_prompt, bgm_prompt, sound_effect, duration, scene_location, scene_time, character_names.',
      'Keep durations between 8 and 12 seconds unless a shorter beat is clearly necessary.',
      'Keep the sequence grounded in the screenplay order.',
    ].join('\n'),
    prompt: [
      `Episode title: ${episode.title}`,
      `Episode number: ${episode.episodeNumber}`,
      `Available scenes (hard allowlist): ${JSON.stringify(scenes)}`,
      `Available named characters (hard allowlist): ${JSON.stringify(characters)}`,
      'Break the screenplay below into conservative storyboard shots.',
      script,
    ].join('\n\n'),
  })

  let parsed: any
  try {
    parsed = JSON.parse(extractJsonObject(response.text))
  } catch (error) {
    throw new Error(`Storyboard fallback returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const storyboards = normalizeStoryboardDrafts(parsed)
  if (!storyboards.length) {
    throw new Error('Storyboard fallback returned no storyboard rows')
  }

  const saved = saveEpisodeStoryboards(episodeId, dramaId, storyboards)
  return {
    ...saved,
    storyboards,
    rawText: response.text,
  }
}

export async function fallbackRewriteAndSaveScript(episodeId: number) {
  const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  const source = episode?.content || episode?.scriptContent || ''
  if (!episode || !source) {
    throw new Error('Episode has no content to rewrite')
  }

  const allowedSpeakerHint = buildAllowedSpeakerHint(source)
  let rewritten = sanitizeRewrittenScript((await generateTextCompletion({
    operation: 'rewrite-fallback',
    temperature: 0.2,
    system: [
      'You are a senior screenplay adapter for short-form historical drama.',
      'Final output must be written in Brazilian Portuguese.',
      'Never answer in Chinese.',
      'Preserve canonical names and source facts exactly.',
      'Do not invent, translate, or replace existing proper names.',
      'If the source contains explicit Character Name: dialogue, preserve those speakers and those speaking moments.',
      'If the source does not contain explicit spoken dialogue, do not invent any.',
      'Use dialogue only when the source clearly supports a speaking moment.',
      'Do not create named dialogue for generic groups, background figures, historical mentions, or off-screen references.',
      'Do not create generic speaker labels such as "Marinheiro", "Oficial 1", "Young Sailor", or "Voice of the Officer".',
      'If the source does not justify direct speech, convert the idea into action prose instead.',
      'Do not use markdown, bold text, bullet lists, or closing markers such as "FIM DO ROTEIRO".',
      allowedSpeakerHint,
      'Return only the final screenplay.',
      'Required format:',
      '- Scene header: ## S<number> | Interior/Exterior · Location | Time period',
      '- Action: natural prose paragraphs, no camera jargon',
      '- Dialogue: Character Name: (emotion/state) spoken line',
      '- Each scene should roughly cover 30 to 60 seconds',
    ].join('\n'),
    prompt: `Rewrite the source below into a structured screenplay while staying strictly grounded in the material.\n\n${source}`,
  })).text, source)

  if (findScriptStructuralIssues(rewritten, source).some(issue => /rotulos genericos|falantes nao autorizados/i.test(issue))) {
    rewritten = sanitizeRewrittenScript((await generateTextCompletion({
      operation: 'rewrite-fallback-repair',
      temperature: 0.1,
      system: [
        'You are a screenplay repair editor.',
        'Final output must be written in Brazilian Portuguese.',
        'Never answer in Chinese.',
        'Preserve valid scenes, atmosphere, valid names, and narrative order.',
        'Remove dialogue with generic labels such as "Marinheiro Jovem", "Oficial 1", "Oficial 2", and "Voice of the Officer".',
        'Remove dialogue from named people who are not explicitly grounded as active speakers in the source material.',
        'When a speaker is not source-valid, convert the line into action prose, crowd tension, or group reaction.',
        'Keep dialogue only for source-grounded, active named characters.',
        allowedSpeakerHint,
        'Do not use markdown, bold text, or closing markers.',
        'Return only the corrected final screenplay.',
      ].join('\n'),
      prompt: `Source material:\n\n${source}\n\nCurrent screenplay to repair:\n\n${rewritten}`,
    })).text, source)
  }

  if (!rewritten) {
    throw new Error('Rewrite fallback returned empty content')
  }

  db.update(schema.episodes)
    .set({ scriptContent: rewritten, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  return rewritten
}

export function normalizeToolName(entry: any) {
  const payload = entry?.payload || {}
  return entry?.toolName
    || payload.toolName
    || entry?.tool?.toolName
    || entry?.tool?.id
    || entry?.name
    || entry?.type
    || null
}

export function normalizeToolResult(entry: any) {
  const payload = entry?.payload || {}
  const result = entry?.result ?? payload.result ?? entry?.output ?? entry?.data ?? null
  return typeof result === 'string' ? result : JSON.stringify(result)
}
