import { describe, expect, it } from 'vitest'
import {
  CHAR_FUNCTIONS,
  CLASS_ALIASES,
  OFFICIAL_CLASSES,
  matchClassName,
  parseBasicProfileText,
  validateIdentity,
  validateIdentityDraft,
} from './identity'

// Phase 8 (08-03): the class list is the DB seed (15 transcendent names) and
// the parser consumes the EXACT text Tesseract returns for the sample
// public/examples/basic.png (RESEARCH §2.6).
describe('OFFICIAL_CLASSES — the 15-name seed catalog', () => {
  it('has exactly the 15 official names', () => {
    expect(OFFICIAL_CLASSES).toHaveLength(15)
    expect(OFFICIAL_CLASSES).toEqual([
      'Assassin Cross',
      'Lord Knight',
      'High Wizard',
      'Sniper',
      'High Priest',
      'Mastersmith',
      'Paladin',
      'Professor',
      'Stalker',
      'Biochemist',
      'Champion',
      'Bard',
      'Gypsy',
      'Summoner',
      'Rebellion',
    ])
  })

  it('exposes the three pointed build roles', () => {
    expect(CHAR_FUNCTIONS).toEqual(['dps', 'mdps', 'suporte'])
  })
})

describe('matchClassName — exact, containment, bounded fuzzy, never a default', () => {
  it('returns the exact official name for exact/whitespace/case variants', () => {
    expect(matchClassName('Gypsy')).toBe('Gypsy')
    expect(matchClassName('  gypsy ')).toBe('Gypsy')
    expect(matchClassName('ASSASSIN CROSS')).toBe('Assassin Cross')
  })

  it('matches OCR noise by bounded Levenshtein (Gypsv -> Gypsy)', () => {
    expect(matchClassName('Gypsv')).toBe('Gypsy')
    expect(matchClassName('Lord Knigth')).toBe('Lord Knight')
  })

  it('resolves unique containment (base job -> transcendent name)', () => {
    expect(matchClassName('Assassin')).toBe('Assassin Cross')
    expect(matchClassName('High Priest (support)')).toBe('High Priest')
  })

  it('returns null for unknown and ambiguous input instead of guessing', () => {
    expect(matchClassName('Ninja')).toBe(null)
    expect(matchClassName('')).toBe(null)
    expect(matchClassName(null)).toBe(null)
    // "r" is contained in nearly every class name — ambiguous, never a default.
    expect(matchClassName('r')).toBe(null)
  })
})

// 08.10 hotfix: the live client is pt-BR and prints localized class names while
// the catalog/seed stores the English transcendent names. WITHOUT these aliases
// `char_class` was null for every pt-BR print and first access was blocked.
describe('matchClassName — localized (pt-BR / es) class names', () => {
  it('maps the observed live client name (Criador -> Biochemist)', () => {
    expect(matchClassName('Criador')).toBe('Biochemist')
    expect(matchClassName('criador')).toBe('Biochemist')
    expect(matchClassName('Criador ID')).toBe('Biochemist')
  })

  it('maps localized transcendent and base names to the catalog entry', () => {
    expect(matchClassName('Algoz')).toBe('Assassin Cross')
    expect(matchClassName('Lorde')).toBe('Lord Knight')
    expect(matchClassName('Arquimago')).toBe('High Wizard')
    expect(matchClassName('Atirador de Elite')).toBe('Sniper')
    expect(matchClassName('Sumo-Sacerdote')).toBe('High Priest')
    expect(matchClassName('Mestre-Ferreiro')).toBe('Mastersmith')
    expect(matchClassName('Templário')).toBe('Paladin')
    expect(matchClassName('Desordeiro')).toBe('Stalker')
    expect(matchClassName('Cigana')).toBe('Gypsy')
    expect(matchClassName('Menestrel')).toBe('Bard')
    // base classes follow the same rename rule as the English containment
    expect(matchClassName('Cavaleiro')).toBe('Lord Knight')
    expect(matchClassName('Alquimista')).toBe('Biochemist')
  })

  it('prefers the longest spelling so truncated Mastersmith is not Champion', () => {
    expect(matchClassName('Mestre')).toBe('Champion')
    expect(matchClassName('Mestre-Ferr')).toBe('Mastersmith')
  })

  it('folds accents and stays null for an unmapped localized name', () => {
    expect(matchClassName('Sábio')).toBe('Professor')
    expect(matchClassName('Sacerdote')).toBe('High Priest')
    expect(matchClassName('Nv')).toBe(null)
    expect(matchClassName('Ninja')).toBe(null)
  })

  it('every alias maps to an official catalog name (no silent typos)', () => {
    for (const [alias, name] of Object.entries(CLASS_ALIASES)) {
      expect(OFFICIAL_CLASSES, `alias "${alias}"`).toContain(name)
      // the alias must actually resolve to its target
      expect(matchClassName(alias), `alias "${alias}"`).toBe(name)
    }
  })
})

