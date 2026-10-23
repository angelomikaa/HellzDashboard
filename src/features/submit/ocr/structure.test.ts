// Structural reader detection tests (architecture pivot, D-05-UAT round 3 —
// TDD RED). Pure functions over synthetic ImageData-shaped fixtures — no
// canvas, no DOM, no real screenshots (D-10: real samples never leave
// .secrets/ocr-samples/). Behavior source: scripts/ocr-spike-structural.mjs
// (commit 012956f — the proven strategy, ported verbatim).
import { describe, expect, it } from 'vitest'
import {
  DARK_LUMA_MAX,
  GAME_LABELS,
  GAME_LABELS_PT,
  PILL_CHROMA_MIN,
  SCREENS,
  VALUE_CHROMA_MAX,
  assignByOrder,
  detectPillRects,
  detectRowCells,
  fieldKeysFor,
  findColumnClusters,
  findSolidBands,
  findTextBands,
  mergeRuns,
  normalizeLabel,
  levenshtein,
  matchLabel,
  omittedZeroKeys,
  resolveConflicts,
  rowProfile,
  columnProfileInRange,
  upscaleForHeight,
  scoreLabelPair,
  type ImageDataLike,
  type Rect,
  type RowCell,
} from './structure'

/** Synthetic ImageData-shaped fixture helper (house pattern, preprocess.test.ts). */
function makeImg(width: number, height: number): ImageDataLike {
  return { data: new Uint8ClampedArray(width * height * 4), width, height }
}

function setPx(img: ImageDataLike, x: number, y: number, r: number, g: number, b: number): void {
  const i = (y * img.width + x) * 4
  img.data[i] = r
  img.data[i + 1] = g
  img.data[i + 2] = b
  img.data[i + 3] = 255
}

function fillRect(img: ImageDataLike, x0: number, x1: number, y0: number, y1: number, color: [number, number, number]): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPx(img, x, y, ...color)
}

describe('detection constants (spike calibration, verbatim)', () => {
  it('carries the proven thresholds', () => {
    expect(DARK_LUMA_MAX).toBe(140)
    expect(VALUE_CHROMA_MAX).toBe(60)
    expect(PILL_CHROMA_MIN).toBe(50)
  })
})

describe('mergeRuns', () => {
  it('merges vertical runs whose gap is within mergeGap', () => {
    expect(mergeRuns([{ top: 0, bottom: 5 }, { top: 6, bottom: 10 }], 2)).toEqual([{ top: 0, bottom: 10 }])
  })
  it('keeps vertical runs separated by more than mergeGap', () => {
    expect(mergeRuns([{ top: 0, bottom: 5 }, { top: 6, bottom: 10 }], 0)).toEqual([
      { top: 0, bottom: 5 },
      { top: 6, bottom: 10 },
    ])
  })
  it('works on horizontal orientation', () => {
    expect(mergeRuns([{ left: 0, right: 5 }, { left: 20, right: 30 }], 2)).toEqual([
      { left: 0, right: 5 },
      { left: 20, right: 30 },
    ])
    expect(mergeRuns([{ left: 0, right: 5 }, { left: 6, right: 10 }], 2)).toEqual([{ left: 0, right: 10 }])
  })
  it('returns empty for no runs', () => {
    expect(mergeRuns([], 2)).toEqual([])
  })
})

describe('rowProfile', () => {
  it('counts dark pixels per row below the luma threshold', () => {
    const img = makeImg(3, 3)
    fillRect(img, 0, 3, 0, 1, [255, 255, 255]) // luma 255 — excluded
    fillRect(img, 0, 3, 1, 2, [20, 24, 58]) // dark navy, luma ~26.7 — included
    fillRect(img, 0, 3, 2, 3, [150, 150, 150]) // luma 150 — excluded
    expect([...rowProfile(img, DARK_LUMA_MAX)]).toEqual([0, 3, 0])
  })
  it('applies the chroma mask when given (labels indigo excluded, values navy kept)', () => {
    const img = makeImg(2, 2)
    setPx(img, 0, 0, 20, 24, 58) // navy: chroma 38 < 60
    setPx(img, 1, 0, 99, 91, 255) // indigo: chroma 164 >= 60
    setPx(img, 0, 1, 99, 91, 255)
    setPx(img, 1, 1, 20, 24, 58)
    expect([...rowProfile(img, DARK_LUMA_MAX, VALUE_CHROMA_MAX)]).toEqual([1, 1])
    // without the chroma mask both dark pixels count
    expect([...rowProfile(img, DARK_LUMA_MAX)]).toEqual([2, 2])
  })
})

