import { describe, expect, it } from 'vitest'
import { estimatePromptMetrics, renderPromptContent } from './prompt-templates.js'

describe('prompt templates helpers', () => {
  it('renders template variables', () => {
    expect(renderPromptContent('Hello {{name}} from {{world}}', { name: 'Kai', world: 'Lumen' })).toBe('Hello Kai from Lumen')
  })

  it('estimates prompt metrics', () => {
    expect(estimatePromptMetrics('12345678')).toEqual({ chars: 8, approxTokens: 2 })
  })
})
