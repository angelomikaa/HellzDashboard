#!/usr/bin/env node
/**
 * NeoFoot STRUCTURAL OCR spike — Phase 5 architecture pivot (owner directive,
 * 2026-10-12, verbatim in 05-UAT.md round 3: "we need a reading model that
 * actually can read data from an image without relying on a pixel map").
 *
 * Replaces the pixel-fraction region-map reading strategy (regions.ts) with a
 * STRUCTURAL reader that locates values by the panel's visual grammar and is
 * therefore invariant to image scale, panel translation, and extra margins:
 *
 *   Basic screen (sampbasic): value PILLS detected by color saturation
 *   (HP green / SP cyan / Base violet / Job gray / Power gradient). The gray
 *   Job pill is excluded by the saturation mask; every detected pill is OCR'd
 *   with the digits whitelist and combat_power = the BOTTOM-MOST pill whose
 *   read parses as a flat number inside sanity (content gating: HP/SP pills
 *   read "N/N" and unparseable under the digits whitelist; Base reads
 *   "MAX/MAX"; only Power yields a sane plain number).
 *
 *   Details screens (sampideal1-3, samp1-7): label/value text rows. Text row
 *   BANDS are detected by a dark-pixel row profile (luma threshold); within a
 *   band, value clusters are the LOW-CHROMA dark clusters (values render dark
 *   navy; labels render indigo — chroma separates them; light-blue chevrons
 *   and blue header bars are excluded by the same mask). Two-column screens
 *   split at the content midline; the value is the rightmost cluster per cell
 *   (values are right-aligned by the game UI), the label is the text left of
 *   it. Keys map from OCR'd labels via a fuzzy match against the screen's
 *   known game-label vocabulary (with a fixed-row-order fallback when the
 *   band count matches the expected row count exactly, which skips label OCR
 *   entirely). Missing/extra sections (scroll mixtures) simply don't match.
 *
 * Every value crop goes through the PROVEN recognition core (the 05-01
 * spike's recipe, verbatim semantics): grayscale -> upscale (adaptive factor,
 * cubic) -> normalize -> threshold(140) -> dual polarity -> digits-whitelist
 * Tesseract read -> best-read scoring (parseable > non-empty > confidence).
 *
 * Proof grid (the pivot's acceptance bar):
 *   F  native      all 11 samples at native size — the 56 shipped fields
 *                  (4 canonical captures) must read EXACTLY; samp1-7 run as
 *                  evidence with the merged full vocabulary.
 *   G  rescale     the 4 canonical samples at 0.6x / 0.75x / 1.25x / 1.5x
 *                  (simulating other window sizes) — must still read exactly.
 *   H  loose crop  the 4 canonical samples padded with synthetic plain
 *                  margins (5-20% borders on various sides, white/gray/dark)
 *                  — must still read exactly (the reader must locate the
 *                  panel grammar, not assume full-bleed).
 *
 * D-10 discipline: real screenshots live ONLY in the gitignored
 * .secrets/ocr-samples/ — they never enter git or the network. This script
 * contains no image data and refuses to run without the samples.
 *
 * Usage:
 *   node scripts/ocr-spike-structural.mjs              full F/G/H proof grid
 *   node scripts/ocr-spike-structural.mjs --probe      color-statistics probe (threshold calibration aid)
 *   node scripts/ocr-spike-structural.mjs --diag <file> [capture]  per-band detection diagnostics
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const SAMPLES_DIR = path.resolve(__dirname, '..', '.secrets', 'ocr-samples')
const EXPECTED_PATH = path.join(SAMPLES_DIR, 'expected.json')

/** Digits whitelist — the 05-01 spike tuning, verbatim. */
const DIGITS_WHITELIST = '0123456789.,%-'
/** Letters whitelist for label reads (game labels are English words). */
const LABELS_WHITELIST = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ '

// ---------------------------------------------------------------------------
// Threshold calibration (derived from --probe on the real samples; the game
// renders labels indigo, values dark navy, chevrons/headers light-mid blue on
// a cream panel — all confirmed by probe output).
// ---------------------------------------------------------------------------
const DARK_LUMA_MAX = 140 // text pixels: labels + values (header-bar blue ~149, chevrons ~172 excluded)
const VALUE_CHROMA_MAX = 60 // value pixels: low-chroma dark navy (labels indigo excluded)
const PILL_CHROMA_MIN = 50 // pill pixels: saturated pill fills (gray Job pill excluded)
// Pill text: WHITE glyphs on a saturated gradient fill. Measured on sampbasic
// (probe): pill fill luma concentrates 128..208, the white text sits 240..256 —
// a HIGH threshold (180) isolates the glyphs, while the 05-01 normalize+140
// recipe binarizes the gradient into hollow outlines and reads nothing.
const PILL_TEXT_LUMA_MIN = 210 // white-text column extent (fill max ~208, text ~240+)
const PILL_THRESHOLD = 180 // binarization threshold for pill crops
const PILL_TEXT_PAD_FRAC = 0.12 // pad the white-text extent each side (fraction of its width)
/** Digits whitelist + '/': N/N pills (HP 99716/99716, Job 0/5984267) keep their
 * slash so parseValue REJECTS them (it allows only [\d.,%-]) — the content gate
 * that picks the Power pill among same-shaped white-on-fill reads. */
const PILL_DIGITS_WHITELIST = '0123456789.,%-/'
/** Panel paper mask: the cream panel (luma > 200, chroma < 40) — locates the
 * panel rectangle under arbitrary surrounding background (white/gray/dark). */
const PAPER_LUMA_MIN = 200
const PAPER_CHROMA_MAX = 40

// ---------------------------------------------------------------------------
// Pure detection helpers (the future src/features/submit/ocr/structure.ts —
// every function here is DOM-free and side-effect-free).
// ---------------------------------------------------------------------------

/** ITU-R 601 luma of one RGBA pixel. */
export function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** Chroma (max-min channel spread) of one RGBA pixel. */
export function chroma(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b)
}

export function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Row profile of "text" pixels: count of pixels per row whose luma is below
 * `lumaMax` (and, when `chromaMax` is not null, whose chroma is also below it).
 */
export function rowProfile(img, lumaMax, chromaMax = null) {
  const counts = new Int32Array(img.height)
  const { data, width, height } = img
  for (let y = 0; y < height; y++) {
    let count = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (luma(data[i], data[i + 1], data[i + 2]) < lumaMax) {
        if (chromaMax === null || chroma(data[i], data[i + 1], data[i + 2]) < chromaMax) count++
      }
    }
    counts[y] = count
  }
  return counts
}

