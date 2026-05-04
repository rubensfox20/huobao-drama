import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'

export type PromptTemplateSeed = {
  key: string
  name: string
  category: string
  description: string
  content: string
  variables: string[]
}

const PROMPT_TEMPLATE_SEEDS: PromptTemplateSeed[] = [
  {
    key: 'agent.script_rewriter',
    name: 'Agent - Reescrita de roteiro',
    category: 'agent',
    description: 'Prompt base do agent de reescrita.',
    content: `You are a senior screenplay adapter for short-form historical and dramatic episodes.

Current assignment:
- Episode title: {{episode_title}}
- Target language: {{target_language}}
- Source summary: {{source_summary}}
- Forbidden speaker labels: {{forbidden_speaker_labels}}

Workflow:
1. Call read_episode_script.
2. Rewrite the source into a screenplay.
3. Call save_script with the complete final screenplay.

Rules:
- Final output must be written in {{target_language}}.
- Stay strictly grounded in the source material.
- Preserve canonical names and facts exactly.
- Never invent new named characters.
- Never turn unnamed groups into named speakers.
- Never create or use speaker labels from this forbidden list: {{forbidden_speaker_labels}}.
- Never turn a historical or background mention into an active speaking character.
- If the source contains explicit spoken dialogue, preserve those speakers and those speaking moments.
- If the source does not contain explicit spoken dialogue, do not invent any.
- If the source does not clearly justify dialogue, prefer action prose.
- Do not use markdown, bold text, bullet lists, or closing markers such as "END OF SCREENPLAY".`,
    variables: ['episode_title', 'target_language', 'source_summary', 'forbidden_speaker_labels'],
  },
  {
    key: 'agent.extractor',
    name: 'Agent - Extracao de personagens e cenarios',
    category: 'agent',
    description: 'Prompt base do agent extractor.',
    content: `You are a conservative production metadata extractor.

Current assignment:
- Output language: {{output_language}}
- Extraction focus: {{focus}}
- Script excerpt: {{script_excerpt}}
- Forbidden character labels: {{forbidden_character_labels}}

Workflow:
1. Call read_script_for_extraction.
2. Call read_existing_characters.
3. Call read_existing_scenes.
4. Call read_existing_props.
5. Extract only source-supported human characters.
6. Extract scenes.
7. Extract props and non-human entities.
8. Save characters, scenes, and props with the appropriate save tools.

Rules:
- Only extract individually named human characters who are clearly active in the episode.
- A named person mentioned only as historical or background context is not an active character.
- Never create names from generic roles.
- Never output placeholders or generic character labels from this forbidden list: {{forbidden_character_labels}}.
- Keep unnamed roles inside scene/action description only.
- Preserve only the most specific canonical name for the same person.
- Use screenplay scene headers as the primary source of truth for reusable scenes.
- Do not invent micro-locations unless the screenplay clearly establishes them as separate settings.
- Ships, vehicles, artifacts, weapons, animals, and buildings are props, never characters.
- Text fields must be written in {{output_language}}.
- If uncertain, omit instead of hallucinating.`,
    variables: ['output_language', 'focus', 'script_excerpt', 'forbidden_character_labels'],
  },
  {
    key: 'agent.storyboard_breaker',
    name: 'Agent - Quebra de storyboard',
    category: 'agent',
    description: 'Prompt base do agent de storyboard.',
    content: `You are a disciplined storyboard artist for short-form drama production.

Current assignment:
- Editorial language: {{editorial_language}}
- Prompt language: {{prompt_language}}
- Scene header: {{scene_header}}
- Story beat: {{beat}}
- Target duration seconds: {{target_duration_seconds}}

Workflow:
1. Call read_storyboard_context.
2. Break the screenplay into 10 to 15 second shots.
3. Generate the shot records.
4. Call save_storyboards.

Rules:
- Editorial fields must be written in {{editorial_language}}.
- image_prompt, video_prompt, bgm_prompt, and sound_effect must be written only in {{prompt_language}}.
- Never write production prompts in {{editorial_language}}.
- Visual prompts must stay purely visual.
- Never place dialogue, subtitles, narration, voice-over, lip-sync instructions, or on-screen text inside visual prompts.
- Spoken lines belong only in the dialogue field.
- If the screenplay contains explicit Character Name: dialogue, assign each spoken line to exactly one shot.
- If the screenplay does not contain explicit Character Name: dialogue, leave the dialogue field empty.
- Do not paraphrase narration into fake dialogue.
- Do not attach a character to a shot unless that character is visibly or verbally present in that shot.
- A spoken line may appear in only one shot.
- Keep shot locations anchored to the screenplay scene headers and avoid inventing extra micro-scenes.
- Preserve strict visual continuity between adjacent shots.`,
    variables: ['editorial_language', 'prompt_language', 'scene_header', 'beat', 'target_duration_seconds'],
  },
  {
    key: 'agent.voice_assigner',
    name: 'Agent - Distribuicao de vozes',
    category: 'agent',
    description: 'Prompt base do agent de vozes.',
    content: `You are a dubbing director choosing the best available voice for each character.

Current assignment:
- Explanation language: {{explanation_language}}
- Character name: {{character_name}}
- Character profile: {{character_profile}}
- Voice direction: {{voice_direction}}

Workflow:
1. Call list_voices.
2. Call get_characters.
3. Assign the best matching voice.
4. Call assign_voice for each character and explain the choice briefly.

Rules:
- Every character must receive one voice.
- Explanations must be written in {{explanation_language}}.
- Be conservative with gender and age matching.
- Prefer consistency over novelty.`,
    variables: ['explanation_language', 'character_name', 'character_profile', 'voice_direction'],
  },
  {
    key: 'agent.grid_prompt_generator',
    name: 'Agent - Grid prompt generator',
    category: 'agent',
    description: 'Prompt base do gerador de prompt de grade.',
    content: `You are a professional prompt engineer for visual generation.

Modes:
- character
- scene
- grid

Current assignment:
- Active mode: {{mode}}
- Subject: {{subject}}
- Visual goal: {{visual_goal}}
- Explanation language: {{explanation_language}}
- Output language: {{output_language}}

Rules:
- Explain the process in {{explanation_language}}.
- Produce the final visual prompt in {{output_language}}.
- Keep prompts concise, visual, and production-oriented.`,
    variables: ['mode', 'subject', 'visual_goal', 'explanation_language', 'output_language'],
  },
  {
    key: 'image.character.default',
    name: 'Visual - Personagem',
    category: 'visual',
    description: 'Template base de prompt para imagem de personagem.',
    content: 'cinematic character design sheet, {{name}}, {{appearance}}, {{personality}}, full body, front view, consistent facial features, consistent wardrobe, clean studio background, high detail, soft cinematic lighting, no text, no subtitles, no watermark',
    variables: ['name', 'appearance', 'personality'],
  },
  {
    key: 'image.scene.default',
    name: 'Visual - Cenario',
    category: 'visual',
    description: 'Template base de prompt para imagem de cenario.',
    content: 'cinematic environment concept art, {{location}}, {{time}}, {{scene_summary}}, consistent worldbuilding, high detail, atmospheric lighting, no text, no watermark',
    variables: ['location', 'time', 'scene_summary'],
  },
  {
    key: 'video.frame.default',
    name: 'Visual - Frame de tomada',
    category: 'visual',
    description: 'Template base de prompt para frame.',
    content: 'cinematic drama still, {{setting}}, camera: {{camera}}, {{story_beat}}, {{character_continuity}}, preserve exact character identity across the episode, preserve exact wardrobe continuity, natural anatomy, high detail, no dialogue text, no subtitles, no speech bubbles, no watermark',
    variables: ['setting', 'camera', 'story_beat', 'character_continuity'],
  },
  {
    key: 'video.storyboard.default',
    name: 'Visual - Video de tomada',
    category: 'visual',
    description: 'Template base de prompt para video.',
    content: 'cinematic drama video, {{setting}}, camera: {{camera}}, {{character_continuity}}, story beat: {{story_beat}}, timeline: {{timeline}}, duration target: {{duration}} seconds, preserve exact character identity across the episode, preserve exact wardrobe continuity, natural motion, no spoken dialogue in the visual prompt, no subtitles, no captions, no on-screen text, no speech bubbles, no watermark',
    variables: ['setting', 'camera', 'character_continuity', 'story_beat', 'timeline', 'duration'],
  },
  {
    key: 'discovery.idea_synthesizer',
    name: 'Discovery - Sintese de ideias',
    category: 'discovery',
    description: 'Template de sintese de ideias para discovery.',
    content: 'Turn the context below into 3 microdrama concepts. Use genre {{genre}}, tone {{tone}}, and language {{language}}. Context: {{context}}',
    variables: ['genre', 'tone', 'language', 'context'],
  },
]

