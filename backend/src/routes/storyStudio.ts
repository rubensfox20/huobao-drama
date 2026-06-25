import { Hono } from 'hono'
import { generateTextCompletion } from '../services/text-provider.js'
import { badRequest, success } from '../utils/response.js'
import { parseJsonBody, z } from '../utils/validation.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'
import {
  buildCinematicPlanFallback,
  buildDesignSheetPrompt,
  buildImprovementSuggestions,
  buildModelAdapters,
  buildNegativePrompt,
  buildStoryboardPackage,
  cinematicSkillStatus,
  loadAiVideoPromptWriterSkill,
  validateCinematicPrompt,
} from '../services/cinematic-production-engine.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

const scriptContextSchema = z.object({
  idea: z.string().trim().min(1),
  title: z.string().optional(),
  episodes: z.coerce.number().int().positive().max(999),
  ratio: z.string().optional(),
  style_label: z.string().optional(),
  story_type: z.string().optional(),
  audience: z.string().optional(),
  synopsis: z.string().optional(),
  hook: z.string().optional(),
  short_synopsis: z.string().optional(),
  character_bio: z.string().optional(),
})

const summaryRequestSchema = z.object({
  idea: z.string().trim().min(1).max(100_000),
  episodes: z.coerce.number().int().positive().max(999),
  ratio: z.string().trim().min(1),
  style: z.string().trim().min(1),
  language: z.string().trim().optional().default('pt-BR'),
})

const outlineRequestSchema = z.object({
  script: scriptContextSchema,
})

const scriptRequestSchema = z.object({
  script: scriptContextSchema,
  episodes: z.array(z.object({
    episode_number: z.coerce.number().int().positive(),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
  })).min(1).max(50),
})

const productionAssetsRequestSchema = z.object({
  script: scriptContextSchema,
  episodes: z.array(z.object({
    episode_number: z.coerce.number().int().positive(),
    title: z.string().trim().min(1),
    summary: z.string().trim().optional(),
    script: z.string().trim().min(1),
  })).min(1).max(999),
})

const optimizeVisualPromptRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  target_type: z.string().trim().optional().default('asset'),
  asset: z.object({}).catchall(z.any()).optional().default({}),
  ratio: z.string().trim().optional().default('9:16'),
  style_label: z.string().trim().optional().default('cinematográfico'),
})

const cinematicBriefSchema = z.object({
  idea: z.string().trim().min(1).max(100_000),
  title: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  audience: z.string().trim().optional(),
  script_language: z.string().trim().optional().default('pt-BR'),
  prompt_language: z.string().trim().optional().default('English'),
  seasons: z.coerce.number().int().positive().max(20).optional().default(1),
  episodes_per_season: z.coerce.number().int().positive().max(999).optional().default(6),
  episode_duration_seconds: z.coerce.number().int().positive().max(3600).optional().default(180),
  ratio: z.string().trim().optional().default('16:9'),
  format_preset: z.string().trim().optional().default('cinematic wide'),
  director_mode: z.string().trim().optional().default('auto'),
  pace: z.string().trim().optional().default('auto'),
  style_label: z.string().trim().optional().default('cinematic'),
  references: z.array(z.object({
    name: z.string().trim().optional(),
    url: z.string().trim().optional(),
    type: z.string().trim().optional(),
    priority: z.string().trim().optional(),
  })).optional().default([]),
})

const cinematicPlanRequestSchema = cinematicBriefSchema

const designSheetRequestSchema = z.object({
  brief: cinematicBriefSchema,
  plan: z.any().optional(),
})

const storyboardPackageRequestSchema = z.object({
  brief: cinematicBriefSchema,
  plan: z.any().optional(),
  part_count: z.coerce.number().int().positive().max(12).optional(),
  panels_per_part: z.coerce.number().int().positive().max(24).optional(),
})

const promptValidateRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(50_000),
  negative_prompt: z.string().trim().optional(),
  target_model: z.string().trim().optional(),
})

