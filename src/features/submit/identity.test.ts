import { describe, expect, it } from 'vitest'
import {
  CHAR_FUNCTIONS,
  CLASS_ALIASES,
  OFFICIAL_CLASSES,
  charIdFromText,
  classLabelWord,
  idFromLayout,
  identityRescueRects,
  matchClassName,
  nicknameFromBandText,
  nicknameFromLayout,
  parseBasicProfileText,
  validateIdentity,
  validateIdentityDraft,
  type OcrWord,
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
    expect(matchClassName('Invocador')).toBe('Summoner')
    // base classes follow the same rename rule as the English containment
    expect(matchClassName('Cavaleiro')).toBe('Lord Knight')
    expect(matchClassName('Alquimista')).toBe('Biochemist')
    expect(matchClassName('Mercenário')).toBe('Assassin Cross')
    expect(matchClassName('Discípulo')).toBe('Summoner')
  })

  it('maps the Gunslinger line prints to Rebellion (owner-confirmed 2026-10-23)', () => {
    // The official web API leaves this line untranslated, but the pt-BR game
    // client prints Justiceiro (base) / Vigia (Sentry) / Insurgente (Trans 2ª).
    expect(matchClassName('Insurgente')).toBe('Rebellion')
    expect(matchClassName('Justiceiro')).toBe('Rebellion')
    expect(matchClassName('Vigia')).toBe('Rebellion')
    // "Futuro Invocador" resolves through the Invocador alias containment
    expect(matchClassName('Futuro Invocador')).toBe('Summoner')
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

// 08.10 hotfix (2026-10-22): a real capture prefilled the nickname with the
// fragment "dh" — a crop had cut the name open and the text parser took any
// short line as a name. The nickname is now decided from the card's LAYOUT:
// the game prints it LEFT-ALIGNED with the class label directly below it.
// Word boxes below are the measured tesseract `blocks` output of the real
// samples (`.secrets/ocr-samples`, gitignored) and of the owner's capture.
describe('nicknameFromLayout — the name is the band left-aligned above the class label', () => {
  const at = (text: string, x0: number, y0: number, x1: number, y1: number): OcrWord => ({
    text,
    x0,
    y0,
    x1,
    y1,
  })

  // sampidentityaryah.jpg (725x341), the owner-reported capture: "Aryah"@169
  // sits 1px right of "Classe"@170. The portrait edge ("i", "ay", "0") is noise.
  it('reads the owner-reported capture', () => {
    const words = [
      at('ay', 104, 31, 153, 48),
      at('0', 137, 27, 157, 52),
      at('i', 130, 49, 146, 79),
      at('Aryah', 169, 25, 245, 56),
      at('Classe', 170, 71, 245, 93),
      at('Sumo', 277, 73, 328, 90),
      at('Sacerdote', 338, 72, 432, 90),
      at('1D', 476, 73, 498, 91),
      at('39943Z', 505, 66, 607, 93),
    ]
    expect(nicknameFromLayout(words, 725)).toEqual({ anchored: true, nickname: 'Aryah' })
  })

  // Same capture cropped to the card header: SPARSE_TEXT split the name into
  // "A" + "ryah" and the portrait frame pulled "C" into the band.
  it('glues a name the OCR split in two and ignores the frame blob', () => {
    const words = [
      at('C', 15, 9, 153, 49),
      at('gl', 130, 49, 146, 76),
      at('A', 169, 26, 188, 48),
      at('ryah', 190, 25, 245, 56),
      at('Classe', 170, 71, 245, 93),
      at('Sumo', 277, 73, 332, 90),
      at('Sacerdote', 338, 72, 432, 90),
    ]
    expect(nicknameFromLayout(words, 725)).toEqual({ anchored: true, nickname: 'Aryah' })
  })

  // Samplebasicptbr.png (707x345): the copy/edit badge prints as "SN" right
  // next to the name — short, so it is dropped instead of becoming "Ahrya SN".
  it('discards the edit-pencil badge printed beside the name', () => {
    const words = [
      at('Ahrya', 167, 32, 244, 63),
      at('SN', 253, 53, 288, 67),
      at('Classe', 168, 78, 243, 100),
      at('Sumo', 275, 80, 330, 97),
      at('Sacerdote', 336, 79, 430, 97),
    ]
    expect(nicknameFromLayout(words, 707)).toEqual({ anchored: true, nickname: 'Ahrya' })
  })

  // sampbasicideal.png (691x416) — the English "Job" label.
  it('anchors on the English label too', () => {
    const words = [
      at('MA', 58, 113, 76, 126),
      at('Ahrya', 158, 104, 235, 135),
      at('Job', 157, 150, 197, 176),
      at('Gypsy', 266, 152, 334, 178),
    ]
    expect(nicknameFromLayout(words, 691)).toEqual({ anchored: true, nickname: 'Ahrya' })
  })

  it('never prefills a fragment of a name the crop cut open', () => {
    // Only the tail of the name survived and the class band is out of frame:
    // there is nothing to anchor on, so the text parser must stay silent
    // (strict shape: 3 letters, capitalised when unanchored).
    expect(nicknameFromLayout([at('ryah', 0, 25, 55, 56)], 140)).toEqual({
      anchored: false,
      nickname: null,
    })
    expect(parseBasicProfileText('ryah\nID 39943').nickname).toBe(null)
    expect(parseBasicProfileText('dh\nID 39943').nickname).toBe(null)

    // Same fragment WITH the class band: the name no longer starts where the
    // label starts, so the layout refuses it instead of prefilling "ryah".
    const cut = [at('ryah', 20, 25, 75, 56), at('Classe', 0, 71, 75, 93)]
    expect(nicknameFromLayout(cut, 140)).toEqual({ anchored: true, nickname: null })
  })

  it('keeps a two-word nickname apart and refuses OCR noise', () => {
    const words = [
      at('Dark', 30, 20, 95, 50),
      at('Knight', 108, 20, 190, 50),
      at('Classe', 30, 66, 130, 88),
    ]
    expect(nicknameFromLayout(words, 300)).toEqual({ anchored: true, nickname: 'Dark Knight' })

    const noise = [at('y Arvah /', 20, 20, 120, 50), at('Classe', 20, 66, 90, 88)]
    expect(nicknameFromLayout(noise, 300)).toEqual({ anchored: true, nickname: null })
  })
})

describe('idFromLayout — the ID is the number printed right of the class value', () => {
  const at = (text: string, x0: number, y0: number, x1: number, y1: number): OcrWord => ({
    text,
    x0,
    y0,
    x1,
    y1,
  })

  // The owner-reported capture (2026-10-23, sold.jpg 739x447): SPARSE_TEXT
  // read "ID 17069" as the single word "1017069E" (label I->"1", D->"0", copy
  // badge -> "E", box 42px tall vs the label's 23px). The text parse cannot
  // split it — that is WHY this layout rescue exists.
  it('rescues the merged-label row the text parse cannot see', () => {
    expect(parseBasicProfileText('Classe Criador\n1017069E').char_id).toBe(null)
    const words = [
      at('A', 119, 103, 139, 149),
      at('SoldierHellz', 181, 118, 353, 144),
      at('Z', 369, 115, 395, 155),
      at('Classe', 180, 166, 260, 189),
      at('Criador', 294, 166, 385, 189),
      at('1017069E', 505, 156, 650, 198),
      at('ETT', 167, 187, 221, 245),
      at('RAPP', 230, 187, 361, 245),
      at('Poder', 43, 391, 112, 411),
    ]
    expect(idFromLayout(words)).toBe('17069')
  })

  // sampidentityaryah.jpg (725x341): the label survived as its own word
  // ("1D", the documented I/l/1 slip) and the badge printed as "Z".
  it('reads the separate label word and strips the copy badge', () => {
    const words = [
      at('Aryah', 169, 25, 245, 56),
      at('Classe', 170, 71, 245, 93),
      at('Sumo', 277, 73, 332, 90),
      at('Sacerdote', 338, 72, 432, 90),
      at('1D', 476, 73, 498, 91),
      at('39943Z', 505, 66, 607, 93),
    ]
    expect(idFromLayout(words)).toBe('39943')
  })

  it('accepts a bare number and the O->0 digit slip', () => {
    const words = [
      at('Classe', 170, 71, 245, 93),
      at('Sacerdote', 338, 72, 432, 90),
      at('39943E', 505, 66, 607, 93),
    ]
    expect(idFromLayout(words)).toBe('39943')

    const slipped = [
      at('Classe', 170, 71, 245, 93),
      at('1O39943E', 505, 66, 607, 93),
    ]
    expect(idFromLayout(slipped)).toBe('39943')
  })

  it('never scavenges numbers outside the class band', () => {
    // A power value starting "10…" on a stat row FAR BELOW the band, and a
    // digit-bearing nickname ABOVE it, are positional non-IDs: the geometry
    // gate is what makes the label-pair strip safe.
    const words = [
      at('10777Hellz', 181, 118, 353, 144),
      at('Classe', 180, 166, 260, 189),
      at('Criador', 294, 166, 385, 189),
      at('Poder', 43, 391, 112, 411),
      at('10398392', 150, 391, 300, 411),
    ]
    expect(idFromLayout(words)).toBe(null)
  })

  it('refuses the unread and the overlong (D-03: never guess)', () => {
    // No class band to anchor on.
    expect(idFromLayout([at('1017069E', 505, 156, 650, 198)])).toBe(null)
    // A label word with no number after it.
    expect(
      idFromLayout([at('Classe', 180, 166, 260, 189), at('Criador', 294, 166, 385, 189), at('1D', 505, 166, 527, 189)]),
    ).toBe(null)
    // 13+ digits is not an ID printed by the client (the text pattern's cap).
    expect(
      idFromLayout([at('Classe', 180, 166, 260, 189), at('101234567890123', 505, 166, 650, 189)]),
    ).toBe(null)
    // Two glyphs of junk with no number.
    expect(idFromLayout([at('Classe', 180, 166, 260, 189), at('10', 505, 166, 541, 189)])).toBe(null)
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

// --- Mobile-capture rescue (owner report 2026-10-25: caladoh.jpg) --------

describe('classLabelWord — the rescue anchor', () => {
  it('finds the topmost class-label word among the boxes', () => {
    const words: OcrWord[] = [
      { text: 'Invocador', x0: 243, y0: 188, x1: 352, y1: 206 },
      { text: 'Classe', x0: 142, y0: 187, x1: 212, y1: 206 },
      { text: 'Nv40', x0: 104, y0: 353, x1: 169, y1: 373 },
    ]
    expect(classLabelWord(words)?.text).toBe('Classe')
  })

  it('returns null when no label exists (a cut-open crop has no anchor — the rescue must not fire)', () => {
    expect(classLabelWord([{ text: 'ryah', x0: 0, y0: 190, x1: 60, y1: 220 }])).toBeNull()
  })
})

describe('identityRescueRects — calibrated on both layouts', () => {
  it('the monitor corpus layout (Ahrya/Job at the 715 operating space): the name band contains the name, excludes the label row', () => {
    // sampbasicideal: "Ahrya"@158..135, "Job"@157,150..176 (measured)
    const rects = identityRescueRects(
      { text: 'Job', x0: 157, y0: 150, x1: 197, y1: 176 },
      715,
      454,
    )
    // Ahrya @158..235 x 104..135 must sit inside the name rect
    expect(rects.name.left).toBeLessThanOrEqual(158)
    expect(rects.name.top).toBeLessThanOrEqual(104)
    expect(rects.name.left + rects.name.width).toBeGreaterThanOrEqual(235)
    expect(rects.name.top + rects.name.height).toBeLessThan(150) // stops above the label
    // "ID 32980" (printed right of the class value on the band) must fit the row rect
    expect(rects.classRow.left).toBeLessThanOrEqual(157)
    expect(rects.classRow.top).toBeLessThanOrEqual(150)
    expect(rects.classRow.top + rects.classRow.height).toBeGreaterThanOrEqual(176)
  })

  it('the owner mobile capture (Caladoh at 985 native): the bands cover the measured words', () => {
    // caladoh.jpg: label "Classe"@195.6,257.8..292,284; name "Caladoh"@204..385,196..230;
    // ID row 586..713 @257..281 (measured 2026-10-25)
    const rects = identityRescueRects(
      { text: 'Classe', x0: 195.6, y0: 257.8, x1: 292.1, y1: 284 },
      985,
      625,
    )
    expect(rects.name.left).toBeLessThanOrEqual(204)
    expect(rects.name.top).toBeLessThanOrEqual(196)
    expect(rects.name.left + rects.name.width).toBeGreaterThanOrEqual(385)
    expect(rects.name.top + rects.name.height).toBeLessThan(257.8) // excludes the label row
    expect(rects.classRow.left).toBeLessThanOrEqual(195.6)
    expect(rects.classRow.left + rects.classRow.width).toBeGreaterThanOrEqual(713)
    expect(rects.classRow.top).toBeLessThanOrEqual(257)
    expect(rects.classRow.top + rects.classRow.height).toBeGreaterThanOrEqual(281)
  })

  it('clamps to the canvas (a label near an edge never crops outside)', () => {
    const rects = identityRescueRects({ text: 'Job', x0: 2, y0: 4, x1: 20, y1: 12 }, 100, 60)
    expect(rects.name.left).toBe(0)
    expect(rects.name.top).toBe(0)
    expect(rects.name.left + rects.name.width).toBeLessThanOrEqual(100)
    expect(rects.classRow.top + rects.classRow.height).toBeLessThanOrEqual(60)
  })
})

describe('nicknameFromBandText — exactly one strict candidate (D-03)', () => {
  it('adopts the single name-shaped token (measured mobile band read: "3 Caladoh #")', () => {
    expect(nicknameFromBandText('3 Caladoh #')).toBe('Caladoh')
    expect(nicknameFromBandText('Caladoh Z.')).toBe('Caladoh')
    expect(nicknameFromBandText('Caladoh Zz')).toBe('Caladoh')
  })

  it('refuses when nothing passes the nickname shape (never a fragment prefill)', () => {
    expect(nicknameFromBandText('py E')).toBeNull()
    expect(nicknameFromBandText('')).toBeNull()
  })

  it('refuses when two tokens could be the name (a multi-word name is typed, never half-prefilled)', () => {
    expect(nicknameFromBandText('Zephyr Auren #')).toBeNull()
  })

  it('never takes a class name as the nickname', () => {
    expect(nicknameFromBandText('Invocador #')).toBeNull()
  })
})

describe('charIdFromText — the rescue row parser (glued mobile forms)', () => {
  it('reads the labeled form (monitor row: "Classe Criador ID 17069")', () => {
    expect(charIdFromText('Classe Criador ID 17069')).toBe('17069')
  })

  it('splits the glued mobile form (measured at 1478px: "Classe Invocador  1D55934Z")', () => {
    expect(charIdFromText('Classe Invocador  1D55934Z')).toBe('55934')
  })

  it('reads the bare digits form (native row: "¥ Classe Invocador ID 55934 =")', () => {
    expect(charIdFromText('Classe Invocador ID 55934')).toBe('55934')
  })

  it('refuses rows with no ID shape (never invents a number)', () => {
    expect(charIdFromText('Classe Invocador')).toBeNull()
    expect(charIdFromText('')).toBeNull()
  })
})
