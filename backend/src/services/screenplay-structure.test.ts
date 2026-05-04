import { describe, expect, it } from 'vitest'
import {
  extractDialogueSpeakerMentions,
  extractFullNameCharacterMentions,
  extractPropMentions,
  extractTitledCharacterMentions,
  parseScreenplayStructure,
} from './screenplay-structure.js'

describe('screenplay structure parser', () => {
  it('parses internal markdown scene headers into reusable scene blocks', () => {
    const script = [
      '## S1 | Exterior · Costa rochosa | Noite',
      'O vento açoita a costa.',
      '',
      '## S2 | Interior · Cabine do navio | Amanhecer',
      'A madeira range sob pressão.',
    ].join('\n')

    const scenes = parseScreenplayStructure(script)

    expect(scenes).toHaveLength(2)
    expect(scenes[0]?.location).toBe('Costa rochosa')
    expect(scenes[0]?.time).toBe('Noite')
    expect(scenes[1]?.location).toBe('Cabine do navio')
    expect(scenes[1]?.time).toBe('Amanhecer')
  })

  it('parses standard screenplay headings', () => {
    const script = [
      'EXT. ROCKY COAST - NIGHT',
      'Rain lashes the shore.',
      '',
      'INT. CAPTAIN CABIN - DAWN',
      'The hull creaks.',
    ].join('\n')

    const scenes = parseScreenplayStructure(script)

    expect(scenes).toHaveLength(2)
    expect(scenes[0]?.location).toBe('ROCKY COAST')
    expect(scenes[0]?.time).toBe('NIGHT')
    expect(scenes[1]?.location).toBe('CAPTAIN CABIN')
    expect(scenes[1]?.time).toBe('DAWN')
  })

  it('extracts dialogue speakers and titled action mentions with evidence', () => {
    const script = [
      '## S1 | Exterior · Praia remota | Dia',
      'Capitão Thomas Gray tenta manter a ordem.',
      'Thomas Gray: Segurem firme.',
    ].join('\n')

    const dialogue = extractDialogueSpeakerMentions(script)
    const titled = extractTitledCharacterMentions(script)

    expect(dialogue[0]?.name).toBe('Thomas Gray')
    expect(dialogue[0]?.sourceQuote).toContain('Thomas Gray:')
    expect(titled.map(item => item.name)).toContain('Capitão Thomas Gray')
  })

  it('extracts full names from prose when human context or recurrence exists', () => {
    const script = [
      '## S1 | Exterior · Convés castigado | Noite',
      'O capitão Thomas Gray tenta manter a ordem enquanto Elias Moore observa o mar.',
      'Mais tarde, Thomas Gray percebe que Elias Moore já perdeu a confiança na missão.',
    ].join('\n')

    const names = extractFullNameCharacterMentions(script).map(item => item.name)

    expect(names).toContain('Thomas Gray')
    expect(names).toContain('Elias Moore')
  })

  it('extracts named ships and object mentions as prop candidates', () => {
    const script = [
      '## S1 | Exterior · Mar aberto | Noite',
      'O HMS Victory luta contra as ondas.',
      'Um artefato Atlas pulsa sob a chuva.',
    ].join('\n')

    const props = extractPropMentions(script).map(item => item.name)

    expect(props).toContain('HMS Victory')
    expect(props).toContain('artefato Atlas')
  })
})