const improveProjectRequestSchema = z.object({
  plan: z.any().optional(),
  brief: cinematicBriefSchema.optional(),
})

const cinemaChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  plan: z.any().optional(),
  brief: cinematicBriefSchema.optional(),
})

const exportPackageRequestSchema = z.object({
  brief: cinematicBriefSchema,
  plan: z.any().optional(),
  storyboard_package: z.any().optional(),
})

const optimizeVisualPromptResultSchema = z.object({
  prompt: z.string().trim().min(1),
})

const summaryResultSchema = z.object({
  title: z.string().trim().min(1),
  story_type: z.string().trim().min(1),
  audience: z.string().trim().min(1),
  synopsis: z.string().trim().min(1),
  hook: z.string().trim().min(1),
  short_synopsis: z.string().trim().min(1),
  character_bio: z.string().trim().min(1),
})

const outlinesResultSchema = z.object({
  episodes: z.array(z.object({
    episode_number: z.coerce.number().int().positive(),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
  })).min(1),
})

const scriptsResultSchema = z.object({
  episodes: z.array(z.object({
    episode_number: z.coerce.number().int().positive(),
    script: z.string().trim().min(1),
  })).min(1),
})

const productionAssetsResultSchema = z.object({
  roles: z.array(z.object({
    name: z.string().trim().min(1),
    type: z.string().trim().optional().default('Role'),
    description: z.string().trim().optional().default(''),
    main: z.boolean().optional().default(false),
  })).default([]),
  scenes: z.array(z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(''),
  })).default([]),
  objects: z.array(z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(''),
  })).default([]),
  media: z.array(z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(''),
  })).default([]),
})

const cinematicAiPatchSchema = z.object({
  season_arc: z.any().optional(),
  visual_bible: z.any().optional(),
  continuity_memory: z.any().optional(),
  recommendations: z.any().optional(),
  production_map: z.any().optional(),
  generation_queue: z.any().optional(),
}).passthrough()

function parseGeneratedJson(text: string) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('A IA não retornou JSON válido')
  return JSON.parse(clean.slice(start, end + 1))
}

function scriptContext(script: z.infer<typeof scriptContextSchema>) {
  return JSON.stringify(script, null, 2)
}

function mergeCinematicPlan(base: any, patch: any, aiWarning?: string) {
  const merged = {
    ...base,
    ...patch,
    engine: {
      ...base.engine,
      ...(patch?.engine || {}),
      ai_warning: aiWarning || null,
    },
    project: {
      ...base.project,
      ...(patch?.project || {}),
    },
    visual_bible: {
      ...base.visual_bible,
      ...(patch?.visual_bible || {}),
    },
    continuity_memory: {
      ...base.continuity_memory,
      ...(patch?.continuity_memory || {}),
    },
    recommendations: {
      ...base.recommendations,
      ...(patch?.recommendations || {}),
      selected: {
        ...base.recommendations?.selected,
        ...(patch?.recommendations?.selected || {}),
      },
      estimate: {
        ...base.recommendations?.estimate,
        ...(patch?.recommendations?.estimate || {}),
      },
    },
    prompt_system: {
      ...base.prompt_system,
      ...(patch?.prompt_system || {}),
    },
  }
  return merged
}

function exportMarkdown(brief: z.infer<typeof cinematicBriefSchema>, plan: any, storyboardPackage: any) {
  const parts = storyboardPackage?.parts || []
  return [
    `# ${plan?.project?.title || brief.title || 'Cinematic Project'}`,
    '',
    `**Ideia:** ${brief.idea}`,
    `**Genero:** ${plan?.project?.genre || brief.genre || ''}`,
    `**Formato:** ${plan?.project?.ratio || brief.ratio || ''}`,
    `**Director Mode:** ${plan?.project?.director_mode || brief.director_mode || ''}`,
    '',
    '## Arco de Temporada',
    plan?.season_arc?.main_arc || '',
    '',
    '## Biblia Visual',
    `Logline: ${plan?.visual_bible?.logline || ''}`,
    '',
    '## Negative Prompt',
    plan?.prompt_system?.negative_prompt || buildNegativePrompt(),
    '',
    '## Storyboard',
    ...parts.flatMap((part: any) => [
      '',
      `### Parte ${part.part_number}: ${part.title}`,
      part.summary || '',
      '',
      ...(part.panels || []).map((panel: any) => `- ${panel.timecode?.label || ''} ${panel.caption || ''}: ${panel.image_prompt || ''}`),
    ]),
  ].join('\n')
}