/**
 * Merge adjacent [start,end) runs whose gap is at most `mergeGap`. Works on
 * both run orientations: vertical {top,bottom} and horizontal {left,right}.
 */
export function mergeRuns(runs, mergeGap) {
  if (runs.length === 0) return []
  const a = 'top' in runs[0] ? 'top' : 'left'
  const b = 'top' in runs[0] ? 'bottom' : 'right'
  const merged = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && run[a] - last[b] <= mergeGap) last[b] = run[b]
    else merged.push({ [a]: run[a], [b]: run[b] })
  }
  return merged
}

/**
 * Text row bands from a row profile: maximal runs of rows with
 * count >= minCount, then merged when separated by < 0.6x the median band
 * height (heals glyph-level splits like a detached '%' or descenders), then
 * filtered: bands taller than 2.5x the median height are solid blocks
 * (uniform dark margins / header bars), not text rows.
 */
export function findTextBands(counts, minCount) {
  const runs = []
  let start = -1
  for (let y = 0; y < counts.length; y++) {
    if (counts[y] >= minCount) {
      if (start < 0) start = y
    } else if (start >= 0) {
      runs.push({ top: start, bottom: y })
      start = -1
    }
  }
  if (start >= 0) runs.push({ top: start, bottom: counts.length })
  if (runs.length === 0) return []
  const medianH = median(runs.map((r) => r.bottom - r.top))
  const merged = mergeRuns(runs, Math.max(2, Math.round(0.6 * medianH)))
  const heightCap = 2.5 * medianH
  return merged.filter((b) => b.bottom - b.top <= heightCap)
}

/**
 * Solid bands (pills): maximal runs of rows with count >= minCount, merged
 * only across 1-row dips (antialiasing) — NO adaptive gap merging (pills are
 * stacked tighter than their own height) and NO height cap.
 */
export function findSolidBands(counts, minCount) {
  const runs = []
  let start = -1
  for (let y = 0; y < counts.length; y++) {
    if (counts[y] >= minCount) {
      if (start < 0) start = y
    } else if (start >= 0) {
      runs.push({ top: start, bottom: y })
      start = -1
    }
  }
  if (start >= 0) runs.push({ top: start, bottom: counts.length })
  return mergeRuns(runs, 1)
}

/**
 * Column clusters within one band: maximal runs of columns with
 * count >= minColCount, merged when separated by < 0.35x the band height
 * (glyph gaps), keeping only clusters at least `minWidth` wide.
 */
export function findColumnClusters(colCounts, top, bottom, minColCount, minWidth) {
  const runs = []
  let start = -1
  for (let x = 0; x < colCounts.length; x++) {
    if (colCounts[x] >= minColCount) {
      if (start < 0) start = x
    } else if (start >= 0) {
      runs.push({ left: start, right: x })
      start = -1
    }
  }
  if (start >= 0) runs.push({ left: start, right: colCounts.length })
  const bandH = bottom - top
  const merged = mergeRuns(runs, Math.max(1, Math.round(0.35 * bandH)))
  return merged.filter((c) => c.right - c.left >= minWidth)
}

/** Column profile of text pixels within one band (same mask semantics as rowProfile). */
export function columnProfileInRange(img, top, bottom, lumaMax, chromaMax = null) {
  const counts = new Int32Array(img.width)
  const { data, width } = img
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (luma(data[i], data[i + 1], data[i + 2]) < lumaMax) {
        if (chromaMax === null || chroma(data[i], data[i + 1], data[i + 2]) < chromaMax) counts[x]++
      }
    }
  }
  return counts
}

/**
 * Panel-paper mask profile: per-row (or per-column) count of pixels that look
 * like the panel's cream paper (high luma, low chroma). The panel is the only
 * large light-paper rectangle in a screenshot, so its rows/columns carry a
 * high paper fraction while any surrounding background (white, gray, dark
 * game backdrop) differs: gray/dark fail the luma test outright, and plain
 * white merges harmlessly (it carries no text).
 */
export function paperProfile(img, axis) {
  const { data, width, height } = img
  const n = axis === 'x' ? width : height
  const m = axis === 'x' ? height : width
  const counts = new Int32Array(n)
  for (let a = 0; a < n; a++) {
    let count = 0
    for (let b = 0; b < m; b++) {
      const i = (axis === 'x' ? b * width + a : a * width + b) * 4
      const r = data[i], g = data[i + 1], bl = data[i + 2]
      if (luma(r, g, bl) > PAPER_LUMA_MIN && chroma(r, g, bl) < PAPER_CHROMA_MAX) count++
    }
    counts[a] = count
  }
  return counts
}

/**
 * Longest merged run in a 1D profile whose values reach `frac * span` (span =
 * the maximum possible count for this axis — the profile's traverse length,
 * NOT counts.length, which is the other axis and would inflate the
 * threshold). Runs separated by gaps <= 3% of the profile length merge first
 * (local dips like the blue header bar). Returns {from,to} or null.
 */
export function longestPaperRun(counts, frac, span) {
  const n = counts.length
  const threshold = frac * span
  const runs = []
  let start = -1
  for (let i = 0; i < n; i++) {
    if (counts[i] >= threshold) {
      if (start < 0) start = i
    } else if (start >= 0) {
      runs.push({ from: start, to: i })
      start = -1
    }
  }
  if (start >= 0) runs.push({ from: start, to: n })
  const mergeGap = Math.round(0.03 * n)
  const merged = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && run.from - last.to <= mergeGap) last.to = run.to
    else merged.push({ from: run.from, to: run.to })
  }
  let best = null
  for (const run of merged) {
    if (!best || run.to - run.from > best.to - best.from) best = run
  }
  return best
}

/**
 * Panel row range within the panel's column range: full-width dark separator
 * bars split the panel's paper rows into several runs, so the LONGEST run
 * would truncate the panel (measured: sampideal1's rows run 133..467 of a
 * 759-tall panel). The correct range spans the FIRST through the LAST
 * qualifying run — margin strips (gray/dark) produce no runs at all, and bar
 * rows are gaps INSIDE the range, which is exactly what we want.
 */
