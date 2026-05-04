import { describe, expect, it } from 'vitest'
import {
  buildCharacterImagePromptFromProfile,
  buildCharacterVisualProfile,
  buildSceneImagePromptFromProfile,
  buildSceneVisualProfile,
  buildStoryboardGenerationSpec,
  buildStoryboardImagePromptFromSpec,
} from './visual-identity.js'

describe('visual identity', () => {
  it('builds a differentiated character profile without story-specific hardcode', () => {
    const captain = buildCharacterVisualProfile({
      id: 1,
      name: 'Captain Rowan Vale',
      role: 'Captain',
      appearance: 'middle-aged male, weathered face, short dark hair, naval coat, sturdy boots',
      description: 'A disciplined commander with a gaunt silhouette and scar near one eye.',
      personality: 'stoic, resolute, controlled under pressure',
      referenceImages: '[]',
    }, [
      { id: 1, name: 'Captain Rowan Vale' },
      { id: 2, name: 'First Officer Elias Hart' },
    ])

    expect(captain.identityLabel).toBe('Captain Rowan Vale')
    expect(captain.faceSignature.join(' ')).toMatch(/weathered|short hair|scar/i)
    expect(captain.wardrobeSignature.join(' ')).toMatch(/coat|boots|uniform/i)
    expect(captain.contrastCast).toContain('First Officer Elias Hart')
  })

  it('builds a scene profile with reusable production identity', () => {
    const scene = buildSceneVisualProfile({
      location: 'Costa rochosa',
      time: 'Noite chuvosa',
      prompt: 'Cold coastal storm, slick rocks, wind-whipped surf, small campfires',
      imageUrl: 'static/images/scene.png',
    })

    expect(scene.locationCore).toContain('Costa')
    expect(scene.referenceAssetPaths).toContain('static/images/scene.png')
    expect(scene.environmentRules.length).toBeGreaterThan(0)
  })

  it('builds scene prompts in english without leaking portuguese fragments', () => {
    const profile = buildSceneVisualProfile({
      location: 'Próximo à costa oeste, região do Golfo de Penas',
      time: '13 de maio de 1741, fim do dia',
      prompt: 'mar frio, rochas escuras, floresta comprimindo a praia, vento duro',
    })

    const prompt = buildSceneImagePromptFromProfile(profile)
    expect(prompt).toMatch(/setting:/i)
    expect(prompt).toMatch(/set family:/i)
    expect(prompt).not.toMatch(/\b(?:golfo de penas|fim do dia|rochas escuras|vento duro)\b/i)
    expect(prompt).not.toMatch(/[ãáàâéêíóôõúç]/i)
  })

  it('keeps distinct scene families visually differentiated', () => {
    const shipboard = buildSceneImagePromptFromProfile(buildSceneVisualProfile({
      location: 'A bordo do navio',
      time: 'Noite de tempestade',
      prompt: 'convés molhado, mastros, cordas tensionadas, chuva pesada',
    }))
    const coastline = buildSceneImagePromptFromProfile(buildSceneVisualProfile({
      location: 'Costa desolada',
      time: 'Fim de tarde',
      prompt: 'praia fria, rochas escuras, floresta próxima, arrebentação pesada',
    }))

    expect(shipboard).toMatch(/shipboard/i)
    expect(coastline).toMatch(/coastline|coastal|shore/i)
    expect(shipboard).not.toBe(coastline)
  })

  it('builds storyboard spec and prompt with cast continuity instead of free-form prompt only', () => {
    const spec = buildStoryboardGenerationSpec({
      storyboard: {
        id: 68,
        episodeId: 13,
        sceneId: 12,
        title: 'Storm crossing',
        description: 'The crew braces on a shattered deck while the captain holds the line.',
        imagePrompt: 'Crew on deck in a violent storm',
        shotType: 'wide shot',
        angle: 'eye level',
        movement: 'slow push',
        referenceImages: JSON.stringify(['static/storyboards/68-ref.png']),
      },
      episode: {
        id: 13,
        dramaId: 4,
      },
      scene: {
        id: 12,
        location: 'North Atlantic deck',
        time: 'stormy night',
        prompt: 'dark sea, broken masts, hard rain',
        imageUrl: 'static/scenes/deck.png',
      },
      characters: [
        {
          id: 1,
          name: 'Captain Rowan Vale',
          role: 'Captain',
          appearance: 'middle-aged male, weathered face, short dark hair, naval coat',
          description: 'Scar near one eye, gaunt silhouette',
          personality: 'resolute under pressure',
          imageUrl: 'static/characters/captain.png',
        },
        {
          id: 2,
          name: 'First Officer Elias Hart',
          role: 'First officer',
          appearance: 'younger male, clean-shaven, longer wet hair, lighter officer coat',
          description: 'nervous but precise',
          personality: 'tense, observant',
          imageUrl: 'static/characters/officer.png',
        },
      ],
      props: [
        { id: 4, name: 'Signal lantern' },
      ],
    })

    const prompt = buildStoryboardImagePromptFromSpec(spec)

    expect(spec.castProfiles).toHaveLength(2)
    expect(spec.referenceAssetPaths).toContain('static/scenes/deck.png')
    expect(spec.referenceAssetPaths).toContain('static/characters/captain.png')
    expect(spec.continuity.sourceStoryboardId).toBeNull()
    expect(spec.continuity.inheritedReferencePaths).toEqual([])
    expect(prompt).toMatch(/Captain Rowan Vale/i)
    expect(prompt).toMatch(/distinct/i)
    expect(prompt).toMatch(/setting:/i)
  })

  it('keeps character prompt anchored to distinct identity cues', () => {
    const profile = buildCharacterVisualProfile({
      id: 1,
      name: 'Investigator Mira Sol',
      role: 'Lead investigator',
      appearance: 'young adult female, sharp gaze, braided dark hair, long coat',
      description: 'slender silhouette, analytical posture',
      personality: 'focused, emotionally restrained',
    })

    const prompt = buildCharacterImagePromptFromProfile(profile)
    expect(prompt).toMatch(/distinct/i)
    expect(prompt).toMatch(/braided dark hair|long coat|sharp gaze/i)
  })
})