async function generateValidatedJson<T>(
  params: Parameters<typeof generateTextCompletion>[0],
  schema: z.ZodType<T>,
  retryInstruction: string,
) {
  let lastError: unknown = null
  let lastText = ''

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await generateTextCompletion({
        ...params,
        operation: attempt === 0 ? params.operation : `${params.operation}-retry`,
        temperature: attempt === 0 ? params.temperature : Math.min(params.temperature ?? 0.4, 0.25),
        prompt: attempt === 0
          ? params.prompt
          : [
            params.prompt,
            '',
            'A resposta anterior não pôde ser usada.',
            `Erro: ${lastError instanceof Error ? lastError.message : String(lastError || 'JSON inválido')}`,
            lastText ? `Resposta anterior:\n${lastText.slice(0, 4000)}` : '',
            '',
            retryInstruction,
            'Retorne somente um objeto JSON válido. Não use markdown, comentários, texto antes ou texto depois.',
          ].filter(Boolean).join('\n'),
      })
      lastText = response.text
      return schema.parse(parseGeneratedJson(response.text))
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('A IA não retornou JSON válido')
}

app.get('/cinematic-engine', async (c) => success(c, {
  skill: cinematicSkillStatus(),
  negative_prompt: buildNegativePrompt(),
  model_adapters: buildModelAdapters('Photorealistic cinematic frame, consistent character, clear framing, no unwanted text.', buildNegativePrompt()),
}))

app.post('/cinematic-plan', async (c) => {
  const parsed = await parseJsonBody(c, cinematicPlanRequestSchema)
  if (!parsed.ok) return parsed.response
  const brief = parsed.data
  const fallback = buildCinematicPlanFallback(brief)
  const skill = loadAiVideoPromptWriterSkill()
  let aiWarning = ''
  let patch: any = {}

  try {
    patch = await generateValidatedJson({
      operation: 'story-studio-cinematic-plan',
      temperature: 0.45,
      jsonOnly: true,
      system: [
        'You are a senior showrunner, production designer and AI video prompt engineer.',
        'Use the ai-video-prompt-writer skill as the main production rule system.',
        'The product must stay clean and user-friendly: recommend defaults, do not create unnecessary choices.',
        'Return only JSON. Keep prompt-ready visual content concrete and production useful.',
        skill ? `SKILL RULES:\n${skill.slice(0, 14_000)}` : 'Skill file is unavailable; follow the two-stage design sheet/storyboard pipeline.',
      ].join('\n\n'),
      prompt: [
        'Create a cinematic production plan patch for this brief.',
        'Preserve these top-level keys when useful: season_arc, visual_bible, continuity_memory, recommendations, production_map, generation_queue.',
        'Recommendations must include preselected parts/panels with reason, alternatives, risk and confidence.',
        'Visual bible must include characters, locations, objects, glossary, color palette, camera style and continuity rules.',
        'Include continuity guidance for photos/books/screens so visible content faces the character and is not upside down, mirrored or reversed.',
        '',
        `BRIEF:\n${JSON.stringify(brief, null, 2)}`,
        '',
        `LOCAL BASELINE:\n${JSON.stringify(fallback, null, 2).slice(0, 12_000)}`,
      ].join('\n'),
    }, cinematicAiPatchSchema, 'Return valid JSON object with season_arc, visual_bible, continuity_memory, recommendations, production_map and generation_queue.')
  } catch (error) {
    aiWarning = error instanceof Error ? error.message : 'AI planner unavailable; local recommendation was used.'
  }

  return success(c, mergeCinematicPlan(fallback, patch, aiWarning))
})

