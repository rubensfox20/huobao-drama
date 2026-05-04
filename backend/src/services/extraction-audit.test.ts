import { describe, expect, it } from 'vitest'
import { summarizeExtractionMentionRows } from './extraction-audit.js'

describe('extraction audit summaries', () => {
  it('groups repeated mentions by canonical entity identity and picks the strongest quote first', () => {
    const grouped = summarizeExtractionMentionRows([
      {
        id: 1,
        episodeId: 10,
        dramaId: 4,
        entityType: 'character',
        entityIdentity: 'Capitão David Cheap',
        entityLabel: 'Capitão David Cheap',
        signal: 'dialogue',
        confidence: 1,
        sourceQuote: 'Capitão David Cheap: Segurem firme!',
        sourceSpan: 'scene:1',
        sceneIndex: 0,
        location: 'Costa',
        time: 'Noite',
        metadata: null,
        createdAt: '2026-04-13T00:00:00Z',
        updatedAt: '2026-04-13T00:00:00Z',
      },
      {
        id: 2,
        episodeId: 10,
        dramaId: 4,
        entityType: 'character',
        entityIdentity: 'Capitão David Cheap',
        entityLabel: 'Capitão David Cheap',
        signal: 'title',
        confidence: 0.92,
        sourceQuote: 'O capitão David Cheap, ferido, tenta manter o comando.',
        sourceSpan: 'scene:2',
        sceneIndex: 1,
        location: 'Praia',
        time: 'Dia',
        metadata: null,
        createdAt: '2026-04-13T00:00:00Z',
        updatedAt: '2026-04-13T00:00:00Z',
      },
    ] as any)

    const summary = grouped.get('Capitão David Cheap')
    expect(summary).toBeTruthy()
    expect(summary?.mention_count).toBe(2)
    expect(summary?.top_quote).toBe('Capitão David Cheap: Segurem firme!')
    expect(summary?.signals).toEqual(['dialogue', 'title'])
    expect(summary?.mentions).toHaveLength(2)
  })
})
