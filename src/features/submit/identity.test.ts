import { describe, expect, it } from 'vitest'
import {
  CHAR_FUNCTIONS,
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

  it('rejects digit-bearing candidate names', () => {
    expect(parseBasicProfileText('Ahrya123\nJob Gypsy\nID 32980').nickname).toBe(null)
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