app.post('/design-sheet', async (c) => {
  const parsed = await parseJsonBody(c, designSheetRequestSchema)
  if (!parsed.ok) return parsed.response
  const { brief } = parsed.data
  const plan = parsed.data.plan || buildCinematicPlanFallback(brief)
  const fallbackPrompt = buildDesignSheetPrompt(brief, plan)
  const skill = loadAiVideoPromptWriterSkill()
  let prompt = fallbackPrompt
  let aiWarning = ''

  try {
    const result = await generateValidatedJson({
      operation: 'story-studio-design-sheet',
      temperature: 0.35,
      jsonOnly: true,
      system: [
        'You are an AI image prompt engineer for preproduction design sheets.',
        'Use the ai-video-prompt-writer Stage 1 Design Sheet rules exactly.',
        'Return JSON only: {"prompt":"..."}',
        skill ? `SKILL RULES:\n${skill.slice(0, 10_000)}` : '',
      ].filter(Boolean).join('\n\n'),
      prompt: `BRIEF:\n${JSON.stringify(brief, null, 2)}\n\nPLAN:\n${JSON.stringify(plan, null, 2).slice(0, 12_000)}`,
    }, z.object({ prompt: z.string().trim().min(1) }), 'Return {"prompt":"full design sheet prompt"} only.')
    prompt = result.prompt
  } catch (error) {
    aiWarning = error instanceof Error ? error.message : 'AI design prompt unavailable; local prompt was used.'
  }

  const negativePrompt = plan?.prompt_system?.negative_prompt || buildNegativePrompt()
  return success(c, {
    prompt,
    negative_prompt: negativePrompt,
    validation: validateCinematicPrompt(prompt),
    model_adapters: buildModelAdapters(prompt, negativePrompt),
    ai_warning: aiWarning || null,
  })
})

app.post('/storyboard-package', async (c) => {
  const parsed = await parseJsonBody(c, storyboardPackageRequestSchema)
  if (!parsed.ok) return parsed.response
  const { brief, plan, part_count, panels_per_part } = parsed.data
  return success(c, buildStoryboardPackage(brief, plan, { part_count, panels_per_part }))
})

app.post('/prompt-validate', async (c) => {
  const parsed = await parseJsonBody(c, promptValidateRequestSchema)
  if (!parsed.ok) return parsed.response
  const input = parsed.data
  const negativePrompt = input.negative_prompt || buildNegativePrompt()
  return success(c, {
    validation: validateCinematicPrompt(input.prompt),
    negative_prompt: negativePrompt,
    model_adapters: buildModelAdapters(input.prompt, negativePrompt),
    target_model: input.target_model || 'generic',
  })
})

app.post('/improve-project', async (c) => {
  const parsed = await parseJsonBody(c, improveProjectRequestSchema)
  if (!parsed.ok) return parsed.response
  const plan = parsed.data.plan || (parsed.data.brief ? buildCinematicPlanFallback(parsed.data.brief) : {})
  return success(c, buildImprovementSuggestions(plan))
})