function stringify(value: unknown) {
  if (!value) return null
  return JSON.stringify(value)
}

export function listPromptTemplateSeeds() {
  return PROMPT_TEMPLATE_SEEDS
}

export function renderPromptContent(content: string, variables: Record<string, unknown>) {
  return content.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => String(variables[key] ?? ''))
    .replace(/\s+/g, ' ')
    .trim()
}

export function estimatePromptMetrics(content: string) {
  const chars = content.length
  const approxTokens = Math.ceil(chars / 4)
  return { chars, approxTokens }
}

export function ensurePromptTemplatesSeeded() {
  const ts = now()
  for (const seed of PROMPT_TEMPLATE_SEEDS) {
    const [existing] = db.select().from(schema.promptTemplates)
      .where(eq(schema.promptTemplates.key, seed.key))
      .all()
    if (existing) {
      if (existing.isDefault) {
        db.update(schema.promptTemplates).set({
          name: seed.name,
          category: seed.category,
          description: seed.description,
          content: seed.content,
          variables: JSON.stringify(seed.variables),
          updatedAt: ts,
        }).where(eq(schema.promptTemplates.id, existing.id)).run()
      }
      continue
    }

    const result = db.insert(schema.promptTemplates).values({
      key: seed.key,
      name: seed.name,
      category: seed.category,
      description: seed.description,
      content: seed.content,
      variables: JSON.stringify(seed.variables),
      version: 1,
      isDefault: true,
      createdAt: ts,
      updatedAt: ts,
    }).run()

    db.insert(schema.promptHistory).values({
      promptTemplateId: Number(result.lastInsertRowid),
      templateKey: seed.key,
      version: 1,
      action: 'seed',
      content: seed.content,
      variables: JSON.stringify(seed.variables),
      metadata: JSON.stringify({ source: 'seed' }),
      createdAt: ts,
    }).run()
  }
}

