import { describe, expect, it } from 'vitest'
import {
  buildCinematicPlanFallback,
  buildNegativePrompt,
  buildPromptVariants,
  buildStoryboardPackage,
  refinePanelPrompt,
  scoreCinematicPanel,
  validateCinematicPrompt,
} from './cinematic-production-engine.js'

const brief = {
  idea: 'A programmer creates a holographic AI that escapes through city screens while he decides whether freedom is worth losing her.',
  genre: 'sci-fi neon drama',
  seasons: 1,
  episodes_per_season: 5,
  episode_duration_seconds: 180,
  ratio: '16:9',
  director_mode: 'sci-fi neon',
  format_preset: 'cinematic wide',
}

describe('cinematic production engine', () => {
  it('keeps orientation protection in the automatic negative prompt', () => {
    const negativePrompt = buildNegativePrompt()

    expect(negativePrompt).toContain('upside-down book content')
    expect(negativePrompt).toContain('mirrored screen content')
    expect(negativePrompt).toContain('content facing away from the character reading it')
  })

  it('warns when visible reading material has no orientation rule', () => {
    const result = validateCinematicPrompt('cinematic close-up of a character reading a book under cold light')

    expect(result.passed).toBe(true)
    expect(result.issues.some(issue => /orientacao|orienta/i.test(issue.message))).toBe(true)
  })

  it('scores panel quality from prompt completeness and risk', () => {
    const score = scoreCinematicPanel({
      image_prompt: 'Photorealistic cinematic medium shot, consistent character wardrobe, dramatic reveal, design sheet reference, no text',
      video_prompt: 'The character slowly looks at the screen and reveals the hidden message over 6 seconds.',
      negative_prompt: buildNegativePrompt(),
      prompt_layers: {
        character: 'locked',
        location: 'approved room',
        action: 'reveal',
        camera: 'medium shot',
        lighting: 'cold neon',
        style: 'sci-fi',
        restrictions: 'no text',
        references: 'design sheet',
      },
      caption: 'She sees the truth',
      duration_seconds: 6,
    })

    expect(score.score).toBeGreaterThan(70)
    expect(score.generation_risk).toBeLessThan(40)
  })

  it('builds A/B prompt variants with adapters and quality', () => {
    const result = buildPromptVariants({
      prompt: 'Photorealistic cinematic wide shot, consistent character, rain, neon city, design sheet reference',
      negative_prompt: buildNegativePrompt(),
      modes: ['emotional', 'action'],
    })

    expect(result.variants).toHaveLength(2)
    expect(result.variants[0].model_adapters.length).toBeGreaterThan(3)
    expect(result.variants[1].quality.score).toBeGreaterThan(0)
  })

  it('refines a panel prompt without losing negative prompt and versions', () => {
    const refined = refinePanelPrompt({
      panel: {
        panel_number: 3,
        image_prompt: 'Photorealistic cinematic close-up, consistent face, design sheet reference',
        video_prompt: 'She turns toward the camera.',
        negative_prompt: buildNegativePrompt(),
        prompt_layers: { camera: 'close-up' },
      },
      instruction: 'make it more intense',
      target_model: 'Runway',
    })

    expect(refined.image_prompt).toContain('make it more intense')
    expect(refined.negative_prompt).toContain('watermark')
    expect(refined.model_adapters).toHaveLength(1)
    expect(refined.versions.refined).toBeTruthy()
  })

  it('uses dynamic quality scoring inside storyboard packages', () => {
    const plan = buildCinematicPlanFallback(brief)
    const storyboard = buildStoryboardPackage(brief, plan, { part_count: 3, panels_per_part: 5 })
    const firstPanel = storyboard.parts[0].panels[0]

    expect(storyboard.total_panels).toBe(15)
    expect(firstPanel.quality.score).toBeGreaterThan(0)
    expect(firstPanel.model_adapters.length).toBeGreaterThan(3)
    expect(firstPanel.negative_prompt).toContain('upside-down photo')
  })
})