app.post('/cinema-chat', async (c) => {
  const parsed = await parseJsonBody(c, cinemaChatRequestSchema)
  if (!parsed.ok) return parsed.response
  const input = parsed.data
  const allowed = /(roteiro|drama|cinema|cinematic|storyboard|prompt|cena|personagem|episodio|temporada|visual|imagem|video|direcao|continuidade|asset|producao|frame|painel|design sheet|biblia)/i
  if (!allowed.test(input.message)) {
    return success(c, {
      response: 'Posso ajudar apenas com roteiro, drama, cinema, storyboard, prompts, continuidade, imagens, video e producao do projeto.',
      actions: [],
      limited: true,
    })
  }

  let response = 'Analisei dentro do dominio cinematografico. Recomendo revisar a biblia visual, validar continuidade e manter prompts finais em camadas antes de gerar imagens.'
  let aiWarning = ''
  try {
    const generated = await generateTextCompletion({
      operation: 'story-studio-cinema-chat',
      temperature: 0.4,
      system: [
        'You are a limited cinematic studio assistant.',
        'Only answer about screenplay, drama, cinema, storyboard, visual continuity, image/video prompts, production assets and exports.',
        'If the user asks unrelated tasks, refuse briefly and redirect to the production workflow.',
      ].join('\n'),
      prompt: `MESSAGE:\n${input.message}\n\nPLAN:\n${JSON.stringify(input.plan || {}).slice(0, 10_000)}`,
    })
    response = generated.text
  } catch (error) {
    aiWarning = error instanceof Error ? error.message : 'AI chat unavailable; local response was used.'
  }

  return success(c, {
    response,
    actions: ['review_visual_bible', 'validate_prompts', 'refine_selected_panel'],
    limited: true,
    ai_warning: aiWarning || null,
  })
})