export function listPromptTemplates() {
  ensurePromptTemplatesSeeded()
  return db.select().from(schema.promptTemplates)
    .where(isNull(schema.promptTemplates.deletedAt))
    .all()
}

export function getPromptTemplate(key: string, options: { withDeleted?: boolean } = {}) {
  ensurePromptTemplatesSeeded()
  const conditions = [eq(schema.promptTemplates.key, key)]
  if (!options.withDeleted) conditions.push(isNull(schema.promptTemplates.deletedAt))
  const [row] = db.select().from(schema.promptTemplates)
    .where(and(...conditions))
    .all()
  return row || null
}

export function getPromptTemplateContent(key: string, fallback = '') {
  const template = getPromptTemplate(key)
  return template?.content || fallback
}

export function updatePromptTemplate(input: {
  key: string
  name?: string
  description?: string
  content: string
  variables?: string[]
}) {
  ensurePromptTemplatesSeeded()
  const existing = getPromptTemplate(input.key)
  const ts = now()

  if (!existing) {
    const inserted = db.insert(schema.promptTemplates).values({
      key: input.key,
      name: input.name || input.key,
      category: input.key.split('.')[0] || 'custom',
      description: input.description || '',
      content: input.content,
      variables: JSON.stringify(input.variables || []),
      version: 1,
      isDefault: false,
      createdAt: ts,
      updatedAt: ts,
    }).run()
    const id = Number(inserted.lastInsertRowid)
    db.insert(schema.promptHistory).values({
      promptTemplateId: id,
      templateKey: input.key,
      version: 1,
      action: 'create',
      content: input.content,
      variables: JSON.stringify(input.variables || []),
      metadata: JSON.stringify({ source: 'user' }),
      createdAt: ts,
    }).run()
    return getPromptTemplate(input.key)
  }

  const nextVersion = Number(existing.version || 1) + 1
  db.update(schema.promptTemplates).set({
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    content: input.content,
    variables: JSON.stringify(input.variables || parsePromptVariables(existing.variables)),
    version: nextVersion,
    isDefault: false,
    updatedAt: ts,
  }).where(eq(schema.promptTemplates.id, existing.id)).run()

  db.insert(schema.promptHistory).values({
    promptTemplateId: existing.id,
    templateKey: input.key,
    version: nextVersion,
    action: 'update',
    content: input.content,
    variables: JSON.stringify(input.variables || parsePromptVariables(existing.variables)),
    metadata: JSON.stringify({ source: 'user' }),
    createdAt: ts,
  }).run()
  return getPromptTemplate(input.key)
}

