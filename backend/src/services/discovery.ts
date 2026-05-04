import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { getPromptTemplateContent, renderPromptContent } from './prompt-templates.js'
import { generateTextCompletion, getResolvedTextConfig } from './text-provider.js'

type DiscoveryCandidateDraft = {
  title: string
  summary: string
  hook: string
  premise: string
  tags: string[]
  score: number
}

export async function runDiscovery(input: {
  ideaId?: number | null
  mode: 'no-web' | 'web'
  query?: string | null
  sources?: Array<{ title?: string; url?: string; content?: string }> | null
}) {
  const idea = input.ideaId
    ? db.select().from(schema.ideas).where(eq(schema.ideas.id, input.ideaId)).all()[0]
    : null
  const ts = now()
  const runResult = db.insert(schema.discoveryRuns).values({
    ideaId: input.ideaId ?? null,
    mode: input.mode,
    status: 'running',
    query: input.query ?? null,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const runId = Number(runResult.lastInsertRowid)

  const sources = Array.isArray(input.sources) ? input.sources : []
  for (const source of sources) {
    db.insert(schema.sourceSnapshots).values({
      runId,
      sourceType: input.mode === 'web' ? 'web' : 'manual',
      title: source.title || null,
      url: source.url || null,
      content: source.content || null,
      metadata: null,
      createdAt: ts,
    }).run()
  }
  if (input.query) {
    db.insert(schema.sourceSnapshots).values({
      runId,
      sourceType: input.mode === 'web' ? 'query' : 'manual_query',
      title: input.query,
      url: null,
      content: input.query,
      metadata: null,
      createdAt: ts,
    }).run()
  }

  let candidates: DiscoveryCandidateDraft[]
  let summary = ''
  let provider = ''
  let model = ''

  try {
    const aiResult = await tryDiscoveryWithAI(idea, input.query || '', sources)
    candidates = aiResult.candidates
    summary = aiResult.summary
    provider = aiResult.provider
    model = aiResult.model
  } catch {
    candidates = buildDeterministicCandidates(idea, input.query || '', sources)
    summary = `Geradas ${candidates.length} opcoes em fallback deterministico.`
  }

  for (const candidate of candidates) {
    db.insert(schema.discoveryCandidates).values({
      runId,
      title: candidate.title,
      summary: candidate.summary,
      hook: candidate.hook,
      premise: candidate.premise,
      tags: JSON.stringify(candidate.tags),
      score: candidate.score,
      metadata: JSON.stringify({}),
      createdAt: now(),
    }).run()
  }

  db.update(schema.discoveryRuns).set({
    status: 'completed',
    summary,
    provider: provider || null,
    model: model || null,
    updatedAt: now(),
    completedAt: now(),
  }).where(eq(schema.discoveryRuns.id, runId)).run()

  return getDiscoveryRun(runId)
}

export function getDiscoveryRun(id: number) {
  const [run] = db.select().from(schema.discoveryRuns).where(eq(schema.discoveryRuns.id, id)).all()
  if (!run) return null
  const candidates = db.select().from(schema.discoveryCandidates).where(eq(schema.discoveryCandidates.runId, id)).all()
  const sources = db.select().from(schema.sourceSnapshots).where(eq(schema.sourceSnapshots.runId, id)).all()
  return { ...run, candidates, sources }
}

export function applyDiscoveryCandidate(runId: number, candidateId: number, totalEpisodes = 3) {
  const [candidate] = db.select().from(schema.discoveryCandidates).where(eq(schema.discoveryCandidates.id, candidateId)).all()
  const [run] = db.select().from(schema.discoveryRuns).where(eq(schema.discoveryRuns.id, runId)).all()
  if (!candidate || !run || candidate.runId !== run.id) return null
  const ts = now()
  const dramaResult = db.insert(schema.dramas).values({
    title: candidate.title,
    description: candidate.summary,
    genre: '',
    style: 'anime',
    status: 'draft',
    metadata: JSON.stringify({
      discovery_run_id: runId,
      discovery_candidate_id: candidateId,
      premise: candidate.premise,
      hook: candidate.hook,
      source_mode: run.mode,
    }),
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const dramaId = Number(dramaResult.lastInsertRowid)

  for (let index = 1; index <= totalEpisodes; index += 1) {
    db.insert(schema.episodes).values({
      dramaId,
      episodeNumber: index,
      title: `Episodio ${index}`,
      content: index === 1 ? candidate.premise : '',
      status: 'draft',
      createdAt: ts,
      updatedAt: ts,
    }).run()
  }

  return db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all()[0]
}

async function tryDiscoveryWithAI(idea: any, query: string, sources: Array<{ title?: string; url?: string; content?: string }>) {
  const config = getResolvedTextConfig()
  const provider = config.provider
  const model = config.model
  const prompt = renderPromptContent(
    getPromptTemplateContent('discovery.idea_synthesizer', 'Turn the context below into 3 microdrama concepts. Use genre {{genre}}, tone {{tone}}, and language {{language}}. Context: {{context}}'),
    {
      genre: idea?.genre || 'drama',
      tone: idea?.tone || 'cinematico',
      language: idea?.language || 'pt-BR',
      context: [idea?.title, idea?.description, query, ...sources.map(source => source.content || source.title || source.url || '')].filter(Boolean).join('\n\n'),
    },
  )

  const response = await generateTextCompletion({
    operation: 'discovery-synthesis',
    temperature: 0.4,
    jsonOnly: true,
    system: 'Retorne JSON valido com o formato {"summary": string, "candidates": [{"title": string, "summary": string, "hook": string, "premise": string, "tags": string[], "score": number}]}.',
    prompt,
  })
  const parsed = JSON.parse(extractJson(response.text))
  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates.slice(0, 3) : []
  if (!candidates.length) {
    throw new Error('AI discovery returned no candidates')
  }
  return {
    summary: String(parsed.summary || `Geradas ${candidates.length} opcoes com IA.`),
    candidates: candidates.map(normalizeCandidate),
    provider,
    model,
  }
}

function buildDeterministicCandidates(idea: any, query: string, sources: Array<{ title?: string; url?: string; content?: string }>) {
  const seed = [idea?.title, idea?.description, query, ...sources.map(source => source.title || source.content || '')]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const baseTitle = idea?.title || 'Novo drama'
  const baseDescription = idea?.description || seed || 'Conceito original de microdrama'
  return [
    normalizeCandidate({
      title: `${baseTitle} | Ascensao`,
      summary: `Versao com escala crescente de conflito a partir de ${baseDescription}.`,
      hook: 'Um ponto de ruptura acelera a historia no primeiro minuto.',
      premise: `${baseDescription}. O protagonista descobre uma oportunidade perigosa e precisa agir antes que o mundo ao redor colapse.`,
      tags: ['ascensao', 'conflito', 'serial'],
      score: 0.86,
    }),
    normalizeCandidate({
      title: `${baseTitle} | Segredo`,
      summary: `Versao centrada em revelacao e segredo emocional a partir de ${baseDescription}.`,
      hook: 'Uma revelacao muda a leitura de todos os vinculos.',
      premise: `${baseDescription}. Um segredo antigo reconfigura as relacoes e cria uma cadeia de decisoes irreversiveis.`,
      tags: ['segredo', 'emocional', 'gancho'],
      score: 0.81,
    }),
    normalizeCandidate({
      title: `${baseTitle} | Queda`,
      summary: `Versao com tom mais sombrio e ritmo de suspense a partir de ${baseDescription}.`,
      hook: 'Cada episodio termina pior do que começou.',
      premise: `${baseDescription}. O heroi acredita estar vencendo, mas cada passo o aproxima do verdadeiro antagonista.`,
      tags: ['suspense', 'queda', 'cliffhanger'],
      score: 0.78,
    }),
  ]
}

function normalizeCandidate(candidate: any): DiscoveryCandidateDraft {
  return {
    title: String(candidate?.title || 'Conceito sem titulo'),
    summary: String(candidate?.summary || ''),
    hook: String(candidate?.hook || ''),
    premise: String(candidate?.premise || ''),
    tags: Array.isArray(candidate?.tags) ? candidate.tags.map((tag: unknown) => String(tag)) : [],
    score: Number(candidate?.score || 0.5),
  }
}

function extractJson(content: string) {
  const text = String(content || '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text
}
