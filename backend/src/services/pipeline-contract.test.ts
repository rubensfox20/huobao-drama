import fs from 'fs'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveStoragePath } from '../utils/storage.js'
import { buildEpisodePipelineContract } from './pipeline-contract.js'

const created = {
  dramas: [] as number[],
  episodes: [] as number[],
  characters: [] as number[],
  scenes: [] as number[],
  storyboards: [] as number[],
  episodeCharacters: [] as number[],
  episodeScenes: [] as number[],
  files: [] as string[],
}

function now() {
  return new Date().toISOString()
}

function insertRow(table: any, values: Record<string, unknown>) {
  const result = db.insert(table).values(values).run()
  return Number(result.lastInsertRowid)
}

function createEpisodeFixture() {
  const timestamp = now()
  const dramaId = insertRow(schema.dramas, {
    title: `Pipeline contract ${timestamp}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  created.dramas.push(dramaId)

  const episodeId = insertRow(schema.episodes, {
    dramaId,
    episodeNumber: Math.floor(Math.random() * 100000) + 1,
    title: 'Episode',
    content: 'Conteudo bruto',
    scriptContent: 'Roteiro estruturado',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  created.episodes.push(episodeId)

  return { dramaId, episodeId }
}

function addCharacter(dramaId: number, episodeId: number, patch: Partial<typeof schema.characters.$inferInsert> = {}) {
  const timestamp = now()
  const resolvedName = String(patch.name || `Personagem ${created.characters.length + 1}`)
  const characterId = insertRow(schema.characters, {
    dramaId,
    name: resolvedName,
    role: patch.role || 'protagonista',
    description: patch.description || `${resolvedName} aparece com presenca humana clara na cena.`,
    appearance: patch.appearance || 'Figura humana com tracos visuais consistentes.',
    personality: patch.personality || 'Determinado.',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...patch,
  })
  created.characters.push(characterId)

  const linkId = insertRow(schema.episodeCharacters, {
    episodeId,
    characterId,
    createdAt: timestamp,
  })
  created.episodeCharacters.push(linkId)
  return characterId
}

function addScene(dramaId: number, episodeId: number, patch: Partial<typeof schema.scenes.$inferInsert> = {}) {
  const timestamp = now()
  const sceneId = insertRow(schema.scenes, {
    dramaId,
    episodeId,
    location: patch.location || `Local ${created.scenes.length + 1}`,
    time: patch.time || 'Noite',
    prompt: patch.prompt || 'Cenario cinematico',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...patch,
  })
  created.scenes.push(sceneId)

  const linkId = insertRow(schema.episodeScenes, {
    episodeId,
    sceneId,
    createdAt: timestamp,
  })
  created.episodeScenes.push(linkId)
  return sceneId
}

function addStoryboard(episodeId: number, storyboardNumber: number, patch: Partial<typeof schema.storyboards.$inferInsert> = {}) {
  const timestamp = now()
  const storyboardId = insertRow(schema.storyboards, {
    episodeId,
    storyboardNumber,
    title: `Tomada ${storyboardNumber}`,
    description: 'Descricao da tomada',
    duration: 8,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...patch,
  })
  created.storyboards.push(storyboardId)
  return storyboardId
}

function createStorageFile(relativePath: string) {
  const absolutePath = resolveStoragePath(relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, Buffer.from('test-audio'))
  created.files.push(absolutePath)
  return relativePath
}

afterEach(() => {
  for (const file of created.files.splice(0)) {
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }
  for (const id of created.storyboards.splice(0)) db.delete(schema.storyboards).where(eq(schema.storyboards.id, id)).run()
  for (const id of created.episodeCharacters.splice(0)) db.delete(schema.episodeCharacters).where(eq(schema.episodeCharacters.id, id)).run()
  for (const id of created.episodeScenes.splice(0)) db.delete(schema.episodeScenes).where(eq(schema.episodeScenes.id, id)).run()
  for (const id of created.characters.splice(0)) db.delete(schema.characters).where(eq(schema.characters.id, id)).run()
  for (const id of created.scenes.splice(0)) db.delete(schema.scenes).where(eq(schema.scenes.id, id)).run()
  for (const id of created.episodes.splice(0)) db.delete(schema.episodes).where(eq(schema.episodes.id, id)).run()
  for (const id of created.dramas.splice(0)) db.delete(schema.dramas).where(eq(schema.dramas.id, id)).run()
})

describe('buildEpisodePipelineContract', () => {
  it('marks dubbing as not applicable when storyboards have no speech', () => {
    const { episodeId } = createEpisodeFixture()
    addStoryboard(episodeId, 1, { dialogue: '', description: '', action: '', result: '' })
    addStoryboard(episodeId, 2, { dialogue: null, description: '', action: '', result: '' })

    const contract = buildEpisodePipelineContract(episodeId)

    expect(contract.stages.dubbing.state).toBe('not_applicable')
    expect(contract.stages.dubbing.status).toBe('not_applicable')
    expect(contract.stages.dubbing.count).toBe(0)
    expect(contract.stages.dubbing.total).toBe(0)
  })

  it('marks dubbing as in progress when only part of the spoken shots have TTS', () => {
    const { episodeId } = createEpisodeFixture()
    const ttsPath = createStorageFile(`static/uploads/audio/pipeline-contract-${Date.now()}.wav`)
    addStoryboard(episodeId, 1, { dialogue: 'Ana: Estamos perto.', ttsAudioUrl: ttsPath })
    addStoryboard(episodeId, 2, { dialogue: 'Bruno: Ainda falta muito.' })

    const contract = buildEpisodePipelineContract(episodeId)

    expect(contract.stages.dubbing.state).toBe('in_progress')
    expect(contract.stages.dubbing.status).toBe('partial')
    expect(contract.stages.dubbing.count).toBe(1)
    expect(contract.stages.dubbing.total).toBe(2)
  })

  it('blocks dubbing only when an existing TTS reference is broken', () => {
    const { episodeId } = createEpisodeFixture()
    addStoryboard(episodeId, 1, {
      dialogue: 'Ana: O arquivo sumiu.',
      ttsAudioUrl: `static/uploads/audio/missing-pipeline-contract-${Date.now()}.wav`,
    })

    const contract = buildEpisodePipelineContract(episodeId)

    expect(contract.stages.dubbing.state).toBe('blocked')
    expect(contract.stages.dubbing.blocked).toBe(true)
    expect(contract.stages.dubbing.issues?.[0]?.code).toBe('invalid_tts_audio')
  })

  it('emits granular partial visual stages instead of only visual_assets', () => {
    const { dramaId, episodeId } = createEpisodeFixture()
    const sceneA = addScene(dramaId, episodeId, {
      location: 'Costa da Patagonia Chilena',
      time: 'Meio de 1741',
      prompt: 'Costa rochosa da Patagonia Chilena sob chuva intensa.',
      imageUrl: 'static/uploads/images/scene-a.png',
    })
    addScene(dramaId, episodeId, {
      location: 'Conves do HMS Wager',
      time: 'Meio de 1741',
      prompt: 'Conves encharcado do HMS Wager durante a tempestade.',
      imageUrl: null,
    })
    addCharacter(dramaId, episodeId, { name: 'Narrador da Historia', role: 'narrador' })
    addCharacter(dramaId, episodeId, { name: 'Capita Ana Silva', imageUrl: 'static/uploads/images/ana.png' })
    addCharacter(dramaId, episodeId, { name: 'Oficial Bruno Costa', imageUrl: null })
    addStoryboard(episodeId, 1, { sceneId: sceneA, firstFrameImage: 'static/uploads/images/frame-1.png' })
    addStoryboard(episodeId, 2, { sceneId: sceneA })

    const contract = buildEpisodePipelineContract(episodeId)

    expect(contract.stages.character_visuals.state).toBe('in_progress')
    expect(contract.stages.character_visuals.count).toBe(1)
    expect(contract.stages.character_visuals.total).toBe(2)
    expect(contract.stages.scene_visuals.state).toBe('in_progress')
    expect(contract.stages.storyboard_frames.state).toBe('in_progress')
    expect(contract.stages.visual_assets.state).toBe('in_progress')
  })
})
