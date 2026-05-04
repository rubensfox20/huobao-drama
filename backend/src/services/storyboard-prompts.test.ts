import { describe, expect, it } from 'vitest'
import { normalizeLocationEnglish, sanitizeSupportPrompt, sanitizeVisualPrompt, translateVisualText } from './storyboard-prompts.js'

describe('sanitizeVisualPrompt', () => {
  it('normalizes portuguese timeline prompts to english visual prompts', () => {
    const prompt = sanitizeVisualPrompt('0-3s：location: Ilha Desolada, plano médio, expressão preocupada, luz fria. 3-6s：location: Ilha Desolada, close-up no rosto, lágrimas.')

    expect(prompt).toContain('0-3s |')
    expect(prompt).toContain('location: desolate island')
    expect(prompt).toContain('medium shot')
    expect(prompt).toContain('concerned expression')
    expect(prompt).toContain('tears')
    expect(prompt).not.toMatch(/[\u79d2ãáàâéêíóôõúç]|plano médio|Ilha Desolada|expressão preocupada/i)
  })

  it('normalizes bgm and sound effect prompts to english', () => {
    expect(sanitizeSupportPrompt('música épica ambiental, tons sombrios')).toBe('epic ambient music, dark tones')
    expect(sanitizeSupportPrompt('zumbido de energia')).toBe('energy hum')
  })

  it('normalizes generic location and time phrases to english', () => {
    expect(normalizeLocationEnglish('Próximo à costa oeste, região do Golfo de Penas')).toBe('near west coast, region of Gulf of Penas')
    expect(translateVisualText('13 de maio de 1741, fim do dia')).toBe('13 May 1741, late day')
  })
})