describe('columnProfileInRange', () => {
  it('counts masked pixels per column within the band rows', () => {
    const img = makeImg(4, 2)
    fillRect(img, 0, 4, 0, 2, [240, 236, 220]) // paper background (light — excluded)
    setPx(img, 1, 0, 20, 24, 58)
    setPx(img, 1, 1, 20, 24, 58)
    setPx(img, 3, 0, 20, 24, 58)
    expect([...columnProfileInRange(img, 0, 2, DARK_LUMA_MAX)]).toEqual([0, 2, 0, 1])
  })
})

describe('findTextBands', () => {
  it('finds text bands, heals only sub-median gaps, and drops solid blocks', () => {
    const counts = new Int32Array(40)
    for (let y = 2; y < 6; y++) counts[y] = 10 // text band 1 (h=4)
    for (let y = 12; y < 16; y++) counts[y] = 10 // text band 2 (h=4)
    for (let y = 24; y < 36; y++) counts[y] = 30 // solid block (h=12 > 2.5x median)
    // medianH=4 -> mergeGap=max(2, 2)=2; gaps 6 and 8 stay separate; cap=10
    expect(findTextBands(counts, 5)).toEqual([
      { top: 2, bottom: 6 },
      { top: 12, bottom: 16 },
    ])
  })
  it('merges glyph-level splits closer than 0.6x the median band height', () => {
    const counts = new Int32Array(20)
    for (let y = 2; y < 6; y++) counts[y] = 10
    for (let y = 8; y < 12; y++) counts[y] = 10 // gap 8-6 = 2 <= mergeGap 2
    expect(findTextBands(counts, 5)).toEqual([{ top: 2, bottom: 12 }])
  })
  it('returns empty when no row reaches minCount', () => {
    expect(findTextBands(new Int32Array(10), 5)).toEqual([])
  })
})

describe('findSolidBands', () => {
  it('merges only 1-row dips (antialiasing) and never height-caps', () => {
    const counts = new Int32Array(40)
    for (let y = 2; y < 6; y++) counts[y] = 10
    // row 6 is a 1-row dip
    for (let y = 7; y < 11; y++) counts[y] = 10
    for (let y = 20; y < 36; y++) counts[y] = 30 // taller than any text band — kept
    expect(findSolidBands(counts, 5)).toEqual([
      { top: 2, bottom: 11 },
      { top: 20, bottom: 36 },
    ])
  })
})

describe('findColumnClusters', () => {
  it('finds clusters, merges glyph gaps, and filters by minWidth', () => {
    const colCounts = new Int32Array(40)
    for (let x = 3; x < 7; x++) colCounts[x] = 5
    for (let x = 20; x < 25; x++) colCounts[x] = 3
    // bandH=10 -> mergeGap=max(1, round(3.5))=4; gaps 13 stay separate
    expect(findColumnClusters(colCounts, 0, 10, 1, 2)).toEqual([
      { left: 3, right: 7 },
      { left: 20, right: 25 },
    ])
    // minWidth 5 drops the 4-wide cluster, keeps the 5-wide one
    expect(findColumnClusters(colCounts, 0, 10, 1, 5)).toEqual([{ left: 20, right: 25 }])
  })
  it('merges clusters separated by less than 0.35x the band height', () => {
    const colCounts = new Int32Array(40)
    for (let x = 3; x < 7; x++) colCounts[x] = 5
    for (let x = 9; x < 13; x++) colCounts[x] = 5 // gap 9-7=2 <= mergeGap 4 (bandH 10)
    expect(findColumnClusters(colCounts, 0, 10, 1, 2)).toEqual([{ left: 3, right: 13 }])
  })
})