describe('parseBasicProfileText — the real Basic screenshot sample', () => {
  const SAMPLE = 'Ahrya\nJob Gypsy\nID 32980\nPower 288115'

  it('reads Ahrya / 32980 / Gypsy from the canonical sample text', () => {
    expect(parseBasicProfileText(SAMPLE)).toEqual({
      nickname: 'Ahrya',
      char_id: '32980',
      char_class: 'Gypsy',
    })
  })

  it('normalizes OCR O -> 0 and accepts colon/period separators', () => {
    expect(parseBasicProfileText('Ahrya\nJob: Gypsy\nID: 32O8O').char_id).toBe('32080')
    expect(parseBasicProfileText('Ahrya\nJob Gypsy\nID. 12345').char_id).toBe('12345')
    // the label itself is commonly misread (1D / lD) on the shipped fixture
    expect(parseBasicProfileText('Ahrya\nJob Gypsy\n1D 32980 E').char_id).toBe('32980')
    expect(parseBasicProfileText('Ahrya\nJob Gypsy\nlD 32980').char_id).toBe('32980')
  })

  it('leaves an unknown job as null but still reads ID and nickname', () => {
    const parsed = parseBasicProfileText('Ahrya\nJob Ninja\nID 32980')
    expect(parsed.char_class).toBe(null)
    expect(parsed.char_id).toBe('32980')
    expect(parsed.nickname).toBe('Ahrya')
  })

  it('never mistakes a class/keyword line for the nickname', () => {
    expect(parseBasicProfileText('Gypsy\nJob Gypsy\nID 32980').nickname).toBe(null)
    expect(parseBasicProfileText('Power\nJob Gypsy\nID 32980').nickname).toBe(null)
    expect(parseBasicProfileText('Guild\nJob Gypsy\nID 32980').nickname).toBe(null)
  })

  it('accepts digits only in the nickname band (adjacent to the class row)', () => {
    // The line directly above the class band is where the client prints the
    // nickname, so "Ahrya123" is a readable name there (08.10).
    expect(parseBasicProfileText('Ahrya123\nJob Gypsy\nID 32980').nickname).toBe('Ahrya123')
    // A detached line with digits is still rejected (it could be a stat row).
    expect(parseBasicProfileText('Ahrya123\nHero\nJob Gypsy\nID 32980').nickname).toBe('Hero')
  })

  it('enforces the ID length bounds (3..12 digits, no truncation)', () => {
    expect(parseBasicProfileText('Ahrya\nID 12').char_id).toBe(null)
    expect(parseBasicProfileText('Ahrya\nID 123').char_id).toBe('123')
    expect(parseBasicProfileText('Ahrya\nID 123456789012').char_id).toBe('123456789012')
    expect(parseBasicProfileText('Ahrya\nID 1234567890123').char_id).toBe(null)
  })

  it('returns all-null for unreadable text (caller refuses the claim)', () => {
    expect(parseBasicProfileText('')).toEqual({ nickname: null, char_id: null, char_class: null })
    expect(parseBasicProfileText('~~~ ###').char_id).toBe(null)
  })

  it('never infers the build role (D-03/D-19)', () => {
    const parsed = parseBasicProfileText(SAMPLE)
    expect('char_function' in parsed).toBe(false)
  })
})

