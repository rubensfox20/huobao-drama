import { describe, expect, it } from 'vitest'
import { buildAllowedSpeakerHint, filterNamedCandidatesAgainstSource, findScriptStructuralIssues, sanitizeRewrittenScript } from './script-sanitizer.js'

describe('script sanitizer', () => {
  it('removes markdown dialogue labels and final markers', () => {
    const sanitized = sanitizeRewrittenScript(`
## S1 | Exterior · Praia | Noite

**Capitão David Cheap:** (ferido) Segurem firme!

**FIM DO ROTEIRO**
`)

    expect(sanitized).toContain('Capitão David Cheap: (ferido) Segurem firme!')
    expect(sanitized).not.toContain('**')
    expect(sanitized).not.toMatch(/FIM DO ROTEIRO/i)
  })

  it('flags generic speaker labels and editorial markers as structural issues', () => {
    const issues = findScriptStructuralIssues(`
## S1 | Exterior · Praia | Noite

Voz do Oficial: Recuem!
**FIM DO ROTEIRO**
`)

    expect(issues.length).toBeGreaterThanOrEqual(2)
    expect(issues.join(' ')).toMatch(/marcador editorial/i)
    expect(issues.join(' ')).toMatch(/rotulos genericos/i)
  })

  it('removes named speaker labels not present in the source material', () => {
    const source = 'Na praia gelada, o capitão David Cheap tenta manter a autoridade enquanto os homens observam em silêncio.'
    const sanitized = sanitizeRewrittenScript(`
Marinheiro Tom: (tremendo) "A água está subindo."
Capitão David Cheap: (ferido) Segurem firme!
`, source)

    expect(sanitized).not.toMatch(/Marinheiro Tom:/)
    expect(sanitized).toMatch(/A água está subindo/i)
    expect(sanitized).toMatch(/Capitão David Cheap:/)
  })

  it('filters named candidates against the original source', () => {
    const source = 'O capitão David Cheap ainda tenta comandar o que restou do Wager.'
    const filtered = filterNamedCandidatesAgainstSource([
      { name: 'Capitão David Cheap' },
      { name: 'Marinheiro Tom' },
      { name: 'Oficial James' },
    ], source)

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.name).toBe('Capitão David Cheap')
  })

  it('canonicalizes filtered names to the strongest source-grounded version', () => {
    const source = 'O capitão David Cheap, ferido e orgulhoso, tenta manter o comando após o naufrágio.'
    const filtered = filterNamedCandidatesAgainstSource([
      { name: 'David Cheap' },
    ], source)

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.name).toBe('Capitão David Cheap')
  })

  it('flags unauthorized named speakers from rewritten scripts', () => {
    const source = 'David Cheap tenta manter a ordem entre os sobreviventes.'
    const issues = findScriptStructuralIssues(`
Capitão David Cheap: Segurem firme!
Marinheiro Tom: Estamos perdidos.
`, source)

    expect(issues.join(' ')).toMatch(/falantes nao autorizados/i)
    expect(issues.join(' ')).toMatch(/Marinheiro Tom/)
  })

  it('builds a speaker allowlist from the original prose instead of locations', () => {
    const hint = buildAllowedSpeakerHint('Em maio de 1741, o capitão David Cheap observa a costa da Patagônia chilena enquanto o HMS Wager se separa da esquadra de George Anson.')
    expect(hint).toMatch(/David Cheap/i)
    expect(hint).not.toMatch(/Patagônia/i)
    expect(hint).not.toMatch(/George Anson/i)
  })

  it('removes a repeated screenplay body when the model duplicates the full output', () => {
    const duplicated = `
## S1 | Exterior · Praia | Noite
O navio quebra contra a costa.

## S2 | Exterior · Praia | Amanhecer
Os sobreviventes acordam entre destroços.

## S1 | Exterior · Praia | Noite
O navio quebra contra a costa.

## S2 | Exterior · Praia | Amanhecer
Os sobreviventes acordam entre destroços.
`

    const sanitized = sanitizeRewrittenScript(duplicated)
    const sceneMatches = [...sanitized.matchAll(/^##\s*S\d+/gm)]
    expect(sceneMatches).toHaveLength(2)
    expect(sanitized).not.toMatch(/## S1[\s\S]*## S1/)
  })
})