describe('upscaleForHeight (adaptive factor, spike semantics)', () => {
  it('lands the crop at ~72px tall, clamped 2..6', () => {
    expect(upscaleForHeight(15)).toBe(5) // 72/15 = 4.8 -> 5
    expect(upscaleForHeight(24)).toBe(3)
    expect(upscaleForHeight(10)).toBe(6) // 7.2 -> clamp 6
    expect(upscaleForHeight(100)).toBe(2) // 0.72 -> clamp 2
    expect(upscaleForHeight(0)).toBe(6)
  })
})

describe('screen grammar (the 56 shipped fields)', () => {
  it('encodes the game screens: general 7+7, quasi 13+13, special 15', () => {
    expect(SCREENS.basic.kind).toBe('pills')
    expect(SCREENS.general.left).toHaveLength(7)
    expect(SCREENS.general.right).toHaveLength(7)
    expect(SCREENS.quasi.left).toHaveLength(13)
    expect(SCREENS.quasi.right).toHaveLength(13)
    expect(SCREENS.special.left).toHaveLength(15)
    expect(SCREENS.special.right).toHaveLength(0)
  })
  it('fieldKeysFor yields exactly the 56 shipped fields with no duplicates', () => {
    const all = [
      ...fieldKeysFor('basic'),
      ...fieldKeysFor('general'),
      ...fieldKeysFor('quasi'),
      ...fieldKeysFor('special'),
    ]
    expect(all).toHaveLength(56)
    expect(new Set(all).size).toBe(56)
    expect(fieldKeysFor('basic')).toEqual(['combat_power'])
    expect(fieldKeysFor('general')[0]).toBe('hp')
    expect(fieldKeysFor('general')[13]).toBe('flee')
    expect(fieldKeysFor('special')).toHaveLength(15)
  })
  it('every grammar key has a game label', () => {
    for (const capture of ['general', 'quasi', 'special'] as const) {
      for (const key of fieldKeysFor(capture)) {
        expect(GAME_LABELS[key], `label for ${key}`).toBeTruthy()
      }
    }
  })
})

describe('tooltip grammar (Phase 9.1 raw-defense captures)', () => {
  it('pdef_tooltip reads Equipment PDEF into equip_pdef_raw', () => {
    expect(SCREENS.pdef_tooltip.kind).toBe('tooltip')
    expect(SCREENS.pdef_tooltip.label).toBe('Equipment PDEF')
    expect(SCREENS.pdef_tooltip.fieldKey).toBe('equip_pdef_raw')
    expect(fieldKeysFor('pdef_tooltip')).toEqual(['equip_pdef_raw'])
  })

  it('mdef_tooltip reads Equipment MDEF into equip_mdef_raw', () => {
    expect(SCREENS.mdef_tooltip.kind).toBe('tooltip')
    expect(SCREENS.mdef_tooltip.label).toBe('Equipment MDEF')
    expect(SCREENS.mdef_tooltip.fieldKey).toBe('equip_mdef_raw')
    expect(fieldKeysFor('mdef_tooltip')).toEqual(['equip_mdef_raw'])
  })

  it('the 56 screen fields are unchanged by the tooltip captures', () => {
    const all = [
      ...fieldKeysFor('basic'),
      ...fieldKeysFor('general'),
      ...fieldKeysFor('quasi'),
      ...fieldKeysFor('special'),
    ]
    expect(all).toHaveLength(56)
    expect(new Set(all).size).toBe(56)
    expect(fieldKeysFor('special')).toHaveLength(15)
  })
})

