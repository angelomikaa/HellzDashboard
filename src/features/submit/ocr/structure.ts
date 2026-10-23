// Structural reader — value location by the game panel's VISUAL GRAMMAR
// (architecture pivot, D-05-UAT round 3; owner directive 2026-10-12 verbatim
// in 05-UAT.md: "we need a reading model that actually can read data from an
// image without relying on a pixel map").
//
// A faithful port of the pure detection half of the PROVEN spike
// scripts/ocr-spike-structural.mjs (commit 012956f — native 4/4 canonical
// samples exact on the 56 shipped fields, rescales 0.6-1.5x 16/16, white/
// gray/dark margin pads 20/20). Every function here is DOM-free and
// side-effect-free (house style of preprocess.ts) so each detection stage is
// unit-provable without a canvas; the browser OCR plumbing lives in
// recognize.ts.
//
// Strategy (see the spike header for the full measured rationale):
//   - Details screens (general/quasi/special): text row BANDS from a
//     dark-pixel row profile; within a band, value clusters are the
//     LOW-CHROMA dark clusters (values render dark navy, labels indigo —
//     chroma separates them; chevrons/header bars excluded by the same
//     mask). Two-column screens split at the content midline; the value is
//     the rightmost cluster per cell (values are right-aligned by the game
//     UI). Keys map from OCR'd labels via fuzzy match against the screen's
//     known label vocabulary, with a fixed-row-order fallback when the band
//     count matches the expected row count exactly.
//   - Basic screen: value PILLS detected by color saturation (the gray Job
//     pill is excluded by the same mask); the pill extent is anchored on the
//     DOMINANT saturated mass (the 15%-of-widest-run fix — row-label glyph
//     antialiasing must not drag the extent) and the text located by
//     near-white columns in the band's middle rows.
//
// D-19 recalibration model (amended): a game-UI change now recalibrates the
// visual grammar HERE (labels, thresholds, screen row order) — never pixel
// fractions. Every threshold below is probe-derived from the real samples
// and comment-annotated in the spike.
import type { CaptureKey } from './regions'
import { chroma, luma, type ImageDataLike } from './preprocess'

export type { ImageDataLike } from './preprocess'

// ---------------------------------------------------------------------------
// Threshold calibration (probe-derived on the real samples; the game renders
// labels indigo, values dark navy, chevrons/headers light-mid blue on a cream
// panel — all confirmed by the spike's --probe output).
// ---------------------------------------------------------------------------
/** Text pixels: labels + values (header-bar blue ~149, chevrons ~172 excluded). */
export const DARK_LUMA_MAX = 140
/** Value pixels: low-chroma dark navy (labels indigo excluded). */
export const VALUE_CHROMA_MAX = 60
/** Pill pixels: saturated pill fills (gray Job pill excluded). */
export const PILL_CHROMA_MIN = 50
/** Pill text: WHITE glyphs on a saturated gradient fill. The fill's luma
 * concentrates 128..208, the white text sits 240..256 — a HIGH threshold
 * isolates the glyphs (the 05-01 normalize+140 recipe binarizes the gradient
 * into hollow outlines and reads nothing). */
export const PILL_TEXT_LUMA_MIN = 210
/** Binarization threshold for pill crops (white-on-fill). */
export const PILL_THRESHOLD = 180
/** Pad the white-text extent each side (fraction of its width). */
export const PILL_TEXT_PAD_FRAC = 0.12
/** Digits whitelist + '/': N/N pills (HP 99716/99716, Job 0/5984267) keep
 * their slash so parseStatValue REJECTS them (it allows only [\d.,%-]) — the
 * content gate that picks the Power pill among same-shaped white-on-fill
 * reads. */
export const PILL_DIGITS_WHITELIST = '0123456789.,%-/'
/** Numeric whitelist — the 05-01 spike tuning, verbatim. */
export const DIGITS_WHITELIST = '0123456789.,%-'
/** Letters whitelist for label reads. Accented letters are whitelisted too:
 * the live client is pt-BR ("PRECISÃO", "CRÍT", "Bônus de Dano") and dropping
 * them silently mangles every localized label. */
export const LABELS_WHITELIST =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ ' +
  'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ'

