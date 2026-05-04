
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { joinProviderUrl } from '../services/adapters/url.js'
import { getBuiltinVoices } from '../services/voice-catalog.js'
import { getActiveConfig } from '../services/ai.js'
import { describeVoiceGender, inferVoiceGender } from '../services/voice-selection.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'
import { revealAIConfigApiKey } from '../services/ai-configs.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

// GET /ai-voices?provider=minimax
app.get('/', async (c) => {
  const provider = c.req.query('provider') || getActiveConfig('audio')?.provider || 'minimax'
  const builtinVoices = getBuiltinVoices(provider)
  if (builtinVoices.length) {
    return success(c, builtinVoices.map((voice) => ({
      ...voice,
      gender: describeVoiceGender(voice.gender),
    })))
  }

  const rows = db.select().from(schema.aiVoices)
    .where(eq(schema.aiVoices.provider, provider))
    .all()

  const parsed = rows.map(r => ({
    voice_id: r.voiceId,
    voice_name: r.voiceName,
    description: r.description ? JSON.parse(r.description) : [],
    language: r.language,
    provider: r.provider,
    gender: describeVoiceGender(inferVoiceGender({
      id: r.voiceId,
      name: r.voiceName,
      description: r.description ? JSON.parse(r.description) : [],
      language: r.language,
      provider: r.provider,
    })),
  }))

  return success(c, parsed)
})

// POST /ai-voices/sync
app.post('/sync', async (c) => {

  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'audio'))
    .all()
    .filter(r => r.isActive && r.provider === 'minimax')

  if (rows.length === 0) {
    return badRequest(c, 'Nenhuma configuração de áudio MiniMax ativa foi encontrada')
  }

  const config = rows[0]
  const apiKey = revealAIConfigApiKey(config.apiKey)
  if (!apiKey) {
    return badRequest(c, 'A API key do MiniMax não está configurada')
  }


  const resp = await fetch(joinProviderUrl(config.baseUrl, '/v1', '/get_voice'), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ voice_type: 'all' }),
  })

  if (!resp.ok) {
    return badRequest(c, `Erro da API MiniMax: ${resp.status}`)
  }

  const result = await resp.json() as any
  if (result.base_resp?.status_code !== 0) {
    return badRequest(c, result.base_resp?.status_msg || 'Falha ao buscar vozes')
  }

  const voices = (result.system_voice || []).filter((v: any) => shouldKeepVoice(v))
  const ts = now()


  db.delete(schema.aiVoices).where(eq(schema.aiVoices.provider, 'minimax')).run()


  const insertRows = voices.map((v: any) => ({
    voiceId: v.voice_id,
    voiceName: v.voice_name,
    description: JSON.stringify(v.description || []),
    language: extractLanguage(v.voice_id, v.voice_name),
    provider: 'minimax',
    createdAt: ts,
  }))

  if (insertRows.length > 0) {
    db.insert(schema.aiVoices).values(insertRows).run()
  }

  return success(c, { count: insertRows.length, message: `${insertRows.length} vozes sincronizadas` })
})


function extractLanguage(voiceId: string, voiceName: string): string {
  const text = `${voiceId} ${voiceName}`.toLowerCase()
  if (text.includes('cantonese') || text.includes('Cantonês')) return 'Cantonês'
  if (text.includes('english') || text.includes('aussie')) return 'Inglês'
  if (text.includes('japanese') || text.includes('Japonês')) return 'Japonês'
  if (text.includes('korean') || text.includes('Coreano')) return 'Coreano'
  if (text.includes('spanish')) return 'Espanhol'
  if (text.includes('portuguese')) return 'Português'
  if (text.includes('french')) return 'Francês'
  if (text.includes('indonesian')) return 'Indonésio'
  if (text.includes('german')) return 'Alemão'
  if (text.includes('russian')) return 'Russo'
  if (text.includes('italian')) return 'Italiano'
  if (text.includes('arabic')) return 'Árabe'
  if (text.includes('turkish')) return 'Turco'
  if (text.includes('ukrainian')) return 'Ucraniano'
  if (text.includes('dutch')) return 'Holandês'
  if (text.includes('vietnamese')) return 'Vietnamita'
  if (text.includes('chinese') || text.includes('mandarin') || text.includes('Chinês')) return 'Chinês'
  return 'Outros'
}

function shouldKeepVoice(voice: { voice_id: string, voice_name: string }) {
  const language = extractLanguage(voice.voice_id, voice.voice_name)
  if (language !== 'Chinês' && language !== 'Cantonês') return false

  const text = `${voice.voice_id} ${voice.voice_name}`.toLowerCase()

  const excludedPatterns = [
    'jingpin',
    '-beta',
    'cartoon_pig',
    'cute_boy',
    'lovely_girl',
    'clever_boy',
    'robot_armor',
    'news_anchor',
    'male_announcer',
    'radio_host',
    'hk_flight_attendant',
  ]

  return !excludedPatterns.some(pattern => text.includes(pattern))
}

export default app