describe('label matching (fuzzy, spike semantics)', () => {
  it('normalizes to lowercase a-z only', () => {
    expect(normalizeLabel('Refine PATK')).toBe('refinepatk')
    expect(normalizeLabel('PvE DMG Reduction')).toBe('pvedmgreduction')
    expect(normalizeLabel(null)).toBe('')
  })
  it('computes Levenshtein distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', 'abc')).toBe(0)
  })
  it('scores: exact > containment > bounded distance; noise rejected', () => {
    expect(scoreLabelPair('HP', 'HP')).toBe(100)
    // left-truncated label: observed ⊂ expected (measured spike case)
    expect(scoreLabelPair('vE DMG Redu', 'PvE DMG Reduction')).toBe(90 - (15 - 9))
    // OCR noise: one insertion away (measured spike case) — containment
    // ("critdmgres".includes("ritdmgres")) wins over the distance path
    expect(scoreLabelPair('ritdmgres', 'CRIT DMG RES')).toBe(90 - 1)
    expect(scoreLabelPair('xyz', 'HP')).toBe(-Infinity)
  })
  it('matchLabel picks the best vocabulary key above the floor', () => {
    const match = matchLabel('CRIT DMG RE', ['crit_dmg_res', 'crit_dmg', 'crit_res'])
    expect(match?.key).toBe('crit_dmg_res')
    expect(matchLabel('zzzzzzz', ['crit_dmg_res', 'crit_dmg'])).toBeNull()
  })

  it('folds accents so localized labels compare in a-z space', () => {
    expect(normalizeLabel('PRECISÃO')).toBe('precisao')
    expect(normalizeLabel('CRÍT')).toBe('crit')
    expect(normalizeLabel('Bônus de Dano')).toBe('bonusdedano')
    expect(scoreLabelPair('PRECISAO', 'PRECISÃO')).toBe(100)
  })

  it('a near-exact long label beats a short label merely contained in the read', () => {
    // Measured pt-BR case: the clipped "ATQM (Refino" reads "ATQM Refinc".
    // "ATQM" is contained in it, but the Refino row must keep refine_matk.
    expect(scoreLabelPair('ATQM Refinc', 'ATQM (Refino)')).toBeGreaterThan(
      scoreLabelPair('ATQM Refinc', 'ATQM'),
    )
    expect(matchLabel('ATQM Refinc', ['matk', 'refine_matk'])?.key).toBe('refine_matk')
  })

  it('recovers a label whose middle is occluded by an icon (shape fallback)', () => {
    // Measured pt-BR case: a check glyph over "Humanoide%" reads
    // "HumMwmaitieY"; every other special label scores far lower.
    const vocab = [
      'dmg_reduction_vs_small',
      'dmg_reduction_vs_brute',
      'dmg_reduction_vs_demi_human',
    ]
    expect(matchLabel('Reducao de Dano x HumMwmaitieY', vocab)?.key).toBe(
      'dmg_reduction_vs_demi_human',
    )
  })
})

describe('pt-BR client labels (localized Details screens)', () => {
  it('covers the Atributos Comuns and Especial rows — the label-mode captures', () => {
    for (const key of fieldKeysFor('general')) {
      expect(GAME_LABELS_PT[key], `pt label for ${key}`).toBeTruthy()
    }
    for (const key of fieldKeysFor('special')) {
      expect(GAME_LABELS_PT[key], `pt label for ${key}`).toBeTruthy()
    }
  })

  it('leaves the four clipped PvE/PvP quasi rows to order mode', () => {
    // Their pt rows clip to "…ção de Dano J…" where an icon glyph lands, so no
    // transcription is trustworthy; the 13+13 quasi capture assigns by order.
    for (const key of ['pve_dmg_reduction', 'pve_dmg_bonus', 'pvp_dmg_reduction', 'pvp_dmg_bonus']) {
      expect(GAME_LABELS_PT[key]).toBeUndefined()
    }
  })

  it('every localized label matches its own key inside its side vocabulary', () => {
    for (const capture of ['general', 'quasi', 'special'] as const) {
      const grammar = SCREENS[capture]
      if (grammar.kind !== 'rows') throw new Error(`${capture} is not a rows grammar`)
      const vocabs = grammar.columns === 2 ? [grammar.left, grammar.right] : [grammar.left]
      for (const vocab of vocabs) {
        for (const key of vocab) {
          const label = GAME_LABELS_PT[key]
          if (!label) continue
          expect(matchLabel(label, vocab)?.key, `${capture}: "${label}" should be ${key}`).toBe(key)
        }
      }
    }
  })
})