export function resetPromptTemplate(key: string) {
  ensurePromptTemplatesSeeded()
  const existing = getPromptTemplate(key)
  if (!existing) return null
  const seed = PROMPT_TEMPLATE_SEEDS.find(item => item.key === key)
  if (!seed) return existing
  const nextVersion = Number(existing.version || 1) + 1
  const ts = now()
  db.update(schema.promptTemplates).set({
    name: seed.name,
    category: seed.category,
    description: seed.description,
    content: seed.content,
    variables: JSON.stringify(seed.variables),
    version: nextVersion,
    isDefault: true,
    updatedAt: ts,
  }).where(eq(schema.promptTemplates.id, existing.id)).run()

  db.insert(schema.promptHistory).values({
    promptTemplateId: existing.id,
    templateKey: key,
    version: nextVersion,
    action: 'reset',
    content: seed.content,
    variables: JSON.stringify(seed.variables),
    metadata: JSON.stringify({ source: 'seed' }),
    createdAt: ts,
  }).run()
  return getPromptTemplate(key)
}

export function getPromptHistory(key: string) {
  ensurePromptTemplatesSeeded()
  return db.select().from(schema.promptHistory)
    .where(eq(schema.promptHistory.templateKey, key))
    .orderBy(desc(schema.promptHistory.version))
    .all()
}

export function restorePromptTemplate(key: string, historyId: number) {
  const template = getPromptTemplate(key)
  if (!template) return null
  const [entry] = db.select().from(schema.promptHistory)
    .where(eq(schema.promptHistory.id, historyId))
    .all()
  if (!entry || entry.templateKey !== key) return null

  const nextVersion = Number(template.version || 1) + 1
  const ts = now()
  db.update(schema.promptTemplates).set({
    content: entry.content,
    variables: entry.variables,
    version: nextVersion,
    isDefault: false,
    updatedAt: ts,
  }).where(eq(schema.promptTemplates.id, template.id)).run()

  db.insert(schema.promptHistory).values({
    promptTemplateId: template.id,
    templateKey: key,
    version: nextVersion,
    action: 'restore',
    content: entry.content,
    variables: entry.variables,
    metadata: JSON.stringify({ sourceHistoryId: historyId }),
    createdAt: ts,
  }).run()

  return getPromptTemplate(key)
}

export function parsePromptVariables(raw: string | null | undefined) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : []
  } catch {
    return []
  }
}
