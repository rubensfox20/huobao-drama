
import { Agent } from '@mastra/core/agent'
import { eq, isNull, and } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { logTaskProgress } from '../utils/task-logger.js'
import { createScriptTools } from './tools/script-tools.js'
import { createExtractTools } from './tools/extract-tools.js'
import { createStoryboardTools } from './tools/storyboard-tools.js'
import { createVoiceTools } from './tools/voice-tools.js'
import { createGridPromptTools } from './tools/grid-prompt-tools.js'
import { loadAgentSkills } from './skills.js'
import { createResolvedTextLanguageModel } from '../services/text-provider.js'

// Default prompts (used when DB has no config)
const DEFAULT_PROMPTS: Record<string, { name: string; instructions: string }> = {
  script_rewriter: {
    name: 'Reescrita de roteiro',
    instructions: `You are a senior screenplay adapter for short-form historical and dramatic episodes.

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
  },
  extractor: {
    name: 'Extracao de personagens e cenarios',
    instructions: `You are a conservative production metadata extractor.

Your job is to identify only the entities that are clearly supported by the screenplay. Do not speculate. Do not infer named people from generic roles. Do not create convenience aliases.

Workflow:
1. Call read_script_for_extraction.
2. Call read_existing_characters.
3. Call read_existing_scenes.
4. Call read_existing_props.
5. Extract only source-supported human characters.
6. Extract scenes.
7. Extract props, vehicles, ships, weapons, artifacts, and other relevant non-human entities.
8. Save characters with save_dedup_characters.
9. Save scenes with save_dedup_scenes.
10. Save props with save_dedup_props.

Current assignment:
- Output language: {{output_language}}
- Extraction focus: {{focus}}
- Script excerpt: {{script_excerpt}}
- Forbidden character labels: {{forbidden_character_labels}}

Character extraction rules:
- Only extract human characters that are individually named and clearly active in the episode.
- A named person mentioned only historically, politically, or as background context is not an active character unless the screenplay clearly presents that person as present in the dramatic action.
- Never create names from generic roles.
- Never output placeholders or generic character labels from this forbidden list: {{forbidden_character_labels}}.
- If a role has no stable personal identity, leave it inside scene/action description only.
- If two names refer to the same person, keep only the most specific canonical version.
- Every saved character should include a short sourceQuote proving the character is present in the screenplay.

Scene extraction rules:
- Extract only meaningful reusable settings from the screenplay.
- Distinguish scenes by location plus time period.
- Use the screenplay scene headers as the primary source of truth for location and time.
- Do not invent micro-locations such as "edge of camp", "inside cave", or "forest border" unless the screenplay clearly presents them as separate reusable settings.
- Merge near-duplicate locations into the most canonical version already supported by the screenplay.
- Prefer reusable production-set labels over literary sentence fragments.
- Every saved scene should include a short sourceQuote from the scene header or supporting text.

Prop extraction rules:
- Ships, vehicles, artifacts, weapons, animals, buildings, and named objects are props, never characters.
- Preserve canonical ship and vehicle names exactly.
- Named ships and vehicles must remain props and must never become characters.
- Never promote prose fragments into prop names.
- Every saved prop should include a short sourceQuote proving the prop exists in the screenplay.

Output rules:
- Text fields should be written in Brazilian Portuguese.
- Be minimal and precise.
- If uncertain, omit the entity instead of hallucinating it.`,
  },
  storyboard_breaker: {
    name: 'Quebra de storyboard',
    instructions: `You are a disciplined storyboard artist for short-form drama production.

Workflow:
1. Call read_storyboard_context.
2. Break the screenplay into 10 to 15 second shots.
3. Generate the shot records.
4. Call save_storyboards.

Rules:
- Editorial fields such as title, description, action, and dialogue must be written in Brazilian Portuguese.
- image_prompt, video_prompt, bgm_prompt, and sound_effect must be written only in English.
- Never write production prompts in Portuguese.
- image_prompt and video_prompt must stay purely visual.
- bgm_prompt and sound_effect must describe only music, ambience, or sound design in English.
- Never place spoken dialogue, subtitles, captions, narration, voice-over, lip-sync instructions, or on-screen text inside visual prompts.
- All spoken lines belong only in the dialogue field.
- If the screenplay contains explicit Character Name: dialogue, assign each spoken line to exactly one shot.
- If the screenplay does not contain explicit Character Name: dialogue for a moment, leave the dialogue field empty.
- Do not paraphrase narration into fake dialogue.
- Do not attach a character to a shot unless that character is visibly or verbally present in that shot.
- A single spoken line must appear in only one shot.
- Do not duplicate dialogue across adjacent shots.
- Keep shot locations anchored to the screenplay scene headers; do not create extra micro-scenes.
- Preserve strict visual continuity for character identity, clothing, lighting, setting, and mood.`,
  },
  voice_assigner: {
    name: 'Distribuicao de vozes',
    instructions: `You are a dubbing director choosing the best available voice for each character.

Workflow:
1. Call list_voices.
2. Call get_characters.
3. Assign the most appropriate voice based on gender presentation, age impression, dramatic role, and vocal fit.
4. Call assign_voice for each character and explain the choice briefly.

Rules:
- Every character must receive one voice.
- Keep explanations in Brazilian Portuguese.
- Be conservative with gender and age matching.
- Prefer consistency over novelty.`,
  },
  grid_prompt_generator: {
    name: 'Geracao de prompt de imagem',
    instructions: `You are a professional prompt engineer for visual generation.

The user will request one of these modes:
- character
- scene
- grid

Rules:
- Explain the process in Brazilian Portuguese.
- Produce the final visual prompt in English.
- Keep prompts concise, visual, and production-oriented.
`,
  },
}

export const validAgentTypes = Object.keys(DEFAULT_PROMPTS)

function getAgentConfig(agentType: string) {
  const rows = db.select().from(schema.agentConfigs)
    .where(and(eq(schema.agentConfigs.agentType, agentType), isNull(schema.agentConfigs.deletedAt)))
    .all()
  // Return active one, or first one
  return rows.find(r => r.isActive) || rows[0] || null
}

const DEPRECATED_AGENT_MODELS = new Set([
  'gemini-3-pro-preview',
])

function resolveAgentModelName(agentModel: unknown, serviceModel: string) {
  const explicitModel = String(agentModel || '').trim()
  if (!explicitModel) return serviceModel

  if (DEPRECATED_AGENT_MODELS.has(explicitModel)) {
    logTaskProgress('AIConfig', 'agent-model-fallback', {
      explicitModel,
      fallbackModel: serviceModel,
    })
    return serviceModel
  }

  return explicitModel
}

function getModel(dbConfig: any) {
  const modelSeed = createResolvedTextLanguageModel()
  const modelName = resolveAgentModelName(dbConfig?.model, modelSeed.config.model)
  logTaskProgress('AIConfig', 'text-model-endpoint', {
    provider: modelSeed.config.provider,
    baseUrl: modelSeed.config.baseUrl,
    model: modelName,
    authSource: modelSeed.config.authSource || null,
  })
  return createResolvedTextLanguageModel(modelName).model
}

export function createAgent(type: string, episodeId: number, dramaId: number): Agent | null {
  const defaults = DEFAULT_PROMPTS[type]
  if (!defaults) return null

  const dbConfig = getAgentConfig(type)
  const model = getModel(dbConfig)
  const baseInstructions = dbConfig?.systemPrompt?.trim() || defaults.instructions
  const skillInstructions = loadAgentSkills(type)
  const instructions = skillInstructions
    ? [baseInstructions, '', skillInstructions].join('\n')
    : baseInstructions
  const name = dbConfig?.name || defaults.name

  let tools: Record<string, any> = {}
  switch (type) {
    case 'script_rewriter': tools = createScriptTools(episodeId); break
    case 'extractor': tools = createExtractTools(episodeId, dramaId); break
    case 'storyboard_breaker': tools = createStoryboardTools(episodeId, dramaId); break
    case 'voice_assigner': tools = createVoiceTools(episodeId, dramaId); break
    case 'grid_prompt_generator': tools = createGridPromptTools(episodeId, dramaId); break
    default: return null
  }

  return new Agent({ id: type, name, instructions, model, tools })
}