describe('omittedZeroKeys (the Especial panel hides zero-valued rows)', () => {
  const specialGrammar = () => {
    const grammar = SCREENS.special
    if (grammar.kind !== 'rows') throw new Error('special is not a rows grammar')
    return grammar
  }

  it('infers an interior missing row as zero (TdR Global% 0 → no line)', () => {
    const grammar = specialGrammar()
    const matched = grammar.left.filter((key) => key !== 'global_cd_pct')
    expect(omittedZeroKeys(grammar, matched)).toEqual(['global_cd_pct'])
  })

  it('infers both interior brute rows when a shot skips them', () => {
    const grammar = specialGrammar()
    const matched = grammar.left.filter(
      (key) => key !== 'dmg_vs_brute' && key !== 'dmg_reduction_vs_brute',
    )
    expect(omittedZeroKeys(grammar, matched)).toEqual(['dmg_vs_brute', 'dmg_reduction_vs_brute'])
  })

  it('never infers at the edges: a cropped/scrolled shot keeps those failed', () => {
    const grammar = specialGrammar()
    // samppt1-style: the Especial list is cut off after Dano x Inimigo Grande.
    const matched = grammar.left.slice(0, grammar.left.indexOf('dmg_vs_large') + 1)
    expect(omittedZeroKeys(grammar, matched)).toEqual([])
  })

  it('infers nothing when a rendered row could not be placed', () => {
    const grammar = specialGrammar()
    const matched = grammar.left.filter((key) => key !== 'global_cd_pct')
    expect(omittedZeroKeys(grammar, matched, 1)).toEqual([])
  })

  it('leaves the columns that DO print their zeros alone', () => {
    const general = SCREENS.general
    if (general.kind !== 'rows') throw new Error('general is not a rows grammar')
    expect(general.omitsZeroRows).toBeUndefined()
    expect(omittedZeroKeys(general, ['hp'])).toEqual([])
  })
})

/** Two-band two-column synthetic Details screen: labels indigo, values dark
 * navy, cream paper — the game's measured rendering (probe-confirmed). */
function rowsScreenFixture(): ImageDataLike {
  const img = makeImg(120, 40)
  fillRect(img, 0, 120, 0, 40, [240, 236, 220]) // cream paper
  for (const top of [8, 26]) {
    fillRect(img, 10, 25, top, top + 10, [99, 91, 255]) // left label (indigo)
    fillRect(img, 40, 56, top, top + 10, [20, 24, 58]) // left value (navy)
    fillRect(img, 70, 85, top, top + 10, [99, 91, 255]) // right label
    fillRect(img, 100, 116, top, top + 10, [20, 24, 58]) // right value
  }
  return img
}

const ROWS_GRAMMAR = { columns: 2 as const, left: ['hp', 'patk'], right: ['sp', 'pdef'] }

describe('detectRowCells (text-band + chroma-separated value clusters)', () => {
  const cells = detectRowCells(rowsScreenFixture(), ROWS_GRAMMAR)

  it('finds one cell per side per band (4 cells)', () => {
    expect(cells).toHaveLength(4)
    expect(cells.filter((c) => c.side === 'L')).toHaveLength(2)
    expect(cells.filter((c) => c.side === 'R')).toHaveLength(2)
  })
  it('locates value rects on the value clusters (2px pad, band height + 4)', () => {
    const left = cells.filter((c) => c.side === 'L')
    expect(left[0].valueRect).toEqual({ left: 38, top: 6, width: 20, height: 14 })
    expect(left[0].bandTop).toBe(8)
    const right = cells.filter((c) => c.side === 'R')
    expect(right[0].valueRect).toEqual({ left: 98, top: 6, width: 20, height: 14 })
  })
  it('locates label rects strictly left of the value inside the cell', () => {
    const left = cells.filter((c) => c.side === 'L')
    expect(left[0].labelRect).toEqual({ left: 8, top: 6, width: 19, height: 14 })
    expect(left[0].labelRect!.left + left[0].labelRect!.width).toBeLessThanOrEqual(left[0].valueRect.left)
  })
  it('splits columns at the content midline (right values only in the right cell)', () => {
    const right = cells.filter((c) => c.side === 'R')
    // the left value cluster (center 48 < midX 63) must never land in a right cell
    for (const c of right) expect(c.valueRect.left).toBeGreaterThanOrEqual(63)
  })
  it('returns no cells on a blank (paper) image', () => {
    const blank = makeImg(60, 30)
    fillRect(blank, 0, 60, 0, 30, [240, 236, 220])
    expect(detectRowCells(blank, ROWS_GRAMMAR)).toEqual([])
  })
})

