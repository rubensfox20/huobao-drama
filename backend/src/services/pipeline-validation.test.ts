import { describe, expect, it } from 'vitest'
import { validateVisualPrompt } from './pipeline-validation.js'

describe('validateVisualPrompt', () => {
  it('blocks dialogue leakage in visual prompts', () => {
    const issues = validateVisualPrompt('cinematic shot, subtitle on screen, dialogue from hero')
    expect(issues[0]?.severity).toBe('error')
  })

  it('accepts a clean visual prompt', () => {
    expect(validateVisualPrompt('cinematic hero portrait, soft lighting, no text')).toHaveLength(0)
  })
})
