import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const SKILL_PATH = path.join(PROJECT_ROOT, 'skills', 'ai-video-prompt-writer', 'SKILL.md')

export type CinematicBrief = {
  idea: string
  title?: string
  genre?: string
  audience?: string
  script_language?: string
  prompt_language?: string
  seasons?: number
  episodes_per_season?: number
  episode_duration_seconds?: number
  ratio?: string
  format_preset?: string
  director_mode?: string
  pace?: string
  style_label?: string
  references?: Array<{ name?: string; url?: string; type?: string; priority?: string }>
}

type Recommendation = {
  recommended: number
  reason: string
  alternatives: Array<{ value: number; label: string; tradeoff: string }>
  risk: string
  confidence: number
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

function cleanText(value: unknown, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function titleCase(value: string) {
  return cleanText(value)
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function firstSentence(value: string) {
  const text = cleanText(value)
  const sentence = text.split(/(?<=[.!?])\s+/)[0] || text
  return sentence.slice(0, 220)
}

function normalizeLower(value: unknown) {
  return cleanText(value).toLowerCase()
}

export function stripSkillFrontmatter(content: string) {
  if (!content.startsWith('---')) return content.trim()
  const end = content.indexOf('\n---', 3)
  if (end < 0) return content.trim()
  return content.slice(end + 4).trim()
}

export function loadAiVideoPromptWriterSkill() {
  if (!fs.existsSync(SKILL_PATH)) return ''
  return stripSkillFrontmatter(fs.readFileSync(SKILL_PATH, 'utf-8'))
}

export function cinematicSkillStatus() {
  return {
    skill_id: 'ai-video-prompt-writer',
    path: SKILL_PATH,
    available: fs.existsSync(SKILL_PATH),
    required: true,
  }
}

export function resolveTotalEpisodes(brief: CinematicBrief) {
  const seasons = clamp(Number(brief.seasons || 1), 1, 20)
  const episodesPerSeason = clamp(Number(brief.episodes_per_season || 6), 1, 999)
  return {
    seasons,
    episodes_per_season: episodesPerSeason,
    total_episodes: seasons * episodesPerSeason,
  }
}

function inferComplexity(brief: CinematicBrief) {
  const text = `${brief.idea} ${brief.genre || ''} ${brief.director_mode || ''}`.toLowerCase()
  let score = 0
  if (/(sci|cyber|acao|action|confront|terror|misterio|suspense|thriller|fantasia|guerra)/i.test(text)) score += 2
  if (/(temporada|segredo|investig|revelacao|vinganca|cliffhanger|universo|tecnologia|ia|ai)/i.test(text)) score += 2
  if (String(brief.idea || '').length > 450) score += 1
  if (Number(brief.episode_duration_seconds || 0) >= 300) score += 1
  return clamp(score, 1, 6)
}

function inferPartRecommendation(brief: CinematicBrief): Recommendation {
  const duration = clamp(Number(brief.episode_duration_seconds || 180), 30, 3600)
  const complexity = inferComplexity(brief)
  const pace = normalizeLower(brief.pace)
  const genre = normalizeLower(brief.genre)
  let recommended = Math.ceil(duration / 70) + Math.floor(complexity / 2)
  if (pace.includes('rapido') || genre.includes('acao')) recommended += 1
  if (pace.includes('lento') || genre.includes('romance')) recommended -= 1
  recommended = clamp(recommended, 2, 12)

  return {
    recommended,
    reason: `O roteiro sugere ${recommended} partes porque combina duracao de ${duration}s, genero ${brief.genre || 'dramatico'} e complexidade narrativa ${complexity}/6.`,
    alternatives: [
      { value: clamp(recommended - 1, 2, 12), label: 'Mais direto', tradeoff: 'Menos revisao, mas cenas podem ficar aceleradas.' },
      { value: recommended, label: 'Recomendado', tradeoff: 'Melhor equilibrio entre clareza, ritmo e custo.' },
      { value: clamp(recommended + 1, 2, 12), label: 'Mais cinematico', tradeoff: 'Mais detalhe visual, com mais paineis para revisar.' },
    ],
    risk: recommended <= 3 ? 'Risco de condensar viradas importantes.' : recommended >= 9 ? 'Risco de aumentar custo e revisao.' : 'Baixo risco para um fluxo cinematografico controlado.',
    confidence: clamp(72 + complexity * 4, 70, 94),
  }
}

function inferPanelRecommendation(brief: CinematicBrief): Recommendation & { layout: string; rows: number; cols: number } {
  const duration = clamp(Number(brief.episode_duration_seconds || 180), 30, 3600)
  const complexity = inferComplexity(brief)
  const genre = normalizeLower(brief.genre)
  const mode = normalizeLower(brief.director_mode)
  const partCount = inferPartRecommendation(brief).recommended
  const secondsPerPart = duration / partCount
  let recommended = Math.ceil(secondsPerPart / 8) + complexity
  if (genre.includes('acao') || mode.includes('acao')) recommended += 2
  if (mode.includes('suspense') || genre.includes('suspense')) recommended += 1
  recommended = clamp(recommended, 4, 24)

  const cols = recommended <= 6 ? 3 : recommended <= 10 ? 5 : recommended <= 16 ? 4 : 6
  const rows = Math.ceil(recommended / cols)

  return {
    recommended,
    layout: `${cols}x${rows}`,
    rows,
    cols,
    reason: `Cada parte precisa de cerca de ${recommended} paineis para cobrir acao, emocao, continuidade e prompts finais sem ficar rapido demais.`,
    alternatives: [
      { value: clamp(recommended - 2, 4, 24), label: 'Mais curto', tradeoff: 'Bom para baixo custo, mas perde cobertura visual.' },
      { value: recommended, label: 'Recomendado', tradeoff: 'Pre-selecionado pela IA para este roteiro.' },
      { value: clamp(recommended + 2, 4, 24), label: 'Mais detalhado', tradeoff: 'Melhor para clipe cinematico, com mais revisao.' },
    ],
    risk: recommended < 6 ? 'Pode faltar detalhe para continuidade.' : recommended > 18 ? 'Pode gerar carga alta de prompts.' : 'Boa granularidade para imagem e video.',
    confidence: clamp(70 + complexity * 4, 70, 95),
  }
}

function resolveDirectorMode(brief: CinematicBrief) {
  const mode = cleanText(brief.director_mode || 'auto')
  if (mode !== 'auto') return mode
  const genre = normalizeLower(brief.genre)
  const idea = normalizeLower(brief.idea)
  if (genre.includes('suspense') || idea.includes('segredo')) return 'suspense psicologico'
  if (genre.includes('terror') || idea.includes('assombr')) return 'terror atmosferico'
  if (genre.includes('acao') || idea.includes('persegu')) return 'acao rapida'
  if (genre.includes('romance')) return 'romance emocional'
  if (genre.includes('sci') || idea.includes('ia') || idea.includes('cyber')) return 'sci-fi neon'
  return 'novela dramatica'
}

function resolvePreset(brief: CinematicBrief) {
  const preset = cleanText(brief.format_preset || 'cinematic wide')
  return preset || 'cinematic wide'
}

function buildEpisodeBeats(totalEpisodes: number) {
  return Array.from({ length: totalEpisodes }, (_, index) => {
    const episode = index + 1
    const isFinal = episode === totalEpisodes
    return {
      episode_number: episode,
      title: isFinal ? 'Cliffhanger final' : `Virada ${episode}`,
      beat: isFinal ? 'Entrega uma revelacao forte e abre a proxima temporada.' : 'Avanca o conflito com uma nova descoberta ou decisao visivel.',
      cliffhanger: isFinal ? 'A consequencia principal fica impossivel de ignorar.' : 'Termina com uma pergunta visual clara.',
    }
  })
}

function buildContinuityRules() {
  return [
    'Keep character faces, age, body type, wardrobe, accessories and hair consistent across every panel.',
    'Do not add subtitles, UI labels, watermarks or random text inside final frame images.',
    'When a character reads a book, photo, letter, device or screen, orient the visible content toward that character, not upside down, mirrored or reversed.',
    'Restate mask, helmet or face-covering status in every panel where the character appears.',
    'Preserve palette, lighting logic and location geography between design sheet, storyboard sheet and final prompts.',
  ]
}

export function buildNegativePrompt(context?: { realistic?: boolean; visible_reading_material?: boolean }) {
  const parts = [
    'unwanted text',
    'subtitles',
    'captions outside storyboard sheet',
    'watermark',
    'logo artifacts',
    'deformed hands',
    'extra fingers',
    'different face',
    'inconsistent outfit',
    'inconsistent hairstyle',
    'duplicated character',
    'bad anatomy',
    'low quality',
    'blurry',
  ]

  if (context?.realistic !== false) {
    parts.push('cartoon style', 'anime style when photorealism is requested')
  }

  if (context?.visible_reading_material !== false) {
    parts.push(
      'upside-down book content',
      'upside-down photo',
      'mirrored screen content',
      'reversed page orientation',
      'content facing away from the character reading it',
      'illegible inverted paper',
    )
  }

  return parts.join(', ')
}

export function validateCinematicPrompt(prompt: string) {
  const text = cleanText(prompt)
  const issues: Array<{ severity: 'warning' | 'error'; message: string }> = []
  if (!text) issues.push({ severity: 'error', message: 'Prompt vazio.' })
  if (/(subtitle|caption|text on screen|legenda|texto na imagem)/i.test(text)) {
    issues.push({ severity: 'warning', message: 'Verifique se texto/legenda e intencional. Para frame final, evite texto na imagem.' })
  }
  if (!/(camera|lens|shot|framing|composition|close-up|wide|medium|câmera|plano|enquadramento)/i.test(text)) {
    issues.push({ severity: 'warning', message: 'Inclua enquadramento/camera para reduzir interpretacao do modelo.' })
  }
  if (/\b(book|photo|letter|screen)\b|\b(livro|foto|carta|tela)\b/i.test(text) && !/(oriented|orientation|not upside|not mirrored|orientado|espelhado|cabeca para baixo)/i.test(text)) {
    issues.push({ severity: 'warning', message: 'Conteudo visivel em livro/foto/tela precisa de orientacao correta para o personagem.' })
  }
  return {
    passed: !issues.some(issue => issue.severity === 'error'),
    issues,
  }
}

export function scoreCinematicPanel(input: {
  image_prompt?: string
  video_prompt?: string
  negative_prompt?: string
  prompt_layers?: Record<string, unknown>
  caption?: string
  references?: unknown[]
  duration_seconds?: number
}) {
  const imagePrompt = cleanText(input.image_prompt)
  const videoPrompt = cleanText(input.video_prompt)
  const negativePrompt = cleanText(input.negative_prompt)
  const layers = input.prompt_layers || {}
  const validation = validateCinematicPrompt(imagePrompt)
  const layerKeys = ['character', 'location', 'action', 'camera', 'lighting', 'style', 'restrictions', 'references']
  const presentLayers = layerKeys.filter(key => cleanText((layers as any)[key])).length
  const hasCamera = /(camera|lens|shot|framing|composition|close-up|wide|medium|câmera|plano|enquadramento)/i.test(imagePrompt)
  const hasContinuity = /(consistent|continuity|wardrobe|same face|character lock|visual bible|consistente|continuidade|figurino)/i.test(imagePrompt)
  const hasDrama = /(conflict|reveal|choice|emotion|fear|love|danger|decision|dramatic|conflito|revelacao|decisao|emocao)/i.test(`${imagePrompt} ${input.caption || ''}`)
  const hasVideoAction = /(moves|walks|turns|looks|reveals|runs|approaches|camera|motion|duration|anda|olha|revela|corre|aproxima)/i.test(videoPrompt)
  const hasReferences = Boolean(input.references?.length) || /reference|design sheet|frame reference|visual bible|referencia/i.test(imagePrompt)
  const readingRisk = /\b(book|photo|letter|screen)\b|\b(livro|foto|carta|tela)\b/i.test(imagePrompt)
  const readingProtected = /(not upside|not mirrored|oriented|faces the character|nao invertido|nao espelhado|orientado)/i.test(`${imagePrompt} ${negativePrompt}`)

  const visualClarity = clamp(58 + (hasCamera ? 16 : 0) + Math.min(18, Math.floor(imagePrompt.length / 80)) - validation.issues.length * 6, 0, 100)
  const consistency = clamp(50 + (hasContinuity ? 20 : 0) + Math.min(20, presentLayers * 3) + (hasReferences ? 8 : 0), 0, 100)
  const dramaticStrength = clamp(54 + (hasDrama ? 22 : 0) + Math.min(16, cleanText(input.caption).length / 4), 0, 100)
  const videoUsefulness = clamp(48 + (videoPrompt ? 18 : 0) + (hasVideoAction ? 20 : 0) + (Number(input.duration_seconds || 0) > 0 ? 6 : 0), 0, 100)
  const generationRisk = clamp(
    46
      - Math.floor((visualClarity + consistency) / 8)
      + validation.issues.length * 8
      + (readingRisk && !readingProtected ? 18 : 0)
      + (!negativePrompt ? 12 : 0),
    0,
    100,
  )
  const score = clamp((visualClarity + consistency + dramaticStrength + videoUsefulness + (100 - generationRisk)) / 5, 0, 100)

  return {
    score,
    visual_clarity: visualClarity,
    consistency,
    dramatic_strength: dramaticStrength,
    video_usefulness: videoUsefulness,
    generation_risk: generationRisk,
    validation,
    issues: [
      ...validation.issues,
      ...(!hasReferences ? [{ severity: 'warning' as const, message: 'Nenhuma referência visual explícita foi encontrada no prompt.' }] : []),
      ...(readingRisk && !readingProtected ? [{ severity: 'warning' as const, message: 'Conteúdo em livro/foto/tela precisa declarar orientação correta.' }] : []),
    ],
  }
}

export function buildModelAdapters(prompt: string, negativePrompt: string) {
  const base = cleanText(prompt)
  return [
    { model: 'Midjourney', supports_negative_prompt: false, prompt: `${base} --style raw --v 6`, note: 'Use negative prompt como texto de restricao dentro do prompt.' },
    { model: 'Runway', supports_negative_prompt: true, prompt: base.slice(0, 1200), negative_prompt: negativePrompt, note: 'Prefira prompt visual direto e curto.' },
    { model: 'Kling', supports_negative_prompt: true, prompt: base.slice(0, 1500), negative_prompt: negativePrompt, note: 'Inclua movimento em frase separada para video.' },
    { model: 'Veo', supports_negative_prompt: false, prompt: `${base}. Avoid: ${negativePrompt}.`, note: 'Use linguagem natural com continuidade e acao visivel.' },
    { model: 'Sora', supports_negative_prompt: false, prompt: `${base}. Restrictions: ${negativePrompt}.`, note: 'Descreva cena, camera, tempo e intencao visual.' },
    { model: 'Wan', supports_negative_prompt: true, prompt: base.slice(0, 1400), negative_prompt: negativePrompt, note: 'Bom para prompts estruturados com referencia.' },
    { model: 'Flux', supports_negative_prompt: true, prompt: base.slice(0, 900), negative_prompt: negativePrompt, note: 'Use prompt de imagem concentrado em sujeito, luz e composicao.' },
  ]
}

export function buildPromptVariants(input: {
  prompt: string
  negative_prompt?: string
  modes?: string[]
}) {
  const basePrompt = cleanText(input.prompt)
  const negativePrompt = cleanText(input.negative_prompt, buildNegativePrompt())
  const modeMap: Record<string, { label: string; modifier: string }> = {
    emotional: { label: 'Mais emocional', modifier: 'heightened emotional tension, subtle facial performance, intimate dramatic blocking' },
    action: { label: 'Mais ação', modifier: 'strong physical action, dynamic blocking, sharper movement, higher urgency' },
    cinematic: { label: 'Mais cinematográfico', modifier: 'premium cinematic composition, stronger motivated lighting, filmic depth, controlled contrast' },
    slow: { label: 'Mais lento', modifier: 'slower pacing, held look, quiet pause, readable body language, contemplative camera' },
    intense: { label: 'Mais intenso', modifier: 'more intense stakes, tighter framing, dramatic contrast, clear visual pressure' },
  }
  const modes = (input.modes?.length ? input.modes : Object.keys(modeMap)).filter(mode => modeMap[mode])

  return {
    variants: modes.map(mode => {
      const prompt = `${basePrompt}, ${modeMap[mode].modifier}`
      return {
        mode,
        label: modeMap[mode].label,
        prompt,
        negative_prompt: negativePrompt,
        validation: validateCinematicPrompt(prompt),
        quality: scoreCinematicPanel({ image_prompt: prompt, negative_prompt: negativePrompt }),
        model_adapters: buildModelAdapters(prompt, negativePrompt),
      }
    }),
  }
}

export function refinePanelPrompt(input: {
  panel: any
  instruction?: string
  variant_mode?: string
  target_model?: string
}) {
  const panel = input.panel || {}
  const negativePrompt = cleanText(panel.negative_prompt, buildNegativePrompt())
  const instruction = cleanText(input.instruction)
  const variant = input.variant_mode
    ? buildPromptVariants({ prompt: panel.image_prompt || panel.prompt || '', negative_prompt: negativePrompt, modes: [input.variant_mode] }).variants[0]
    : null
  const imagePrompt = [
    cleanText(variant?.prompt || panel.image_prompt || panel.prompt),
    instruction ? `Refinement instruction: ${instruction}.` : '',
    'Keep exact character identity, wardrobe continuity, approved locations, camera clarity, lighting motivation and visual bible references.',
    'No unwanted text, subtitles, watermark or random UI labels.',
  ].filter(Boolean).join(' ')
  const videoPrompt = [
    cleanText(panel.video_prompt),
    instruction ? `Motion refinement: ${instruction}.` : '',
    'Keep movement natural and readable for the target duration.',
  ].filter(Boolean).join(' ')
  const adapters = buildModelAdapters(imagePrompt, negativePrompt)
  const targetAdapter = input.target_model
    ? adapters.find(adapter => adapter.model.toLowerCase() === input.target_model?.toLowerCase())
    : null

  return {
    panel_number: panel.panel_number,
    image_prompt: imagePrompt,
    video_prompt: videoPrompt,
    negative_prompt: negativePrompt,
    prompt_layers: {
      ...(panel.prompt_layers || {}),
      restrictions: negativePrompt,
      refinement: instruction || variant?.label || 'manual refinement',
    },
    quality: scoreCinematicPanel({
      image_prompt: imagePrompt,
      video_prompt: videoPrompt,
      negative_prompt: negativePrompt,
      prompt_layers: panel.prompt_layers,
      caption: panel.caption,
      duration_seconds: panel.timecode?.end_seconds && panel.timecode?.start_seconds
        ? Number(panel.timecode.end_seconds) - Number(panel.timecode.start_seconds)
        : undefined,
    }),
    model_adapters: targetAdapter ? [targetAdapter] : adapters,
    versions: {
      ...(panel.versions || {}),
      refined: {
        at: new Date().toISOString(),
        instruction: instruction || variant?.label || 'refined',
        image_prompt: imagePrompt,
        video_prompt: videoPrompt,
      },
    },
  }
}

export function buildCinematicPlanFallback(brief: CinematicBrief) {
  const episodes = resolveTotalEpisodes(brief)
  const partRecommendation = inferPartRecommendation(brief)
  const panelRecommendation = inferPanelRecommendation(brief)
  const directorMode = resolveDirectorMode(brief)
  const preset = resolvePreset(brief)
  const title = cleanText(brief.title, titleCase(firstSentence(brief.idea)).slice(0, 48) || 'Novo drama')
  const genre = cleanText(brief.genre, 'drama cinematico')
  const duration = clamp(Number(brief.episode_duration_seconds || 180), 30, 3600)
  const totalPanels = partRecommendation.recommended * panelRecommendation.recommended
  const negativePrompt = buildNegativePrompt({ realistic: true, visible_reading_material: true })
  const samplePrompt = `Photorealistic cinematic frame for ${title}: ${firstSentence(brief.idea)}, ${directorMode}, ${brief.ratio || '16:9'}, consistent characters, expressive lighting, no unwanted text.`

  return {
    engine: {
      ...cinematicSkillStatus(),
      version: '1.0.0',
      recommended_text_model: 'gpt-5.5',
      prompt_language: cleanText(brief.prompt_language, 'English'),
      script_language: cleanText(brief.script_language, 'pt-BR'),
    },
    project: {
      title,
      genre,
      audience: cleanText(brief.audience, 'publico de drama curto'),
      ratio: cleanText(brief.ratio, '16:9'),
      format_preset: preset,
      director_mode: directorMode,
      episode_duration_seconds: duration,
      ...episodes,
    },
    workflow: [
      { key: 'briefing', label: 'Briefing', status: 'reviewed', locked: false },
      { key: 'season_arc', label: 'Arco', status: 'needs_review', locked: false },
      { key: 'visual_bible', label: 'Biblia visual', status: 'locked_until_approved', locked: true },
      { key: 'design_sheet', label: 'Design sheet', status: 'locked_until_bible', locked: true },
      { key: 'script', label: 'Roteiro', status: 'locked_until_sheet', locked: true },
      { key: 'parts', label: 'Partes', status: 'locked_until_script', locked: true },
      { key: 'storyboard', label: 'Storyboard', status: 'locked_until_parts', locked: true },
      { key: 'final_prompts', label: 'Prompts finais', status: 'locked_until_storyboard', locked: true },
      { key: 'export', label: 'Exportacao', status: 'locked_until_review', locked: true },
    ],
    season_arc: {
      main_arc: `Uma temporada sobre ${firstSentence(brief.idea).toLowerCase()}`,
      episode_turns: buildEpisodeBeats(episodes.total_episodes),
      character_evolution: [
        'O protagonista parte de uma necessidade clara e termina obrigado a pagar um preco.',
        'O antagonismo cresce por revelacoes visuais, nao apenas por dialogo.',
      ],
      final_cliffhanger: 'A ultima imagem precisa mudar o sentido da temporada.',
      required_key_scenes: ['abertura com gancho', 'primeira revelacao', 'confronto intermediario', 'cliffhanger final'],
    },
    visual_bible: {
      logline: firstSentence(brief.idea),
      characters: [
        {
          name: 'Protagonista',
          role: 'personagem principal',
          appearance_lock: 'Aparencia, roupa, cabelo, idade e acessorios devem permanecer consistentes.',
          costume_lock: 'Figurino principal definido no design sheet antes do storyboard.',
        },
      ],
      locations: [
        { name: 'Local principal', description: 'Ambiente recorrente com geografia visual clara e paleta consistente.' },
      ],
      objects: [
        { name: 'Objeto-chave', description: 'Prop narrativo recorrente usado para revelar informacao ou conflito.' },
      ],
      glossary: ['regra do mundo', 'termo de tecnologia', 'local recorrente'],
      color_palette: ['deep cobalt', 'electric cyan', 'charcoal', 'pale gray'],
      camera_style: `${directorMode}, photorealistic, cinematic lighting, shot on 35mm film`,
      continuity_rules: buildContinuityRules(),
      references: brief.references || [],
    },
    continuity_memory: {
      season_number: 1,
      events: [],
      knowledge_state: [],
      injuries: [],
      lost_objects: [],
      relationship_changes: [],
      wardrobe_changes: [],
      revealed_secrets: [],
      current_character_state: [],
    },
    recommendations: {
      parts: partRecommendation,
      panels: panelRecommendation,
      selected: {
        part_count: partRecommendation.recommended,
        panels_per_part: panelRecommendation.recommended,
        layout: panelRecommendation.layout,
      },
      estimate: {
        total_parts: partRecommendation.recommended,
        total_panels: totalPanels,
        image_prompts: totalPanels,
        video_prompts: totalPanels,
        expected_images: partRecommendation.recommended + totalPanels,
        review_load: totalPanels <= 36 ? 'leve' : totalPanels <= 72 ? 'media' : 'alta',
      },
    },
    prompt_system: {
      negative_prompt: negativePrompt,
      validators: validateCinematicPrompt(samplePrompt),
      prompt_layers: ['character', 'location', 'action', 'camera', 'lighting', 'style', 'restrictions', 'references'],
      model_adapters: buildModelAdapters(samplePrompt, negativePrompt),
    },
    production_map: [
      { label: 'Roteiro', status: 'pending' },
      { label: 'Biblia visual', status: 'needs_review' },
      { label: 'Assets aprovados', status: 'pending' },
      { label: 'Design sheet', status: 'locked' },
      { label: 'Storyboards', status: 'locked' },
      { label: 'Prompts revisados', status: 'locked' },
      { label: 'Exportado', status: 'locked' },
    ],
    generation_queue: [
      { key: 'design_sheet_prompt', label: 'Design Sheet Prompt', status: 'queued', recoverable: true },
      { key: 'design_sheet_image', label: 'Design Sheet Image', status: 'queued', recoverable: true },
      { key: 'storyboard_parts', label: 'Storyboard Parts', status: 'queued', recoverable: true },
      { key: 'frame_split', label: 'Split Frames', status: 'queued', recoverable: true },
      { key: 'final_prompt_refine', label: 'Final Prompt Refine', status: 'queued', recoverable: true },
    ],
    exports: {
      formats: ['markdown', 'json', 'pdf'],
      copy_scopes: ['panel', 'part', 'episode', 'model'],
    },
  }
}

export function buildDesignSheetPrompt(brief: CinematicBrief, plan: any) {
  const project = plan?.project || buildCinematicPlanFallback(brief).project
  const bible = plan?.visual_bible || buildCinematicPlanFallback(brief).visual_bible
  return [
    `DESIGN SHEET PROMPT - ${project.title}`,
    '',
    `Create a professional preproduction design concept sheet for "${project.title}".`,
    `Story tone: ${bible.logline || firstSentence(brief.idea)}.`,
    '',
    'Layout: left column with title/logo, logline and hero poster; top row with full-body character turnarounds front, 3/4, profile and back; top right with props and technical objects; middle row with key cinematic scenes; bottom row with environments, mood references, color palette swatches and typography references.',
    `Characters: ${(bible.characters || []).map((item: any) => `${item.name || 'Character'} - ${item.appearance_lock || item.description || 'visually consistent character'}`).join('; ') || 'specific consistent characters from the story'}.`,
    `Locations: ${(bible.locations || []).map((item: any) => item.name || item.description).filter(Boolean).join(', ') || 'main recurring environments'}.`,
    `Props: ${(bible.objects || []).map((item: any) => item.name || item.description).filter(Boolean).join(', ') || 'key narrative objects'}.`,
    'All characters, wardrobe, props, lighting and environments must remain visually consistent across all panels.',
    `Visual language: ${project.director_mode}, ${bible.camera_style || 'photorealistic cinematic lighting'}, ${project.ratio}.`,
    'photorealistic, shot on 35mm film, cinematic lighting, slightly desaturated colors, high contrast dramatic lighting, minimalist editorial layout, organized grid composition',
  ].join('\n')
}

export function buildStoryboardPackage(brief: CinematicBrief, plan?: any, overrides?: { part_count?: number; panels_per_part?: number }) {
  const resolvedPlan = plan || buildCinematicPlanFallback(brief)
  const project = resolvedPlan.project
  const partCount = clamp(Number(overrides?.part_count || resolvedPlan.recommendations?.selected?.part_count || 4), 2, 12)
  const panelsPerPart = clamp(Number(overrides?.panels_per_part || resolvedPlan.recommendations?.selected?.panels_per_part || 8), 4, 24)
  const episodeDuration = clamp(Number(project?.episode_duration_seconds || brief.episode_duration_seconds || 180), 30, 3600)
  const partDuration = Math.max(10, Math.round(episodeDuration / partCount))
  const panelDuration = Math.max(3, Math.round(partDuration / panelsPerPart))
  const negativePrompt = resolvedPlan.prompt_system?.negative_prompt || buildNegativePrompt({ realistic: true, visible_reading_material: true })
  const layout = resolvedPlan.recommendations?.selected?.layout || inferPanelRecommendation(brief).layout
  const [colsRaw, rowsRaw] = String(layout).split('x').map(Number)
  const cols = clamp(colsRaw || 4, 2, 8)
  const rows = clamp(rowsRaw || Math.ceil(panelsPerPart / cols), 1, 8)

  const parts = Array.from({ length: partCount }, (_, partIndex) => {
    const partNumber = partIndex + 1
    const partStart = partIndex * partDuration
    const title = partNumber === 1 ? 'Abertura e gancho' : partNumber === partCount ? 'Climax e gancho final' : `Virada narrativa ${partNumber}`
    const panels = Array.from({ length: panelsPerPart }, (_, panelIndex) => {
      const panelNumber = panelIndex + 1
      const globalPanel = partIndex * panelsPerPart + panelNumber
      const startSeconds = partStart + panelIndex * panelDuration
      const endSeconds = Math.min(partStart + partDuration, startSeconds + panelDuration)
      const action = panelNumber === 1
        ? 'establishing visual beat'
        : panelNumber === panelsPerPart
          ? 'strong visual question'
          : 'visible dramatic action'
      const caption = `${String(panelNumber).padStart(2, '0')}. ${action}`
      const imagePrompt = `Photorealistic cinematic still for "${project.title}", part ${partNumber}, panel ${panelNumber}: ${action} from ${firstSentence(brief.idea)}, consistent characters and wardrobe, ${project.director_mode}, ${project.ratio}, expressive lighting, clear framing, no unwanted text. If any book, photo, letter or screen is visible, its content faces the character correctly and is not upside down, mirrored or reversed.`
      const videoPrompt = `The character is seen in a clear dramatic moment inside the established world, with consistent wardrobe and lighting. The action is visible in the frame and lasts naturally for ${Math.max(3, endSeconds - startSeconds)} seconds.`
      const promptLayers = {
        character: 'Use visual bible character locks.',
        location: 'Use approved location geography and palette.',
        action,
        camera: panelNumber % 3 === 0 ? 'close-up or insert' : panelNumber % 2 === 0 ? 'medium shot' : 'wide establishing composition',
        lighting: 'cinematic motivated lighting',
        style: project.director_mode,
        restrictions: negativePrompt,
        references: 'Use approved design sheet and frame references.',
      }
      const quality = scoreCinematicPanel({
        image_prompt: imagePrompt,
        video_prompt: videoPrompt,
        negative_prompt: negativePrompt,
        prompt_layers: promptLayers,
        caption,
        duration_seconds: Math.max(3, endSeconds - startSeconds),
      })
      return {
        panel_number: panelNumber,
        global_panel_number: globalPanel,
        caption,
        location_header: `${String(panelNumber).padStart(2, '0')}. INT./EXT. KEY LOCATION - DAY/NIGHT`,
        timecode: {
          start_seconds: startSeconds,
          end_seconds: endSeconds,
          label: `${String(Math.floor(startSeconds / 60)).padStart(2, '0')}:${String(startSeconds % 60).padStart(2, '0')} - ${String(Math.floor(endSeconds / 60)).padStart(2, '0')}:${String(endSeconds % 60).padStart(2, '0')}`,
        },
        rhythm: panelDuration <= 5 ? 'fast' : panelDuration >= 10 ? 'slow' : 'medium',
        prompt_layers: promptLayers,
        image_prompt: imagePrompt,
        video_prompt: videoPrompt,
        negative_prompt: negativePrompt,
        quality,
        validation: validateCinematicPrompt(imagePrompt),
        model_adapters: buildModelAdapters(imagePrompt, negativePrompt),
        versions: {
          ai_original: 1,
          edited: null,
          refined: null,
        },
      }
    })

    const storyboardPrompt = [
      `STORYBOARD PROMPT - ${project.title} - PART ${partNumber}`,
      'Use the uploaded image(s) as a reference for the characters, wardrobe, lighting, environments, color grading, mood, and overall cinematic style. Keep every character visually consistent across all panels.',
      `World and environment: ${resolvedPlan.visual_bible?.logline || firstSentence(brief.idea)} ${project.director_mode}.`,
      "Every character's costume and appearance must remain exactly identical across all panels. Do not add, remove, or alter any clothing item, accessory, helmet, or equipment between panels unless a wardrobe change is explicitly listed below.",
      `Build a single cinematic ${cols}x${rows} storyboard grid, panels clearly separated by thin borders with the following frames:`,
      ...panels.map(panel => `${panel.location_header} / ${panel.caption}. ${panel.prompt_layers.camera}, ${panel.prompt_layers.action}.`),
      "Below each panel, print the panel number and location header followed by a single short caption of no more than 6 words. Use monospace or typewriter-style font for all captions.",
      'photorealistic, shot on 35mm film, cinematic lighting, realistic drama cinematography',
    ].join('\n')

    return {
      part_number: partNumber,
      title,
      summary: `Parte ${partNumber} cobre ${title.toLowerCase()} com ritmo ${panelDuration <= 5 ? 'rapido' : panelDuration >= 10 ? 'lento' : 'medio'}.`,
      duration_target_seconds: partDuration,
      rhythm: panelDuration <= 5 ? 'fast' : panelDuration >= 10 ? 'slow' : 'medium',
      layout: { rows, cols, panel_count: panelsPerPart },
      recommendation_reason: `A parte usa ${panelsPerPart} paineis para manter legibilidade visual e tempo medio de ${panelDuration}s por frame.`,
      review_status: 'needs_review',
      storyboard_prompt: storyboardPrompt,
      panels,
    }
  })

  return {
    project: {
      title: project.title,
      ratio: project.ratio,
      director_mode: project.director_mode,
      episode_duration_seconds: episodeDuration,
    },
    part_count: partCount,
    panels_per_part: panelsPerPart,
    total_panels: partCount * panelsPerPart,
    parts,
    negative_prompt: negativePrompt,
  }
}

export function buildImprovementSuggestions(plan: any) {
  const recommendations = plan?.recommendations
  const estimate = recommendations?.estimate || {}
  const suggestions = [
    {
      priority: 'high',
      title: 'Aprovar biblia visual antes dos storyboards',
      reason: 'Sem locks de rosto, figurino e locais, os prompts tendem a variar entre partes.',
      action: 'Revisar personagens, locais, objetos e regras de continuidade.',
    },
    {
      priority: estimate.total_panels > 72 ? 'high' : 'medium',
      title: 'Controlar carga de revisao',
      reason: `${estimate.total_panels || 0} paineis estimados podem exigir revisao cuidadosa.`,
      action: 'Use a recomendacao pre-selecionada ou reduza paineis nas partes menos dramaticas.',
    },
    {
      priority: 'medium',
      title: 'Marcar referencias principais',
      reason: 'A IA precisa saber quais imagens mandam na consistencia visual.',
      action: 'Classificar imagens como personagem, local, objeto ou estilo.',
    },
    {
      priority: 'medium',
      title: 'Validar prompts com objetos legiveis',
      reason: 'Fotos, cartas, livros e telas podem sair invertidos se a orientacao nao for explicita.',
      action: 'Manter a regra de orientacao no prompt e no negative prompt.',
    },
  ]
  return { suggestions }
}