describe('assignByOrder (fixed-row-order fallback when band counts match exactly)', () => {
  it('maps cells to grammar keys by row order per side', () => {
    const cells = detectRowCells(rowsScreenFixture(), ROWS_GRAMMAR)
    const assignments = assignByOrder(cells, ROWS_GRAMMAR)
    expect(assignments).not.toBeNull()
    const byKey = new Map(assignments!.map((a) => [a.key, a.cell]))
    expect(byKey.get('hp')!.side).toBe('L')
    expect(byKey.get('hp')!.bandTop).toBe(8)
    expect(byKey.get('patk')!.side).toBe('L')
    expect(byKey.get('patk')!.bandTop).toBe(26)
    expect(byKey.get('sp')!.side).toBe('R')
    expect(byKey.get('sp')!.bandTop).toBe(8)
    expect(byKey.get('pdef')!.side).toBe('R')
    expect(byKey.get('pdef')!.bandTop).toBe(26)
    for (const a of assignments!) expect(a.labelScore).toBe(100)
  })
  it('returns null when band counts do not match the grammar (label mode required)', () => {
    const cells = detectRowCells(rowsScreenFixture(), ROWS_GRAMMAR)
    expect(assignByOrder(cells, { columns: 2, left: ['a', 'b', 'c'], right: ['d'] })).toBeNull()
    expect(assignByOrder([], ROWS_GRAMMAR)).toBeNull()
  })
})

describe('resolveConflicts (better label score wins; ties keep the bottom band)', () => {
  function cell(bandTop: number): RowCell {
    return { side: 'L', valueRect: { left: 0, top: bandTop, width: 1, height: 1 }, labelRect: null, bandTop }
  }
  it('higher label score wins regardless of band position', () => {
    const map = resolveConflicts([
      { key: 'crit', cell: cell(10), labelScore: 82 },
      { key: 'crit', cell: cell(30), labelScore: 89 },
    ])
    expect(map.get('crit')!.cell.bandTop).toBe(30)
  })
  it('ties keep the BOTTOM band (Max HP / Max SP adjacency case)', () => {
    const map = resolveConflicts([
      { key: 'max_hp_pct', cell: cell(10), labelScore: 82 },
      { key: 'max_hp_pct', cell: cell(30), labelScore: 82 },
    ])
    expect(map.get('max_hp_pct')!.cell.bandTop).toBe(30)
  })
})

/** Basic screen fixture: a saturated pill with white text on cream paper,
 * plus indigo label-halo columns left of it (the 1.5x-rescale hazard). */
function pillFixture(color: [number, number, number]): ImageDataLike {
  const img = makeImg(100, 30)
  fillRect(img, 0, 100, 0, 30, [240, 236, 220]) // cream paper
  fillRect(img, 20, 80, 10, 21, color) // pill fill rows 10..20
  fillRect(img, 40, 60, 13, 18, [255, 255, 255]) // white text
  fillRect(img, 5, 9, 10, 21, [142, 164, 208]) // label halo (chroma 66 >= 50)
  return img
}

describe('detectPillRects (color-saturation pills, dominant-mass anchoring)', () => {
  it('locates the white-text crop of the saturated pill', () => {
    const rects = detectPillRects(pillFixture([0, 200, 80]))
    expect(rects).toHaveLength(1)
    expect(rects[0]).toEqual({ left: 38, top: 11, width: 24, height: 9 })
  })
  it('anchors the extent on the DOMINANT saturated mass (the 15%-of-widest fix)', () => {
    // the w=4 halo runs 318px-scale left of the pill must NOT drag the extent
    const rects = detectPillRects(pillFixture([0, 200, 80]))
    expect(rects[0].left).toBeGreaterThanOrEqual(20)
  })
  it('excludes the unsaturated gray Job pill', () => {
    expect(detectPillRects(pillFixture([128, 128, 128]))).toEqual([])
  })
  it('orders pills bottom-most first (combat_power is the lowest pill)', () => {
    const img = pillFixture([0, 200, 80])
    fillRect(img, 20, 80, 2, 7, [0, 200, 80]) // second, higher pill
    fillRect(img, 40, 60, 3, 6, [255, 255, 255])
    const rects = detectPillRects(img)
    expect(rects).toHaveLength(2)
    expect(rects[0].top).toBeGreaterThan(rects[1].top)
  })
})

describe('rect types', () => {
  it('Rect uses left/top/width/height (spike crop semantics)', () => {
    const rect: Rect = { left: 1, top: 2, width: 3, height: 4 }
    expect(rect.left).toBe(1)
  })
})