// 08.10 hotfix: the live client is pt-BR ("Classe Criador"). This is the exact
// identity block of the reported screenshot; before the fix the class was null
// for every localized print, which blocked first access with PROFILE_ERROR.
describe('parseBasicProfileText — pt-BR client sample', () => {
  const PT_BR = [
    'SoldierHelIz',
    'Classe Criador',
    'ID 17069',
    'Líder da Guilda Suprema',
    'PV 12944/12944',
    'PM 177/177',
    'Base Nv99 MAX/MAX',
    'Classe Nv40 0/5984',
    'Poder 318038',
  ].join('\n')

  it('reads nickname + ID + class from the reported pt-BR print', () => {
    expect(parseBasicProfileText(PT_BR)).toEqual({
      nickname: 'SoldierHelIz',
      char_id: '17069',
      char_class: 'Biochemist',
    })
  })

  it('survives a merged SPARSE_TEXT header band', () => {
    expect(parseBasicProfileText('SoldierHelIz Classe Criador ID 17069\nPoder 318038')).toEqual({
      nickname: 'SoldierHelIz',
      char_id: '17069',
      char_class: 'Biochemist',
    })
  })

  it('never reads the job-level row ("Classe Nv40") as the class', () => {
    expect(parseBasicProfileText('SoldierHelIz\nClasse Nv40 0/5984\nID 17069')).toMatchObject({
      char_class: null,
      char_id: '17069',
      nickname: 'SoldierHelIz',
    })
  })

  it('keeps the header class when the job-level row is emitted first', () => {
    const text = 'Classe Nv40 0/5984\nSoldierHelIz\nClasse Criador\nID 17069'
    expect(parseBasicProfileText(text).char_class).toBe('Biochemist')
  })

  it('accepts the Spanish label and class name', () => {
    expect(parseBasicProfileText('SoldierHelIz\nClase Creador\nID 17069')).toEqual({
      nickname: 'SoldierHelIz',
      char_id: '17069',
      char_class: 'Biochemist',
    })
  })

  it('ignores the copy-icon artifact between the name and the class band', () => {
    // Measured SPARSE_TEXT output of the real Samplebasicptbr.png (2026-10-22):
    // the copy/edit icon next to the name lands as its own "SN" line.
    const observed = [
      'Ahrya', '', 'SN', '', 'Classe Sumo Sacerdote', '', '1D 32980 E', '',
      'WHR Vibe sem Luka', '', 'rd', '', 'PV', '', '123101/123101', '', 'PM',
      '', 'Base/Nv99', '', 'mMaxmax Ig', '', 'Classe/Nv40', '', 'Poder',
    ].join('\n')
    expect(parseBasicProfileText(observed)).toEqual({
      nickname: 'Ahrya',
      char_id: '32980',
      char_class: 'High Priest',
    })
  })

  it('keeps a digit-bearing nickname from the band left of the label', () => {
    expect(parseBasicProfileText('Helz2010 Classe Criador\nID 17069').nickname).toBe('Helz2010')
  })

  it('never mistakes the localized guild title for the nickname', () => {
    expect(parseBasicProfileText('Líder da Guilda Suprema\nClasse Criador\nID 17069').nickname).toBe(
      null,
    )
  })

  it('ignores the screen tabs and OCR artifacts above the nickname band', () => {
    // "Básico / Detalhes" are the screen tabs, "BE" an edge artifact — the
    // nickname is the band adjacent to the class row, not the first line.
    expect(
      parseBasicProfileText('Básico\nDetalhes\nSoldierHelIz\nClasse Criador\nID 17069').nickname,
    ).toBe('SoldierHelIz')
    expect(parseBasicProfileText('BE\nSoldierHelIz\nClasse Criador\nID 17069').nickname).toBe(
      'SoldierHelIz',
    )
  })
})

describe('validateIdentity / validateIdentityDraft — editable identity', () => {
  const valid = {
    char_id: '32980',
    nickname: 'Ahrya',
    char_class: 'Gypsy',
    char_function: 'dps' as const,
  }

  it('accepts a complete identity and trims the text fields', () => {
    expect(
      validateIdentity({ ...valid, char_id: ' 32980 ', nickname: ' Ahrya ', char_class: 'Gypsy ' }),
    ).toEqual({ ok: true, identity: valid })
  })

  it('reports the first invalid field with pt-BR copy', () => {
    expect(validateIdentity({ ...valid, char_id: 'abc' })).toMatchObject({
      ok: false,
      field: 'char_id',
    })
    expect(validateIdentity({ ...valid, nickname: '' })).toMatchObject({
      ok: false,
      field: 'nickname',
    })
    expect(validateIdentity({ ...valid, char_class: 'Ninja' })).toMatchObject({
      ok: false,
      field: 'char_class',
    })
    expect(validateIdentity({ ...valid, char_function: undefined })).toMatchObject({
      ok: false,
      field: 'char_function',
    })
  })

  it('rejects an out-of-range ID and an over-long nickname', () => {
    expect(validateIdentity({ ...valid, char_id: '1234567890123' }).ok).toBe(false)
    expect(validateIdentity({ ...valid, nickname: 'x'.repeat(81) }).ok).toBe(false)
  })

  it('validateIdentityDraft returns [] when valid and ordered problems otherwise', () => {
    expect(validateIdentityDraft(valid)).toEqual([])

    const problems = validateIdentityDraft({
      char_id: '',
      nickname: '',
      char_class: 'Ninja',
      char_function: 'healer' as never,
    })
    expect(problems).toHaveLength(4)
    expect(problems[0]).toContain('ID')
    expect(problems[1]).toContain('nick')
    expect(problems[2]).toContain('classe')
    expect(problems[3]).toContain('função')
  })
})