app.post('/export-package', async (c) => {
  const parsed = await parseJsonBody(c, exportPackageRequestSchema)
  if (!parsed.ok) return parsed.response
  const { brief } = parsed.data
  const plan = parsed.data.plan || buildCinematicPlanFallback(brief)
  const storyboardPackage = parsed.data.storyboard_package || buildStoryboardPackage(brief, plan)
  const markdown = exportMarkdown(brief, plan, storyboardPackage)
  const json = {
    brief,
    plan,
    storyboard_package: storyboardPackage,
  }
  const pdfHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${plan?.project?.title || 'Huobao Export'}</title></head><body><pre>${markdown.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char))}</pre></body></html>`
  return success(c, {
    markdown,
    json,
    pdf_html: pdfHtml,
  })
})

app.post('/summary', async (c) => {
  const parsed = await parseJsonBody(c, summaryRequestSchema)
  if (!parsed.ok) return parsed.response
  const input = parsed.data

  try {
    const result = await generateValidatedJson({
      operation: 'story-studio-summary',
      temperature: 0.65,
      jsonOnly: true,
      system: [
        'Você é um showrunner e roteirista sênior especializado em séries curtas.',
        'Crie conteúdo original e específico a partir da ideia do usuário.',
        'Escreva em português do Brasil, sem comentários e sem markdown.',
        'Retorne somente JSON com: title, story_type, audience, synopsis, hook, short_synopsis, character_bio.',
        'A sinopse deve ter conflito, protagonista, objetivo, riscos e progressão serial.',
      ].join('\n'),
      prompt: `IDEIA:\n${input.idea}\n\nEPISÓDIOS: ${input.episodes}\nFORMATO: ${input.ratio}\nESTILO: ${input.style}\nIDIOMA: ${input.language}`,
    }, summaryResultSchema, 'Schema obrigatório: {"title":"...","story_type":"...","audience":"...","synopsis":"...","hook":"...","short_synopsis":"...","character_bio":"..."}')
    return success(c, result)
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : 'Falha ao gerar o resumo com IA')
  }
})

app.post('/episode-outlines', async (c) => {
  const parsed = await parseJsonBody(c, outlineRequestSchema)
  if (!parsed.ok) return parsed.response
  const input = parsed.data.script

  try {
    const result = await generateValidatedJson({
      operation: 'story-studio-episode-outlines',
      temperature: 0.7,
      jsonOnly: true,
      system: [
        'Você é um showrunner de séries dramáticas curtas.',
        'Planeje exatamente a quantidade solicitada de episódios, sem repetir estruturas.',
        'Cada resumo deve avançar o conflito e terminar com um gancho concreto.',
        'Escreva em português do Brasil e retorne somente JSON no formato:',
        '{"episodes":[{"episode_number":1,"title":"...","summary":"..."}]}',
      ].join('\n'),
      prompt: `CONTEXTO DO ROTEIRO:\n${scriptContext(input)}\n\nGere exatamente ${input.episodes} resumos de episódios.`,
    }, outlinesResultSchema, `Schema obrigatório: {"episodes":[{"episode_number":1,"title":"...","summary":"..."}]}. Gere exatamente ${input.episodes} itens.`)
    if (result.episodes.length !== input.episodes) {
      throw new Error(`A IA retornou ${result.episodes.length} episódios; eram esperados ${input.episodes}`)
    }
    return success(c, result)
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : 'Falha ao gerar episódios com IA')
  }
})

app.post('/episode-scripts', async (c) => {
  const parsed = await parseJsonBody(c, scriptRequestSchema)
  if (!parsed.ok) return parsed.response
  const input = parsed.data

  try {
    const result = await generateValidatedJson({
      operation: 'story-studio-episode-scripts',
      temperature: 0.65,
      jsonOnly: true,
      system: [
        'Você é um roteirista profissional de séries dramáticas curtas.',
        'Transforme cada resumo solicitado em um roteiro completo, original e filmável com cenas, ações e diálogos.',
        'Use exatamente este estilo dentro do campo script: comece com ## Episódio N: Título; depois crie 3 a 5 blocos ### Cena N-1, ### Cena N-2 etc.',
        'Em cada cena, escreva uma linha de tempo/local como Noite. Exterior. Beco da Cidade, depois Elenco: Nome, Nome.',
        'Use linhas de ação iniciadas por △, diálogos no formato Nome (emoção): fala, mensagens entre colchetes e um [PLANO FINAL: ...] na última cena.',
        'Não use markdown fences. Não resuma. O campo script deve conter o roteiro completo com quebras de linha preservadas.',
        'Mantenha continuidade com o contexto geral e diferencie claramente cada episódio.',
        'Escreva em português do Brasil e retorne somente JSON no formato:',
        '{"episodes":[{"episode_number":1,"script":"..."}]}',
      ].join('\n'),
      prompt: `CONTEXTO GERAL:\n${scriptContext(input.script)}\n\nEPISÓDIOS SOLICITADOS:\n${JSON.stringify(input.episodes, null, 2)}`,
    }, scriptsResultSchema, 'Schema obrigatório: {"episodes":[{"episode_number":1,"script":"..."}]}. Retorne somente os episódios solicitados.')
    const requestedNumbers = input.episodes.map(episode => episode.episode_number)
    const requested = new Set(requestedNumbers)
    if (requestedNumbers.length === 1 && result.episodes.length === 1 && result.episodes[0]?.script) {
      return success(c, {
        episodes: [{
          episode_number: requestedNumbers[0],
          script: result.episodes[0].script,
        }],
      })
    }
    const normalizedEpisodes = result.episodes.filter(episode => requested.has(episode.episode_number))
    const returned = new Set(normalizedEpisodes.map(episode => episode.episode_number))
    const missing = requestedNumbers.filter(episodeNumber => !returned.has(episodeNumber))
    if (missing.length) {
      throw new Error(`A IA não retornou roteiro para o episódio ${missing.join(', ')}`)
    }
    return success(c, { episodes: normalizedEpisodes })
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : 'Falha ao gerar roteiros com IA')
  }
})

app.post('/production-assets', async (c) => {
  const parsed = await parseJsonBody(c, productionAssetsRequestSchema)
  if (!parsed.ok) return parsed.response
  const input = parsed.data

  try {
    const episodeText = input.episodes.map(episode => [
      `Episódio ${episode.episode_number}: ${episode.title}`,
      episode.summary ? `Resumo: ${episode.summary}` : '',
      episode.script,
    ].filter(Boolean).join('\n')).join('\n\n---\n\n')

    const result = await generateValidatedJson({
      operation: 'story-studio-production-assets',
      temperature: 0.35,
      jsonOnly: true,
      system: [
        'Você é um produtor executivo e supervisor de continuidade.',
        'Analise o roteiro completo só para extrair ativos de produção reutilizáveis; não recrie o roteiro e não liste episódios.',
        'roles: apenas personagens nomeados do elenco. Não inclua gêneros, estilos, formatos, títulos de episódios ou grupos genéricos.',
        'Para cada role, o campo description deve ser um prompt visual completo de personagem em português do Brasil, pronto para gerar imagem: retrato de corpo inteiro, visão frontal horizontal, ambos os pés visíveis, idade aproximada, origem/aparência, rosto, olhos, pele, cabelo, expressão, postura, figurino, acessórios e textura dos materiais. Use apenas detalhes sustentados pelo roteiro; quando algo não estiver explícito, descreva de forma coerente sem contradizer o personagem.',
        'scenes: apenas locações/cenários únicos de produção, como Hospital, Beco da Cidade, Apartamento. Não use códigos como 1-1, 1-2, Cena 1-1 ou títulos de episódio.',
        'objects: apenas props/objetos concretos importantes para cena. Não inclua ações, temas, gêneros ou estrutura narrativa.',
        'media: apenas mídia/referências de produção realmente necessárias, se houver. Não inclua ratio, estilo visual, gênero, Anime, Isekai drama, drama ou nomes de formato.',
        'Extraia poucos itens importantes e deduplicados. Se uma categoria não tiver ativos reais, retorne array vazio.',
        'Marque main=true para o protagonista ou papel principal. Escreva em português do Brasil.',
        'Retorne somente JSON no formato: {"roles":[],"scenes":[],"objects":[],"media":[]}.',
      ].join('\n'),
      prompt: `CONTEXTO DO ROTEIRO:\n${scriptContext(input.script)}\n\nROTEIROS COMPLETOS:\n${episodeText}`,
    }, productionAssetsResultSchema, 'Schema obrigatório: {"roles":[{"name":"Elara","type":"Protagonista","description":"Retrato de corpo inteiro com visão frontal horizontal, incluindo ambos os pés...","main":true}],"scenes":[{"name":"Beco da Cidade","description":"locação recorrente"}],"objects":[{"name":"Tablet de Kaito","description":"prop importante"}],"media":[]}. Não retorne códigos 1-1/1-2, títulos de episódio, ratio ou gêneros.')

    return success(c, result)
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : 'Falha ao analisar ativos de produção com IA')
  }
})

app.post('/optimize-visual-prompt', async (c) => {
  const parsed = await parseJsonBody(c, optimizeVisualPromptRequestSchema)
  if (!parsed.ok) return parsed.response
  const input = parsed.data

  try {
    const result = await generateValidatedJson({
      operation: 'story-studio-optimize-visual-prompt',
      temperature: 0.35,
      jsonOnly: true,
      system: [
        'Você é um diretor de arte e prompt engineer para geração de imagens de drama curto.',
        'Melhore o prompt mantendo a intenção do usuário e os nomes mencionados com @ exatamente como estão.',
        'Inclua detalhes visuais úteis para composição, identidade, iluminação, lente, figurino/cenário e continuidade.',
        'Não adicione texto para aparecer na imagem. Não use markdown. Escreva em português do Brasil.',
        'Retorne somente JSON no formato {"prompt":"..."}',
      ].join('\n'),
      prompt: [
        `TIPO DO ALVO: ${input.target_type}`,
        `FORMATO: ${input.ratio}`,
        `ESTILO: ${input.style_label}`,
        `ATIVO: ${JSON.stringify(input.asset, null, 2).slice(0, 4000)}`,
        '',
        `PROMPT ORIGINAL:\n${input.prompt}`,
      ].join('\n'),
    }, optimizeVisualPromptResultSchema, 'Schema obrigatório: {"prompt":"prompt visual melhorado"}. Retorne somente JSON.')
    return success(c, result)
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : 'Falha ao otimizar prompt com IA')
  }
})

export default app
