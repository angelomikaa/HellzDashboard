// Panel localization — background-independent location of the game panel's
// cream paper rectangle (architecture pivot, D-05-UAT round 3). Ported
// verbatim from the pure geometry of the spike's cropToPanel
// (scripts/ocr-spike-structural.mjs, commit 012956f).
//
// The Details screens profile DARK pixels: a gray/dark surrounding margin IS
// dark and collapses text-band detection — so the panel must be located
// FIRST by its paper color (cream: high luma + low chroma) and everything
// outside cropped away. White margins already profile clean, and they merge
// with the paper run harmlessly (they carry no text). This module is DOM-free
// and side-effect-free (house style); the actual crop happens on a canvas in
// recognize.ts.
import { chroma, luma, type ImageDataLike } from './preprocess'
import type { Rect } from './structure'

/** Panel paper mask: the cream panel (luma > 200, chroma < 40) — the only
 * large light-paper rectangle in a screenshot. Gray/dark margins fail the
 * luma test outright; plain white merges harmlessly (it carries no text). */
export const PAPER_LUMA_MIN = 200
export const PAPER_CHROMA_MAX = 40

/**
 * Paper profile along an axis: per-column (axis 'x') or per-row (axis 'y')
 * count of pixels that look like the panel's cream paper. The panel's
 * rows/columns carry a high paper fraction while any surrounding background
 * (white, gray, dark game backdrop) differs.
 */
export function paperProfile(img: ImageDataLike, axis: 'x' | 'y'): Int32Array {
  const { data, width, height } = img
  const n = axis === 'x' ? width : height
  const m = axis === 'x' ? height : width
  const counts = new Int32Array(n)
  for (let a = 0; a < n; a++) {
    let count = 0
    for (let b = 0; b < m; b++) {
      const i = (axis === 'x' ? b * width + a : a * width + b) * 4
      const r = data[i]
      const g = data[i + 1]
      const bl = data[i + 2]
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
export function longestPaperRun(counts: Int32Array, frac: number, span: number): { from: number; to: number } | null {
  const n = counts.length
  const threshold = frac * span
  const runs: Array<{ from: number; to: number }> = []
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
  const merged: Array<{ from: number; to: number }> = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && run.from - last.to <= mergeGap) last.to = run.to
    else merged.push({ from: run.from, to: run.to })
  }
  let best: { from: number; to: number } | null = null
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
export function panelRowRange(counts: Int32Array, frac: number, span: number): { from: number; to: number } | null {
  const n = counts.length
  const threshold = frac * span
  const runs: Array<{ from: number; to: number }> = []
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

/** Paper profile along y, restricted to the panel's column range. */
function paperProfileRows(img: ImageDataLike, cols: { from: number; to: number }): Int32Array {
  const { data, width } = img
  const counts = new Int32Array(img.height)
  for (let y = 0; y < img.height; y++) {
    let count = 0
    for (let x = cols.from; x < cols.to; x++) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (luma(r, g, b) > PAPER_LUMA_MIN && chroma(r, g, b) < PAPER_CHROMA_MAX) count++
    }
    counts[y] = count
  }
  return counts
}

/**
 * Compute the panel's paper rectangle, or null when no credible rectangle
 * exists (the caller then uses the image unchanged — white margins merge
 * harmlessly, and a full-size result would crop nothing). Column range
 * first (a full-width dark bar removes the same count from every column, so
 * column fractions stay high), then the row range within the panel's columns
 * via panelRowRange. NO halo pad: even a 1-2px pad keeps margin pixels in
 * every row/column, and rows with as few as 4 dark margin pixels clear the
 * tiny minCount — the whole crop merges into one giant text band and
 * detection collapses (measured on gray all8% in the spike). Text sits well
 * inside the panel; pad = 0.
 */
export function computePanelRect(img: ImageDataLike): Rect | null {
  const colCounts = paperProfile(img, 'x')
  const cols = longestPaperRun(colCounts, 0.4, img.height)
  if (!cols) return null
  const rowCounts = paperProfileRows(img, cols)
  const rows = panelRowRange(rowCounts, 0.4, cols.to - cols.from)
  if (!rows) return null
  const w = cols.to - cols.from
  const h = rows.to - rows.from
  if (w >= img.width && h >= img.height) return null
  return { left: cols.from, top: rows.from, width: w, height: h }
}