// ---------------------------------------------------------------------------
// 1D run/profile primitives
// ---------------------------------------------------------------------------

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Row profile of "text" pixels: count of pixels per row whose luma is below
 * `lumaMax` (and, when `chromaMax` is not null, whose chroma is also below).
 */
export function rowProfile(img: ImageDataLike, lumaMax: number, chromaMax: number | null = null): Int32Array {
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

/** Column profile of text pixels within one band (same mask semantics as rowProfile). */
export function columnProfileInRange(
  img: ImageDataLike,
  top: number,
  bottom: number,
  lumaMax: number,
  chromaMax: number | null = null,
): Int32Array {
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
 * Merge adjacent [start,end) runs whose gap is at most `mergeGap`. Works on
 * both run orientations: vertical {top,bottom} and horizontal {left,right}.
 */
export function mergeRuns<T extends { top: number; bottom: number } | { left: number; right: number }>(
  runs: readonly T[],
  mergeGap: number,
): T[] {
  if (runs.length === 0) return []
  const vertical = 'top' in runs[0]
  const keyed = runs.map((r) =>
    vertical ? { a: (r as { top: number; bottom: number }).top, b: (r as { top: number; bottom: number }).bottom } : { a: (r as { left: number; right: number }).left, b: (r as { left: number; right: number }).right },
  )
  const merged: Array<{ a: number; b: number }> = []
  for (const run of keyed) {
    const last = merged[merged.length - 1]
    if (last && run.a - last.b <= mergeGap) last.b = run.b
    else merged.push({ a: run.a, b: run.b })
  }
  return merged.map((m) =>
    vertical ? ({ top: m.a, bottom: m.b } as T) : ({ left: m.a, right: m.b } as T),
  )
}

/** Text row bands from a row profile: maximal runs of rows with
 * count >= minCount, then merged when separated by < 0.6x the median band
 * height (heals glyph-level splits like a detached '%' or descenders), then
 * filtered: bands taller than 2.5x the median height are solid blocks
 * (uniform dark margins / header bars), not text rows. */
export function findTextBands(counts: Int32Array, minCount: number): Array<{ top: number; bottom: number }> {
  const runs: Array<{ top: number; bottom: number }> = []
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
export function findSolidBands(counts: Int32Array, minCount: number): Array<{ top: number; bottom: number }> {
  const runs: Array<{ top: number; bottom: number }> = []
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
export function findColumnClusters(
  colCounts: Int32Array,
  top: number,
  bottom: number,
  minColCount: number,
  minWidth: number,
): Array<{ left: number; right: number }> {
  const runs: Array<{ left: number; right: number }> = []
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

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(Math.round(n), lo), hi)
}

// ---------------------------------------------------------------------------
// Screen grammar + label vocabulary (the game's fixed visual layout)
// ---------------------------------------------------------------------------

/** Crop rect in absolute pixels (spike rect semantics). */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** Per-capture screen grammar (fixed visual layout of the game UI). */
export interface RowGrammar {
  columns: 1 | 2
  left: string[]
  right: string[]
  /** The game OMITS a row whose value is zero instead of printing 0.00%
   * (measured on the Especial column: a 0% stat has no line at all, while the
   * Atributos Comuns/Avançados columns do print their zeros). When set, a key
   * between two read rows and without a row of its own is a ZERO, not a failed
   * read — see `omittedZeroKeys`. */
  omitsZeroRows?: boolean
}

/** Tooltip capture: one line carries both label and value (e.g.
 * "Equipment PDEF:4913"), read by the tooltip reader in recognize.ts. */
export interface TooltipGrammar {
  kind: 'tooltip'
  label: string   // label to confirm on the line, e.g. 'Equipment PDEF'
  labelPt?: string // pt-BR client wording, e.g. 'DEFF de Equipamento'
  fieldKey: string // transient field key, e.g. 'equip_pdef_raw'
}

export type ScreenGrammar =
  | { kind: 'pills' }
  | ({ kind: 'rows' } & RowGrammar)
  | TooltipGrammar

// `satisfies` keeps the literal per-key types (SCREENS.general.left narrows
// without a cast) while still validating the Record shape.
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
    // Owner-measured: the Especial list hides zero-valued lines entirely
    // (e.g. TdR Global% 0 → no row; Dano x Bruto 0 → no row).
    omitsZeroRows: true,
  },
  pdef_tooltip: {
    kind: 'tooltip',
    label: 'Equipment PDEF',
    labelPt: 'DEFF de Equipamento',
    fieldKey: 'equip_pdef_raw',
  },
  mdef_tooltip: {
    kind: 'tooltip',
    label: 'Equipment MDEF',
    labelPt: 'DEFM de Equipamento',
    fieldKey: 'equip_mdef_raw',
  },
} satisfies Record<CaptureKey, ScreenGrammar>

/** The shipped fields of one capture (the read replaces exactly its own
 * step's displayed fields — the 05-planning group-trimmed projection). */
export function fieldKeysFor(capture: CaptureKey): string[] {
  const grammar = SCREENS[capture]
  if (!grammar) return []
  if (grammar.kind === 'pills') return ['combat_power']
  if (grammar.kind === 'tooltip') return [grammar.fieldKey]
  return [...grammar.left, ...grammar.right]
}

/** The game's English labels per stat key (from the real samples; fuzzy-
 * matched, so truncation like "vE DMG Redu" or chevron-clipped "RIT DMG RES"
 * still matches). */
export const GAME_LABELS: Record<string, string> = {
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
}

/** The SAME stat keys as the pt-BR client labels them (measured on the
 * owner-seeded localized samples, 08.10). Matching tries both vocabularies:
 * the locale is not detectable from pixels, and label mode is the normal path
 * (English fixtures already carry the next section's rows, so order mode
 * rarely holds).
 *
 * NOT listed, for lack of a trustworthy transcription:
 *  - `pve_dmg_reduction` / `pve_dmg_bonus` / `pvp_dmg_reduction` /
 *    `pvp_dmg_bonus`: the pt rows clip to "…ção de Dano J…" where the icon
 *    glyph lands, so the exact wording is unknown. Those four ride on order
 *    mode (the 13+13 quasi capture), which is locale-blind.
 *
 * `max_hp_pct` is listed even though no capture reads it: the pt-BR Especial
 * panel starts with a "PV Máx%" row, and knowing that row keeps it from being
 * counted as an unreadable row when the zero-omission rule infers values. */
export const GAME_LABELS_PT: Record<string, string> = {
  // Atributos Comuns (general)
  hp: 'PV',
  sp: 'PM',
  patk: 'ATQF',
  pdef: 'DEFF',
  matk: 'ATQM',
  mdef: 'DEFM',
  refine_patk: 'ATQF (Refino)',
  refine_pdef: 'DEFF (Refino)',
  refine_matk: 'ATQM (Refino)',
  refine_mdef: 'DEFM (Refino)',
  hp_recover: 'Recuperar PV',
  sp_recover: 'Recuperar PM',
  hit: 'PRECISÃO',
  flee: 'ESQUIVA',
  // Atributos Avançados (quasi) — order mode is primary here, these are the
  // fallback when a capture carries extra rows.
  aspd: 'VATQ%',
  mspd: 'VMOV%',
  variable_ct: 'TC Variável',
  variable_ct_pct: 'TC Variável %',
  fixed_ct: 'TC Fixo',
  fixed_ct_pct: 'TC Fixo %',
  healing_done: 'Efeito de Cura',
  healing_taken: 'Cura Recebida%',
  crit: 'CRÍT',
  crit_res: 'RES CRÍT',
  crit_dmg: 'Dano CRÍT%',
  crit_dmg_res: 'RES a Dano Crítico',
  pdmg: 'Bônus de Dano F%',
  pdmg_r: 'Redução de Dano F%',
  mdmg: 'Bônus Dano M%',
  mdmg_r: 'Redução de Dano M%',
  ignore_pdef: 'Ignorar DEFF',
  ignore_pdef_pct: 'Ignorar DEFF%',
  ignore_mdef: 'Ignorar DEFM',
  ignore_mdef_pct: 'Ignorar DEFM%',
  pdmg_bonus: 'Bônus de Dano',
  mdmg_bonus: 'Dano M Bônus',
  // Especial (special) — label mode is the ONLY path for the single-column
  // capture, so these entries are what makes that screen readable on pt-BR.
  max_hp_pct: 'PV Máx%',
  max_sp_pct: 'PM Máx%',
  equip_patk_pct: 'ATQF de Equipamento%',
  equip_matk_pct: 'ATQM de Equipamento%',
  equip_pdef_pct: 'DEFF de Equipamento%',
  equip_mdef_pct: 'DEFM de Equipamento%',
  global_cd_pct: 'TdR Global%',
  dmg_vs_small: 'Dano x Inimigos Pequenos',
  dmg_reduction_vs_small: 'Redução de Dano x Inimigos Pequenos',
  dmg_vs_medium: 'Dano x Inimigo Médio',
  dmg_reduction_vs_medium: 'Redução de Dano x Inimigos Médios',
  dmg_vs_large: 'Dano x Inimigo Grande',
  dmg_reduction_vs_large: 'Redução de Dano x Inimigos Grandes',
  dmg_vs_brute: 'Dano x Bruto',
  dmg_reduction_vs_brute: 'Redução de Dano x Bruto',
  dmg_reduction_vs_demi_human: 'Redução de Dano x Humanoide%',
}

// ---------------------------------------------------------------------------
// Fuzzy label matching
// ---------------------------------------------------------------------------

/** Lowercase a-z only — the comparison space for labels. Accents are folded
 * (NFD + combining-mark strip) so "PRECISÃO" → "precisao" matches its expected
 * label whether or not the OCR engine emitted the diacritic. */
export function normalizeLabel(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
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
export function scoreLabelPair(observed: string, expected: string): number {
  const o = normalizeLabel(observed)
  const e = normalizeLabel(expected)
  if (o === '') return -Infinity
  if (o === e) return 100
  if (e.includes(o)) return 90 - Math.abs(e.length - o.length)
  // expected ⊂ observed only counts for a SMALL surplus: the game never pads a
  // label, so extra characters are OCR surplus, not part of the name. Unbounded
  // this let a short label outscore a near-exact long one (measured on pt-BR:
  // "ATQM Refinc" scored matk 79 via its "ATQM" prefix and beat refine_matk's
  // 75, so the Refino row was lost).
  const surplus = o.length - e.length
  if (o.includes(e) && surplus <= Math.max(2, Math.floor(0.25 * e.length))) return 85 - surplus
  const maxDist = Math.max(2, Math.floor(0.25 * Math.min(o.length, e.length)))
  const dist = levenshtein(o, e)
  if (dist <= maxDist) return 80 - dist * 5
  // Shape fallback for occlusion: an icon drawn over the text rewrites several
  // characters mid-label (measured on pt-BR: a check glyph over "Humanoide%"
  // reads "HumMwmaitieY"). Length-normalized similarity separates that case
  // cleanly (0.73 vs ≤0.58 for every other label), and the score stays far
  // below the exact/containment paths so a clean row always wins a conflict.
  if (o.length >= 10 && e.length >= 10) {
    const similarity = 1 - dist / Math.max(o.length, e.length)
    if (similarity >= 0.65) return 40 * similarity
  }
  return -Infinity
}

export interface LabelMatch {
  key: string
  score: number
}

/** Every label we accept for one stat key (English client + pt-BR client). */
export function labelsFor(key: string): string[] {
  const out: string[] = []
  const en = GAME_LABELS[key]
  const pt = GAME_LABELS_PT[key]
  if (en) out.push(en)
  if (pt) out.push(pt)
  return out
}

/** Best vocabulary key for one observed label, or null below the bar. Tries
 * every accepted label per key and keeps the best-scoring pair. */
export function matchLabel(observed: string, vocabKeys: string[]): LabelMatch | null {
  let bestKey: string | null = null
  let bestScore = 0 // acceptance floor: containment(≥77) / distance(≥60) qualify, noise doesn't
  for (const key of vocabKeys) {
    for (const label of labelsFor(key)) {
      const score = scoreLabelPair(observed, label)
      if (score > bestScore) {
        bestScore = score
        bestKey = key
      }
    }
  }
  return bestKey === null ? null : { key: bestKey, score: bestScore }
}

// ---------------------------------------------------------------------------
// Adaptive upscale
// ---------------------------------------------------------------------------

/**
 * Adaptive upscale factor: land the crop at ~72px tall (2x..6x). Measured in
 * the spike: 48px misreads "-33.38%" as "-33.389%" (conf 66) while 72px reads
 * it exactly (conf 90) — the extra resolution matters for the % glyph cluster.
 */
export function upscaleForHeight(h: number, target = 72): number {
  return clampInt(target / Math.max(1, h), 2, 6)
}

// ---------------------------------------------------------------------------
// Row-cell detection (Details screens)
// ---------------------------------------------------------------------------

/** One detected value cell: the value crop, the label crop (when present),
 * and the band's top (the tiebreak key for conflict resolution). */
export interface RowCell {
  side: 'L' | 'R'
  valueRect: Rect
  labelRect: Rect | null
  bandTop: number
}

function clampRect(left: number, top: number, width: number, height: number, imgW: number, imgH: number): Rect {
  const l = clampInt(left, 0, imgW - 1)
  const t = clampInt(top, 0, imgH - 1)
  return { left: l, top: t, width: clampInt(width, 1, imgW - l), height: clampInt(height, 1, imgH - t) }
}

/**
 * Detect every value cell of a rows screen: text bands -> per-cell value
 * clusters (low-chroma mask) -> rightmost cluster per cell (values are
 * right-aligned by the game UI), label = dark text strictly left of the
 * value. Content extent + midline derive from the detected bands themselves
 * (invariant to margins — padded borders simply carry no bands).
 */
export function detectRowCells(img: ImageDataLike, grammar: RowGrammar): RowCell[] {
  const counts = rowProfile(img, DARK_LUMA_MAX)
  const minCount = Math.max(2, Math.round(0.003 * img.width))
  const bands = findTextBands(counts, minCount)
  if (bands.length === 0) return []

  let contentLeft = Infinity
  let contentRight = -Infinity
  const bandClusters: Array<{ band: { top: number; bottom: number }; darkClusters: Array<{ left: number; right: number }> }> = []
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

  const cells: RowCell[] = []
  for (const { band, darkClusters } of bandClusters) {
    const bandH = band.bottom - band.top
    const valueCols = columnProfileInRange(img, band.top, band.bottom, DARK_LUMA_MAX, VALUE_CHROMA_MAX)
    const valueClusters = findColumnClusters(valueCols, band.top, band.bottom, 1, Math.max(2, Math.round(0.15 * bandH)))
    const cellRange = (side: 'L' | 'R') => {
      if (!twoColumn) return { from: contentLeft, to: contentRight }
      return side === 'L' ? { from: contentLeft, to: midX } : { from: midX, to: contentRight }
    }
    const sides: Array<'L' | 'R'> = twoColumn ? ['L', 'R'] : ['R']
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
      let labelRect: Rect | null = null
      if (labelClusters.length > 0) {
        const left = labelClusters[0].left
        const right = labelClusters[labelClusters.length - 1].right
        if (right - left >= 4) {
          labelRect = clampRect(left - 2, band.top - 2, right - left + 4, bandH + 4, img.width, img.height)
        }
      }
      cells.push({
        side,
        valueRect: clampRect(value.left - 2, band.top - 2, value.right - value.left + 4, bandH + 4, img.width, img.height),
        labelRect,
        bandTop: band.top,
      })
    }
  }
  return cells
}

// ---------------------------------------------------------------------------
// Key assignment (order mode + label mode conflict resolution)
// ---------------------------------------------------------------------------

export interface KeyAssignment {
  key: string
  cell: RowCell
  labelScore: number
}

/**
 * Order mode: map cells to grammar keys by fixed row order per side (skips
 * label OCR entirely). Returns null when the band counts do not match the
 * expected rows exactly — the caller must fall back to label OCR +
 * fuzzy matching (scroll mixtures, extra sections).
 */
export function assignByOrder(cells: RowCell[], grammar: RowGrammar): KeyAssignment[] | null {
  const twoColumn = grammar.columns === 2
  const leftCells = cells.filter((c) => c.side === 'L' || !twoColumn)
  const rightCells = cells.filter((c) => c.side === 'R')
  const orderMode =
    twoColumn && leftCells.length === grammar.left.length && rightCells.length === grammar.right.length
  if (!orderMode) return null
  const assignments: KeyAssignment[] = []
  leftCells.forEach((cell, i) => assignments.push({ key: grammar.left[i], cell, labelScore: 100 }))
  rightCells.forEach((cell, i) => assignments.push({ key: grammar.right[i], cell, labelScore: 100 }))
  return assignments
}

/**
 * Conflict resolution: better label score wins; ties keep the BOTTOM band
 * (the game never repeats a label within a screen above its own row — the
 * Max HP / Max SP adjacency case resolves to the lower row).
 */
export function resolveConflicts(assignments: KeyAssignment[]): Map<string, KeyAssignment> {
  const byKey = new Map<string, KeyAssignment>()
  for (const a of assignments) {
    const prev = byKey.get(a.key)
    if (!prev || a.labelScore > prev.labelScore || (a.labelScore === prev.labelScore && a.cell.bandTop > prev.cell.bandTop)) {
      byKey.set(a.key, a)
    }
  }
  return byKey
}

/** Raw text for a row the panel omits because its value is zero. */
export const OMITTED_ZERO_RAW = '0'

/**
 * Keys the panel omitted because their value is zero. The game hides a
 * zero-valued line instead of printing 0.00% (owner-measured on the Especial
 * column). Only keys BETWEEN the first and last row we actually read are
 * inferred: a cropped/scrolled screenshot that starts or ends mid-section must
 * stay 'failed' at its edges — blank must never become 0 there.
 *
 * `unexplainedRows` is the number of rendered rows we could not place at all;
 * any such row could be the "missing" one, so nothing is inferred.
 */
export function omittedZeroKeys(
  grammar: RowGrammar,
  matchedKeys: Iterable<string>,
  unexplainedRows = 0,
): string[] {
  if (grammar.omitsZeroRows !== true || unexplainedRows > 0) return []
  const keys = [...grammar.left, ...grammar.right]
  const matched = new Set(matchedKeys)
  const indices: number[] = []
  keys.forEach((key, i) => {
    if (matched.has(key)) indices.push(i)
  })
  if (indices.length < 2) return []
  const first = Math.min(...indices)
  const last = Math.max(...indices)
  return keys.slice(first + 1, last).filter((key) => !matched.has(key))
}

// ---------------------------------------------------------------------------
// Pill detection (Basic screen)
// ---------------------------------------------------------------------------

/**
 * Detect the value pills of the Basic screen: saturated row bands -> per-pill
 * saturated column clusters -> extent anchored on the DOMINANT saturated mass
 * (drop runs < 15% of the widest: row labels share the band's rows and their
 * glyph antialiasing crosses the column threshold at resampled scales — the
 * 1.5x fix) -> white-text extent from near-white columns in the band's middle
 * rows (25% inset each side: the rounded ends carry light edge-highlight
 * arcs). Returns the text crop rects, BOTTOM-MOST FIRST (combat_power is the
 * lowest pill).
 */
export function detectPillRects(img: ImageDataLike): Rect[] {
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
  const rects: Rect[] = []
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
    // first..last (scale-invariant, no rescale special case — the spike's
    // G x1.5 sampbasic root cause).
    const widest = Math.max(...clusters.map((c) => c.right - c.left))
    const core = clusters.filter((c) => c.right - c.left >= 0.15 * widest)
    if (core.length === 0) continue
    // Span the full pill: the gradient/white-text interior can split the
    // saturated columns into several clusters — extent = first..last.
    const extent = { left: core[0].left, right: core[core.length - 1].right }
    // The pill text renders WHITE on the saturated fill — locate the text
    // extent by near-white columns, scanning only the band's MIDDLE rows
    // (25% inset each side) so the rounded ends' edge-highlight arcs are
    // excluded.
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
      // antialiased edges — an unpadded crop clips end digits.
      const pad = Math.max(4, Math.round(PILL_TEXT_PAD_FRAC * (textRight - textLeft)))
      textLeft -= pad
      textRight += pad
    }
    // Inset past the rounded pill ends; keep the white text zone. The Y inset
    // stays minimal (1px AA border): the digits span nearly the full band
    // height, and a taller inset clips glyph tops.
    const insetX = Math.max(2, Math.round(0.04 * (textRight - textLeft)))
    const insetY = 1
    rects.push(
      clampRect(
        textLeft + insetX,
        pill.top + insetY,
        textRight - textLeft - 2 * insetX,
        bandH - 2 * insetY,
        width,
        height,
      ),
    )
  }
  return rects
}