export function panelRowRange(counts, frac, span) {
  const n = counts.length
  const threshold = frac * span
  const runs = []
  let start = -1
  for (let i = 0; i < n; i++) {
    if (counts[i] >= threshold) {
      if (start < 0) start = i
    } else if (start >= 0) {
      runs.push({ from: start, to: i })
      start = -1
    }
  }
  if (start >= 0) runs.push({ from: start, to: n })
  const qualifying = runs.filter((r) => r.to - r.from >= 0.05 * n)
  if (qualifying.length === 0) return null
  return { from: qualifying[0].from, to: qualifying[qualifying.length - 1].to }
}

// ---------------------------------------------------------------------------
// Label vocabulary — the game's English labels per stat key (from the real
// samples; fuzzy-matched, so truncation like "vE DMG Redu" or chevron-clipped
// "RIT DMG RES" still matches).
// ---------------------------------------------------------------------------
export const GAME_LABELS = {
  hp: 'HP',
  sp: 'SP',
  patk: 'PATK',
  pdef: 'PDEF',
  matk: 'MATK',
  mdef: 'MDEF',
  refine_patk: 'Refine PATK',
  refine_pdef: 'Refine PDEF',
  refine_matk: 'Refine MATK',
  refine_mdef: 'Refine MDEF',
  hp_recover: 'HP recover',
  sp_recover: 'SP Recovery',
  hit: 'HIT',
  flee: 'FLEE',
  aspd: 'ASPD',
  mspd: 'MSPD',
  variable_ct: 'Variable CT',
  variable_ct_pct: 'Variable CT',
  fixed_ct: 'Fixed CT',
  fixed_ct_pct: 'Fixed CT',
  healing_done: 'Healing Done',
  healing_taken: 'Healing Taken',
  crit: 'CRIT',
  crit_res: 'CRIT RES',
  crit_dmg: 'CRIT DMG',
  crit_dmg_res: 'CRIT DMG RES',
  pdmg: 'PDMG',
  pdmg_r: 'PDMG.R',
  mdmg: 'MDMG',
  mdmg_r: 'MDMG.R',
  ignore_pdef: 'Ignore PDEF',
  ignore_pdef_pct: 'Ignore PDEF',
  ignore_mdef: 'Ignore MDEF',
  ignore_mdef_pct: 'Ignore MDEF',
  pdmg_bonus: 'PDMG Bonus',
  mdmg_bonus: 'MDMG Bonus',
  pve_dmg_reduction: 'PvE DMG Reduction',
  pve_dmg_bonus: 'PvE DMG Bonus',
  pvp_dmg_reduction: 'PvP DMG Reduction',
  pvp_dmg_bonus: 'PvP DMG Bonus',
  max_sp_pct: 'Max SP',
  max_hp_pct: 'Max HP',
  equip_patk_pct: 'Equipment PATK',
  equip_matk_pct: 'Equipment MATK',
  equip_pdef_pct: 'Equipment PDEF',
  equip_mdef_pct: 'Equipment MDEF',
  global_cd_pct: 'Global CD%',
  dmg_vs_small: 'DMG vs Small Enemies',
  dmg_reduction_vs_small: 'DMG Reduction vs Small Enemies',
  dmg_vs_medium: 'DMG vs Medium Enemies',
  dmg_reduction_vs_medium: 'DMG Reduction vs Medium Enemies',
  dmg_vs_large: 'DMG vs Large Enemies',
  dmg_reduction_vs_large: 'DMG Reduction vs Large Monsters',
  dmg_vs_brute: 'DMG vs Brute',
  dmg_reduction_vs_brute: 'DMG Reduction vs Brute',
  dmg_reduction_vs_demi_human: 'DMG Reduction vs Demi-Human',
  // Evidence-only keys (special section continues past the shipped 15 rows —
  // samp1 scrolls further; not part of the 56-field shipped bar).
  dmg_vs_demon: 'DMG vs Demon',
  dmg_reduction_vs_demon: 'DMG Reduction vs Demon',
  dmg_vs_plant: 'DMG vs Plant',
  dmg_reduction_vs_plant: 'DMG Reduction vs Plant',
  dmg_vs_undead: 'DMG vs Undead',
  dmg_reduction_vs_undead: 'DMG Reduction vs Undead',
  dmg_vs_formless: 'DMG vs Formless',
  dmg_vs_fish: 'DMG vs Fish',
  dmg_reduction_vs_fish: 'DMG Reduction vs Fish',
}

/** Per-capture screen grammar (fixed visual layout of the game UI). */
export const SCREENS = {
  basic: { kind: 'pills' },
  general: {
    kind: 'rows',
    columns: 2,
    left: ['hp', 'patk', 'matk', 'refine_patk', 'refine_matk', 'hp_recover', 'hit'],
    right: ['sp', 'pdef', 'mdef', 'refine_pdef', 'refine_mdef', 'sp_recover', 'flee'],
  },
  quasi: {
    kind: 'rows',
    columns: 2,
    left: [
      'aspd', 'variable_ct', 'fixed_ct', 'healing_done', 'crit', 'crit_dmg', 'pdmg',
      'mdmg', 'ignore_pdef', 'ignore_mdef', 'pdmg_bonus', 'pve_dmg_reduction', 'pvp_dmg_reduction',
    ],
    right: [
      'mspd', 'variable_ct_pct', 'fixed_ct_pct', 'healing_taken', 'crit_res', 'crit_dmg_res',
      'pdmg_r', 'mdmg_r', 'ignore_pdef_pct', 'ignore_mdef_pct', 'mdmg_bonus', 'pve_dmg_bonus', 'pvp_dmg_bonus',
    ],
  },
  special: {
    kind: 'rows',
    columns: 1,
    left: [
      'max_sp_pct', 'equip_patk_pct', 'equip_matk_pct', 'equip_pdef_pct', 'equip_mdef_pct',
      'global_cd_pct', 'dmg_vs_small', 'dmg_reduction_vs_small', 'dmg_vs_medium',
      'dmg_reduction_vs_medium', 'dmg_vs_large', 'dmg_reduction_vs_large', 'dmg_vs_brute',
      'dmg_reduction_vs_brute', 'dmg_reduction_vs_demi_human',
    ],
    right: [],
  },
}

/** Merged full vocabulary (evidence reads of arbitrary scroll mixtures, samp1-7). */
export const FULL_LEFT = [
  ...SCREENS.general.left,
  ...SCREENS.quasi.left,
]
export const FULL_RIGHT = [
  ...SCREENS.general.right,
  ...SCREENS.quasi.right,
  ...SCREENS.special.left,
  'dmg_vs_demon', 'dmg_reduction_vs_demon', 'dmg_vs_plant', 'dmg_reduction_vs_plant',
  'dmg_vs_undead', 'dmg_reduction_vs_undead', 'dmg_vs_formless', 'dmg_vs_fish',
  'dmg_reduction_vs_fish',
]

// ---------------------------------------------------------------------------
// Fuzzy label matching
// ---------------------------------------------------------------------------

/** Lowercase a-z only — the comparison space for labels. */
export function normalizeLabel(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

export function levenshtein(a, b) {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = new Array(b.length + 1)
  let curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

/**
 * Score one observed label against one expected label (higher = better).
 * Exact normalized equality beats containment (handles left-truncated labels
 * like "vE DMG Redu" ⊂ "pvedmgreduction") beats bounded Levenshtein distance
 * (handles OCR noise like "ritdmgres" ≈ "critdmgres").
 */
export function scoreLabelPair(observed, expected) {
  const o = normalizeLabel(observed)
  const e = normalizeLabel(expected)
  if (o === '') return -Infinity
  if (o === e) return 100
  if (e.includes(o)) return 90 - Math.abs(e.length - o.length)
  if (o.includes(e)) return 85 - Math.abs(e.length - o.length)
  const maxDist = Math.max(2, Math.floor(0.25 * Math.min(o.length, e.length)))
  const dist = levenshtein(o, e)
  if (dist <= maxDist) return 80 - dist * 5
  return -Infinity
}

/** Best vocabulary key for one observed label, or null below the bar. */
export function matchLabel(observed, vocabKeys) {
  let bestKey = null
  let bestScore = 0 // acceptance floor: containment(≥77) / distance(≥60) qualify, noise doesn't
  for (const key of vocabKeys) {
    const score = scoreLabelPair(observed, GAME_LABELS[key])
    if (score > bestScore) {
      bestScore = score
      bestKey = key
    }
  }
  return bestKey === null ? null : { key: bestKey, score: bestScore }
}

// ---------------------------------------------------------------------------
// OCR plumbing (Node spike transport: sharp preprocessing + tesseract.js)
// ---------------------------------------------------------------------------

function clampInt(n, lo, hi) {
  return Math.min(Math.max(Math.round(n), lo), hi)
}

/** Adaptive upscale factor: land the crop at ~72px tall (2x..6x). Measured:
 * 48px misreads "-33.38%" as "-33.389%" (conf 66) while 72px reads it exactly
 * (conf 90) — the extra resolution matters for the % glyph cluster. */
export function upscaleForHeight(h, target = 72) {
  return clampInt(target / Math.max(1, h), 2, 6)
}

/**
 * OCR one rect of a raw RGBA image with the 05-01 recognition core:
 * grayscale -> adaptive upscale (cubic) -> binarize -> dual polarity (a
 * mostly-dark binarized crop is read in both polarities) -> whitelisted
 * Tesseract -> best-read scoring (parseable > non-empty > confidence).
 * Binarization: `normalize` (default) = normalize -> threshold(140), the 05-01
 * recipe for dark text on the light panel; a number = fixed threshold for
 * white-on-fill pill text (PILL_THRESHOLD). Returns the best raw text.
 * `parse` decides "parseable" (digits mode uses the shared parseValue; label
 * mode just needs non-empty letters).
 */
export async function ocrRect(sharp, worker, img, rect, { whitelist, parse, threshold = 'normalize' }) {
  const x = clampInt(rect.left, 0, img.width - 1)
  const y = clampInt(rect.top, 0, img.height - 1)
  const w = clampInt(rect.width, 1, img.width - x)
  const h = clampInt(rect.height, 1, img.height - y)
  const f = upscaleForHeight(h)
  let pipe = sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
    .clone()
    .extract({ left: x, top: y, width: w, height: h })
    .greyscale()
    .resize({ width: w * f, height: h * f, kernel: 'cubic' })
  pipe = threshold === 'normalize' ? pipe.normalize().threshold(140) : pipe.threshold(threshold)
  let binBuf = await pipe.png().toBuffer()
  // Margin around the binarized crop — Tesseract's LSTM misclassifies lone
  // glyphs on a tight canvas (measured: a clean isolated "0" reads "9" with
  // conf 0 unpadded, and "0" conf 51-75 with an 8-30px border; the old
  // region-map engine had such margins implicitly via generous regions).
  // The pad color must MATCH the binarized background: dark-background crops
  // (pill white-text-on-fill) pad black, light crops (panel text) pad white —
  // a mismatched pad is itself a feature Tesseract misreads (measured: the
  // Power pill read "288115" collapsed when padded white).
  const preMean = (await sharp(binBuf).stats()).channels[0].mean
  const padColor = preMean < 128 ? { r: 0, g: 0, b: 0, alpha: 1 } : { r: 255, g: 255, b: 255, alpha: 1 }
  {
    const binMeta = await sharp(binBuf).metadata()
    const padX = Math.max(8, Math.round(0.15 * binMeta.width))
    const padY = Math.max(8, Math.round(0.15 * binMeta.height))
    binBuf = await sharp(binBuf)
      .extend({ top: padY, bottom: padY, left: padX, right: padX, background: padColor })
      .png()
      .toBuffer()
  }
  // Debug hook: dump every binarized crop + read (set NEFOOT_SPIKE_DUMP=<dir>).
  const dumpDir = process.env.NEFOOT_SPIKE_DUMP
  if (dumpDir) {
    if (!existsSync(dumpDir)) (await import('node:fs')).mkdirSync(dumpDir, { recursive: true })
    const idx = (globalThis.__dumpIdx = (globalThis.__dumpIdx ?? 0) + 1)
    const meta = `x=${rect.left} y=${rect.top} w=${rect.width} h=${rect.height} f=${f}`
    await sharp(binBuf).png().toFile(path.join(dumpDir, `${String(idx).padStart(3, '0')}.png`))
    ;(globalThis.__dumpLog ??= []).push(`${idx}: ${meta}`)
  }
  const reads = []
  const bin = sharp(binBuf)
  const mean = (await bin.stats()).channels[0].mean
  const variants = mean < 128 ? [binBuf, await sharp(binBuf).negate().png().toBuffer()] : [binBuf]
  for (const variant of variants) {
    await worker.setParameters({ tessedit_char_whitelist: whitelist })
    const { data } = await worker.recognize(variant)
    const text = data.text || ''
    const confidence = Number(data.confidence ?? 0)
    reads.push({ text, confidence })
  }
  // pickBestRead semantics (05-01): parseable (+1000) > non-empty (+100) > confidence.
  let best = ''
  let bestScore = -Infinity
  for (const r of reads) {
    const score = (parse(r.text) ? 1000 : 0) + (r.text.trim() !== '' ? 100 : 0) + r.confidence
    if (score > bestScore) {
      bestScore = score
      best = r.text
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Structural readers
// ---------------------------------------------------------------------------

/**
 * Read a Details screen (rows grammar). Returns Map<stat_key, raw read>.
 * Order mode (band counts match the expected rows exactly per side) maps by
 * fixed row order and skips label OCR; label mode OCRs each cell's label and
 * fuzzy-matches it against the capture's vocabulary (scroll mixtures, extra
 * sections and truncated labels handled there).
 */
export async function readRowsScreen(sharp, worker, img, grammar) {
  const values = new Map()
  const counts = rowProfile(img, DARK_LUMA_MAX)
  const minCount = Math.max(2, Math.round(0.003 * img.width))
  const bands = findTextBands(counts, minCount)
  if (bands.length === 0) return values

  // Content extent + midline from the detected bands themselves (invariant
  // to margins — padded borders simply carry no bands).
  let contentLeft = Infinity
  let contentRight = -Infinity
  const bandClusters = []
  for (const band of bands) {
    const bandH = band.bottom - band.top
    const darkCols = columnProfileInRange(img, band.top, band.bottom, DARK_LUMA_MAX)
    const darkClusters = findColumnClusters(darkCols, band.top, band.bottom, 1, Math.max(2, Math.round(0.15 * bandH)))
    bandClusters.push({ band, darkClusters })
    for (const c of darkClusters) {
      if (c.left < contentLeft) contentLeft = c.left
      if (c.right > contentRight) contentRight = c.right
    }
  }
  const midX = (contentLeft + contentRight) / 2
  const twoColumn = grammar.columns === 2

  // Per-cell value clusters (low-chroma mask).
  const cells = [] // { band, side: 'L'|'R', value:{left,right}, labelRect|null }
  for (const { band, darkClusters } of bandClusters) {
    const bandH = band.bottom - band.top
    const valueCols = columnProfileInRange(img, band.top, band.bottom, DARK_LUMA_MAX, VALUE_CHROMA_MAX)
    const valueClusters = findColumnClusters(valueCols, band.top, band.bottom, 1, Math.max(2, Math.round(0.15 * bandH)))
    const cellRange = (side) => {
      if (!twoColumn) return { from: contentLeft, to: contentRight }
      return side === 'L' ? { from: contentLeft, to: midX } : { from: midX, to: contentRight }
    }
    const sides = twoColumn ? ['L', 'R'] : ['R']
    for (const side of sides) {
      const range = cellRange(side)
      // rightmost value cluster whose CENTER lies in this cell
      const inCell = valueClusters.filter((c) => {
        const center = (c.left + c.right) / 2
        return center >= range.from && center < range.to
      })
      if (inCell.length === 0) continue
      const value = inCell[inCell.length - 1]
      // label = dark text strictly left of the value inside this cell
      const labelClusters = darkClusters.filter((c) => {
        const center = (c.left + c.right) / 2
        return center >= range.from && c.right <= value.left
      })
      let labelRect = null
      if (labelClusters.length > 0) {
        const left = labelClusters[0].left
        const right = labelClusters[labelClusters.length - 1].right
        if (right - left >= 4) {
          labelRect = {
            left: clampInt(left - 2, 0, img.width - 1),
            top: clampInt(band.top - 2, 0, img.height - 1),
            width: clampInt(right - left + 4, 1, img.width - clampInt(left - 2, 0, img.width - 1)),
            height: clampInt(bandH + 4, 1, img.height - clampInt(band.top - 2, 0, img.height - 1)),
          }
        }
      }
      cells.push({
        side,
        valueRect: {
          left: clampInt(value.left - 2, 0, img.width - 1),
          top: clampInt(band.top - 2, 0, img.height - 1),
          width: clampInt(value.right - value.left + 4, 1, img.width - clampInt(value.left - 2, 0, img.width - 1)),
          height: clampInt(bandH + 4, 1, img.height - clampInt(band.top - 2, 0, img.height - 1)),
        },
        labelRect,
        bandTop: band.top,
      })
    }
  }

  const vocab = (side) => {
    if (!twoColumn) return grammar.left
    return side === 'L' ? grammar.left : grammar.right
  }

  // Order mode: every expected row has exactly one cell value on its side.
  const leftCells = cells.filter((c) => c.side === 'L' || !twoColumn)
  const rightCells = cells.filter((c) => c.side === 'R')
  const leftKeys = twoColumn ? grammar.left : grammar.left
  const rightKeys = grammar.right
  const orderMode =
    leftCells.length === leftKeys.length && rightCells.length === rightKeys.length

  const assignments = [] // { key, cell, labelScore }
  if (orderMode) {
    for (const cell of leftCells) assignments.push({ key: leftKeys[assignments.length], cell, labelScore: 100 })
    // rebuild right side from its own count
    const rightAssigned = assignments.filter((a) => a.cell.side === 'R').length
    let ri = 0
    for (const cell of rightCells) {
      assignments.push({ key: rightKeys[rightAssigned + ri], cell, labelScore: 100 })
      ri++
    }
  } else {
    for (const cell of cells) {
      if (!cell.labelRect) continue
      const observed = await ocrRect(sharp, worker, img, cell.labelRect, {
        whitelist: LABELS_WHITELIST,
        parse: (t) => normalizeLabel(t).length >= 3,
      })
      const match = matchLabel(observed, vocab(cell.side))
      if (match) assignments.push({ key: match.key, cell, labelScore: match.score })
    }
  }

  // Conflict resolution: better label score wins; ties keep the BOTTOM band
  // (the game never repeats a label within a screen above its own row — the
  // Max HP / Max SP adjacency case resolves to the lower row).
  const byKey = new Map()
  for (const a of assignments) {
    const prev = byKey.get(a.key)
    if (!prev || a.labelScore > prev.labelScore || (a.labelScore === prev.labelScore && a.cell.bandTop > prev.cell.bandTop)) {
      byKey.set(a.key, a)
    }
  }

  for (const [key, a] of byKey) {
    const raw = await ocrRect(sharp, worker, img, a.cell.valueRect, {
      whitelist: DIGITS_WHITELIST,
      // Production polarity semantics: parseable reads win (pickBestRead's
      // +1000) — never a bare confidence tiebreak between polarities.
      parse: (t) => parseValue(t).ok,
    })
    values.set(key, raw)
  }
  return values
}

/**
 * Read the Basic screen (pills grammar). Returns Map<stat_key, raw read>.
 * combat_power = the bottom-most saturated pill whose read parses as a flat
 * (non-percentual) number inside sanity (0..100_000_000, the shipped range).
 */
export async function readBasicScreen(sharp, worker, img) {
  const values = new Map()
  const { data, width, height } = img
  const rowCount = new Int32Array(height)
  for (let y = 0; y < height; y++) {
    let count = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (chroma(data[i], data[i + 1], data[i + 2]) >= PILL_CHROMA_MIN) count++
    }
    rowCount[y] = count
  }
  const minCount = Math.max(2, Math.round(0.2 * width))
  const pills = findSolidBands(rowCount, minCount)
  // Bottom-most first: combat_power (Power) is the lowest pill.
  const ordered = [...pills].sort((a, b) => b.top - a.top)
  for (const pill of ordered) {
    const bandH = pill.bottom - pill.top
    const colCounts = new Int32Array(width)
    for (let y = pill.top; y < pill.bottom; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        if (chroma(data[i], data[i + 1], data[i + 2]) >= PILL_CHROMA_MIN) colCounts[x]++
      }
    }
    const clusters = findColumnClusters(colCounts, pill.top, pill.bottom, Math.max(1, Math.round(0.5 * bandH)), 4)
    if (clusters.length === 0) continue
    // Anchor the extent on the DOMINANT saturated mass before spanning
    // first..last. The pill fill is by far the widest saturated run in its
    // band, but row labels share the band's rows and their glyph antialiasing
    // (indigo on cream blends to ~rgb(142,164,208), chroma 66 >= PILL_CHROMA_MIN)
    // crosses the column threshold at resampled scales — measured at 1.5x:
    // the "Power" label's halo columns formed w=4 runs 318px left of the pill,
    // dragging the extent across the label, where the cream paper (luma > 210)
    // then polluted the white-text scan and the read collapsed to "4". Drop
    // runs narrower than 15% of the widest: interior slivers (glyph-punch gaps
    // in the fill) are unaffected, the fill's own outer runs are always the
    // dominant mass, and the ratio is scale-invariant.
    const widest = Math.max(...clusters.map((c) => c.right - c.left))
    const core = clusters.filter((c) => c.right - c.left >= 0.15 * widest)
    if (core.length === 0) continue
    // Span the full pill: the gradient/white-text interior can split the
    // saturated columns into several clusters — extent = first..last.
    const extent = { left: core[0].left, right: core[core.length - 1].right }
    // The pill text renders WHITE on the saturated fill — locate the text
    // extent by near-white columns inside the pill band (PILL_TEXT_LUMA_MIN
    // sits between the fill's luma ceiling (~208) and the glyphs (~240+); the
    // bare gradient binarizes to speckle and misreads). Scan only the band's
    // MIDDLE rows (25% inset each side): the pill's rounded ends carry light
    // edge-highlight arcs that reach luma 210+ at the band's top/bottom rows
    // and would be mistaken for glyphs (measured: clusters 243-271/579-591 at
    // full band, gone at the middle rows where only 398-469 — the text — remains).
    const midTop = pill.top + Math.round(0.25 * bandH)
    const midBottom = pill.bottom - Math.round(0.25 * bandH)
    const whiteCols = new Int32Array(width)
    for (let y = midTop; y < midBottom; y++) {
      for (let x = extent.left; x < extent.right; x++) {
        const i = (y * width + x) * 4
        if (luma(data[i], data[i + 1], data[i + 2]) > PILL_TEXT_LUMA_MIN) whiteCols[x]++
      }
    }
    const textClusters = findColumnClusters(whiteCols, midTop, midBottom, 1, 3)
    let textLeft = extent.left
    let textRight = extent.right
    if (textClusters.length > 0) {
      textLeft = textClusters[0].left
      textRight = textClusters[textClusters.length - 1].right
      // Pad the glyph extent: the mask catches glyph cores, not their
      // antialiased edges — an unpadded crop clips end digits (measured:
      // "288115" read from a clipped crop lost its '2'/'5').
      const pad = Math.max(4, Math.round(PILL_TEXT_PAD_FRAC * (textRight - textLeft)))
      textLeft -= pad
      textRight += pad
    }
    // Inset past the rounded pill ends; keep the white text zone. The Y inset
    // stays minimal (1px AA border): the digits span nearly the full band
    // height, and a taller inset (15% measured) clips glyph tops — at crop
    // height 16 the read collapses to "115", at full height it is exact
    // ("288115", conf 96). The top/bottom edge-highlight arcs live at the
    // pill's X ends, which the text-extent crop already excludes, so the
    // PILL_THRESHOLD binarization does not need a Y inset to suppress them.
    const insetX = Math.max(2, Math.round(0.04 * (textRight - textLeft)))
    const insetY = 1
    const rect = {
      left: clampInt(textLeft + insetX, 0, width - 1),
      top: clampInt(pill.top + insetY, 0, height - 1),
      width: clampInt(textRight - textLeft - 2 * insetX, 1, width - clampInt(textLeft + insetX, 0, width - 1)),
      height: clampInt(bandH - 2 * insetY, 1, height - clampInt(pill.top + insetY, 0, height - 1)),
    }
    const raw = await ocrRect(sharp, worker, img, rect, {
      whitelist: PILL_DIGITS_WHITELIST,
      threshold: PILL_THRESHOLD,
      parse: (t) => parseValue(t).ok,
    })
    const parsed = parseValue(raw)
    if (
      parsed.ok &&
      parsed.value !== null &&
      !parsed.isPercentual &&
      parsed.value >= 0 &&
      parsed.value <= 100_000_000
    ) {
      // Content gate: only the Power pill yields a sane flat number.
      values.set('combat_power', raw)
      break
    }
  }
  return values
}

// ---------------------------------------------------------------------------
// Sample plumbing + proof grid
// ---------------------------------------------------------------------------

async function decodeSample(sharp, file) {
  // 07.2-06 checkpoint round 3: the sample bundle re-cut sampbasic.png as
  // sampbasicideal.png. Fall back to the ideal fixture when the original
  // name is gone.
  const alias = file === 'sampbasic.png' ? 'sampbasicideal.png' : null
  const resolved =
    alias !== null && existsSync(path.join(SAMPLES_DIR, alias)) ? alias : file
  const { data, info } = await sharp(path.join(SAMPLES_DIR, resolved)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 4) throw new Error(`expected RGBA decode for ${file}`)
  return { data: data, width: info.width, height: info.height }
}

/**
 * Crop to the panel's paper rectangle before row profiling. The dark-pixel
 * row profile cannot distinguish text from a dark/gray surrounding margin
 * (both fall under DARK_LUMA_MAX), so the panel must be located FIRST by its
 * paper color (cream: high luma + low chroma) and everything outside cropped
 * away. White margins already profile clean, and they merge with the paper
 * run harmlessly (they carry no text). Returns the image unchanged when no
 * credible paper rectangle exists.
 *
 * Column range first (a full-width dark bar removes the same count from every
 * column, so column fractions stay high), then the row range within the
 * panel's columns via panelRowRange (first..last qualifying run — bars are
 * internal gaps, margins produce no runs).
 */
export async function cropToPanel(sharp, img) {
  const colCounts = paperProfile(img, 'x')
  const cols = longestPaperRun(colCounts, 0.4, img.height)
  if (!cols) return img
  const rowCounts = paperProfileRows(img, cols)
  const rows = panelRowRange(rowCounts, 0.4, cols.to - cols.from)
  if (!rows) return img
  // NO halo pad: even a 1-2px pad keeps margin pixels in every row/column,
  // and rows with as few as 4 dark margin pixels clear the tiny minCount(=2)
  // — the whole crop merges into one giant text band and detection collapses
  // (measured on gray all8%). Text sits well inside the panel; pad = 0.
  const pad = 0
  const left = clampInt(cols.from - pad, 0, img.width - 1)
  const top = clampInt(rows.from - pad, 0, img.height - 1)
  const w = clampInt(cols.to - cols.from + 2 * pad, 1, img.width - left)
  const h = clampInt(rows.to - rows.from + 2 * pad, 1, img.height - top)
  if (w >= img.width && h >= img.height) return img
  const { data, info } = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
    .extract({ left, top, width: w, height: h })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data: data, width: info.width, height: info.height }
}

/** Paper profile along x, restricted to the panel's column-independent row range (full height). */
function paperProfileRows(img, cols) {
  const { data, width } = img
  const counts = new Int32Array(img.height)
  for (let y = 0; y < img.height; y++) {
    let count = 0
    for (let x = cols.from; x < cols.to; x++) {
      const i = (y * width + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (luma(r, g, b) > PAPER_LUMA_MIN && chroma(r, g, b) < PAPER_CHROMA_MAX) count++
    }
    counts[y] = count
  }
  return counts
}

async function rescaled(sharp, img, factor) {
  const w = Math.max(1, Math.round(img.width * factor))
  const h = Math.max(1, Math.round(img.height * factor))
  const { data, info } = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
    .resize(w, h, { kernel: 'cubic' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data: data, width: info.width, height: info.height }
}

async function padded(sharp, img, margins, bg) {
  const { data, info } = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
    .extend({
      top: Math.round(img.height * (margins.top ?? 0)),
      bottom: Math.round(img.height * (margins.bottom ?? 0)),
      left: Math.round(img.width * (margins.left ?? 0)),
      right: Math.round(img.width * (margins.right ?? 0)),
      background: bg,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data: data, width: info.width, height: info.height }
}

const CANONICAL = [
  { capture: 'basic', file: 'sampbasic.png' },
  { capture: 'general', file: 'sampideal1.png' },
  { capture: 'quasi', file: 'sampideal2.png' },
  { capture: 'special', file: 'sampideal3.png' },
]

// Same parse semantics as the production parseStatValue / 05-01 spike (imported
// so the comparison space is IDENTICAL — never a local copy).
import { parseValue } from './ocr-spike.mjs'

function matchesExpected(raw, expectedRaw) {
  const e = parseValue(String(expectedRaw))
  const p = parseValue(raw)
  return e.ok && p.ok && e.value === p.value && e.isPercentual === p.isPercentual
}

async function readCapture(sharp, worker, img, capture) {
  const grammar = SCREENS[capture]
  if (grammar.kind === 'pills') return readBasicScreen(sharp, worker, img)
  // Rows screens profile dark pixels: a gray/dark surrounding margin IS dark
  // and collapses detection — locate and crop to the panel first.
  const panel = await cropToPanel(sharp, img)
  return readRowsScreen(sharp, worker, panel, grammar)
}

async function runProofGrid() {
  if (!existsSync(EXPECTED_PATH)) {
    console.error('[spike-structural] missing .secrets/ocr-samples/expected.json — nothing to measure')
    process.exit(1)
  }
  const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'))
  const sharp = (await import('sharp')).default
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, { cachePath: path.join(process.env.TEMP || '/tmp', 'neofoot-ocr-cache') })
  await worker.setParameters({ user_defined_dpi: '300', tessedit_pageseg_mode: PSM.SINGLE_BLOCK })

  let fail = 0
  const report = []

  /** Run one variant, compare the 56 shipped fields, push a report row. */
  async function measure(label, sampleFile, capture, prepare) {
    let img = await decodeSample(sharp, sampleFile)
    if (prepare) img = await prepare(img)
    const values = await readCapture(sharp, worker, img, capture)
    const exp = expected[sampleFile]
    const lines = []
    let correct = 0
    let total = 0
    const keys =
      capture === 'basic'
        ? ['combat_power']
        : [...SCREENS[capture].left, ...SCREENS[capture].right]
    for (const key of keys) {
      if (exp[key] === undefined) continue // only the shipped fields count
      total += 1
      const raw = values.get(key)
      if (raw !== undefined && matchesExpected(raw, exp[key])) {
        correct += 1
      } else {
        lines.push(`    MISS ${key}: got=${raw === undefined ? '<no read>' : JSON.stringify(raw.trim())} expected="${exp[key]}"`)
      }
    }
    const ok = correct === total
    if (!ok) fail += 1
    report.push(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${correct}/${total}`)
    if (!ok) report.push(lines.join('\n'))
  }

  // --- F: native, all 11 samples -------------------------------------------
  console.log('== F: native size ==')
  for (const { capture, file } of CANONICAL) await measure(`F native ${file}`, file, capture, null)
  console.log('== F: evidence — scroll-mixture samples through the merged vocabulary ==')
  for (const file of ['samp1.png', 'samp2.png', 'samp3.png', 'samp4.png', 'samp5.png', 'samp6.png', 'samp7.png']) {
    const img = await decodeSample(sharp, file)
    const values = await readRowsScreen(sharp, worker, img, { kind: 'rows', columns: 2, left: FULL_LEFT, right: FULL_RIGHT })
    const exp = expected[file]
    let correct = 0
    let total = 0
    const lines = []
    for (const [key, expectedRaw] of Object.entries(exp)) {
      total += 1
      const raw = values.get(key)
      if (raw !== undefined && matchesExpected(raw, expectedRaw)) correct += 1
      else lines.push(`    MISS ${key}: got=${raw === undefined ? '<no read>' : JSON.stringify(raw.trim())} expected="${expectedRaw}"`)
    }
    report.push(`EVID  ${file}  ${correct}/${total} (evidence only, not the bar)`)
    if (correct !== total) report.push(lines.join('\n'))
  }

  // --- G: rescales ----------------------------------------------------------
  console.log('== G: rescales ==')
  for (const factor of [0.6, 0.75, 1.25, 1.5]) {
    for (const { capture, file } of CANONICAL) {
      await measure(`G x${factor} ${file}`, file, capture, (img) => rescaled(sharp, img, factor))
    }
  }

  // --- H: loose crops (synthetic plain margins) ------------------------------
  console.log('== H: margin pads ==')
  const PADS = [
    { name: 'white T15% L10%', margins: { top: 0.15, left: 0.1 }, bg: { r: 255, g: 255, b: 255, alpha: 1 } },
    { name: 'white R20% B5%', margins: { right: 0.2, bottom: 0.05 }, bg: { r: 255, g: 255, b: 255, alpha: 1 } },
    { name: 'gray all8%', margins: { top: 0.08, bottom: 0.08, left: 0.08, right: 0.08 }, bg: { r: 128, g: 128, b: 128, alpha: 1 } },
    { name: 'gray L20% R5% T5% B15%', margins: { left: 0.2, right: 0.05, top: 0.05, bottom: 0.15 }, bg: { r: 128, g: 128, b: 128, alpha: 1 } },
    { name: 'dark all12% (evidence: game-bg-like)', margins: { top: 0.12, bottom: 0.12, left: 0.12, right: 0.12 }, bg: { r: 34, g: 34, b: 34, alpha: 1 } },
  ]
  for (const pad of PADS) {
    for (const { capture, file } of CANONICAL) {
      await measure(`H ${pad.name} ${file}`, file, capture, (img) => padded(sharp, img, pad.margins, pad.bg))
    }
  }

  await worker.terminate()
  console.log('\n=== STRUCTURAL SPIKE REPORT ===')
  console.log(report.join('\n'))
  console.log(`\nVariants failing the exact-value bar: ${fail}`)
  if (fail > 0) process.exit(2)
  console.log('STRUCTURAL SPIKE: BAR HELD (F+G+H exact on the 56 shipped fields)')
}

// ---------------------------------------------------------------------------
// Probe + diag modes (threshold calibration aids)
// ---------------------------------------------------------------------------

async function runProbe() {
  const sharp = (await import('sharp')).default
  for (const file of ['sampideal1.png', 'sampideal2.png', 'sampbasic.png']) {
    const img = await decodeSample(sharp, file)
    const hist = new Map()
    for (let i = 0; i < img.data.length; i += 4) {
      const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2]
      const key = `${r >> 4},${g >> 4},${b >> 4}` // 16-bucket coalescing
      hist.set(key, (hist.get(key) ?? 0) + 1)
    }
    const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
    console.log(`\n${file} ${img.width}x${img.height} top color buckets (r,g,b >>4):`)
    for (const [k, n] of top) console.log(`  [${k}] ${(n / (img.width * img.height) * 100).toFixed(1)}%`)
  }
}

async function runDiag(file, capture) {
  const sharp = (await import('sharp')).default
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, { cachePath: path.join(process.env.TEMP || '/tmp', 'neofoot-ocr-cache') })
  await worker.setParameters({ user_defined_dpi: '300', tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
  const img = await decodeSample(sharp, file)
  const counts = rowProfile(img, DARK_LUMA_MAX)
  const bands = findTextBands(counts, Math.max(2, Math.round(0.003 * img.width)))
  console.log(`${file} ${img.width}x${img.height} -> ${bands.length} text bands`)
  for (const band of bands) {
    const bandH = band.bottom - band.top
    const dark = columnProfileInRange(img, band.top, band.bottom, DARK_LUMA_MAX)
    const valueCols = columnProfileInRange(img, band.top, band.bottom, DARK_LUMA_MAX, VALUE_CHROMA_MAX)
    const darkClusters = findColumnClusters(dark, band.top, band.bottom, 1, Math.max(2, Math.round(0.15 * bandH)))
    const valueClusters = findColumnClusters(valueCols, band.top, band.bottom, 1, Math.max(2, Math.round(0.15 * bandH)))
    console.log(
      `  band y=${band.top}..${band.bottom} h=${bandH} dark=[${darkClusters.map((c) => `${c.left}-${c.right}`).join(' ')}] values=[${valueClusters.map((c) => `${c.left}-${c.right}`).join(' ')}]`,
    )
  }
  if (capture) {
    const grammar = SCREENS[capture]
    const values = grammar.kind === 'pills' ? await readBasicScreen(sharp, worker, img) : await readRowsScreen(sharp, worker, img, grammar)
    console.log('reads:')
    for (const [k, v] of values) console.log(`  ${k} = ${JSON.stringify(v.trim())}`)
  }
  await worker.terminate()
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file:///${path.resolve(process.argv[1]).replace(/\\/g, '/')}`).href
if (invokedDirectly) {
  const mode = process.argv[2] || ''
  try {
    if (mode === '--probe') await runProbe()
    else if (mode === '--diag') await runDiag(process.argv[3], process.argv[4])
    else if (!existsSync(SAMPLES_DIR)) {
      console.error('[spike-structural] no .secrets/ocr-samples/ — D-10: real samples only, nothing synthetic')
      process.exit(1)
    } else await runProofGrid()
  } catch (err) {
    console.error('[spike-structural] FAILED:', err?.message || err)
    if (err?.stack) console.error(err.stack)
    process.exit(1)
  }
}

