// Pure ImageData preprocessing for the OCR auto-read layer (plan 05-01).
//
// A faithful port of the sharp pipeline in scripts/ocr-spike.mjs
// (preprocessRegion): grayscale -> contrast normalize -> binarize(140), plus
// the dual-polarity decision rule (binarized mean luma < 128) and the
// best-read scoring from recognizeBest. Everything here is DOM-free and
// side-effect-free (fresh buffers out, inputs never mutated) so each pipeline
// stage is unit-provable without a canvas.
//
// §6 pitfall 2: this module NEVER re-implements locale parsing — pickBestRead
// imports the shared parseStatValue so manual entry and OCR output normalize
// identically (parity by construction).
import { parseStatValue } from '../../../lib/parseStatValue'

/** Minimal ImageData shape (a real ImageData satisfies this structurally). */
export interface ImageDataLike {
  data: Uint8ClampedArray
  width: number
  height: number
}

function copy(image: ImageDataLike): ImageDataLike {
  return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height }
}

/** ITU-R 601 luma of one pixel, rounded to a byte. */
function lumaByte(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b)
}

/** Grayscale in place over a fresh copy: RGB := luma, alpha preserved. */
export function toGrayscale(image: ImageDataLike): ImageDataLike {
  const out = copy(image)
  for (let i = 0; i < out.data.length; i += 4) {
    const luma = lumaByte(out.data[i], out.data[i + 1], out.data[i + 2])
    out.data[i] = luma
    out.data[i + 1] = luma
    out.data[i + 2] = luma
  }
  return out
}

/**
 * Contrast-stretch (sharp `normalize`): per RGB channel, map the channel's
 * min..max to 0..255. A constant channel (min == max) is left unchanged —
 * the guard also prevents a division by zero.
 */
export function normalizeContrast(image: ImageDataLike): ImageDataLike {
  const out = copy(image)
  for (let c = 0; c < 3; c++) {
    let min = Infinity
    let max = -Infinity
    for (let i = c; i < out.data.length; i += 4) {
      const v = out.data[i]
      if (v < min) min = v
      if (v > max) max = v
    }
    if (min === max) continue
    const scale = 255 / (max - min)
    for (let i = c; i < out.data.length; i += 4) {
      out.data[i] = Math.round((out.data[i] - min) * scale)
    }
  }
  return out
}

/** Binarize on a fresh copy: luma >= threshold -> 255, else 0; alpha preserved. */
export function binarize(image: ImageDataLike, threshold = 140): ImageDataLike {
  const out = copy(image)
  for (let i = 0; i < out.data.length; i += 4) {
    const bit = lumaByte(out.data[i], out.data[i + 1], out.data[i + 2]) >= threshold ? 255 : 0
    out.data[i] = bit
    out.data[i + 1] = bit
    out.data[i + 2] = bit
  }
  return out
}

/** Negate on a fresh copy: 255 - byte for RGB; alpha untouched. */
export function negate(image: ImageDataLike): ImageDataLike {
  const out = copy(image)
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255 - out.data[i]
    out.data[i + 1] = 255 - out.data[i + 1]
    out.data[i + 2] = 255 - out.data[i + 2]
  }
  return out
}

/** Mean of per-pixel luma over the whole image. */
export function meanLuma(image: ImageDataLike): number {
  const pixels = image.width * image.height
  if (pixels === 0) return 0
  let sum = 0
  for (let i = 0; i < image.data.length; i += 4) {
    sum += lumaByte(image.data[i], image.data[i + 1], image.data[i + 2])
  }
  return sum / pixels
}

/**
 * The spike's dual-polarity rule: a mostly-dark binarized crop (mean luma
 * < 128) is polarity-ambiguous — a hard negate made some regions unreadable
 * (§6 pitfall 1), so such crops must be read in BOTH polarities.
 */
export function needsDualPolarity(image: ImageDataLike): boolean {
  return meanLuma(image) < 128
}

/**
 * Pick the best OCR read among polarity/variant candidates, scoring exactly
 * like the spike's recognizeBest: a locale-parseable read (+1000) beats a
 * non-empty read (+100) beats higher confidence. First candidate wins ties.
 * Parsing goes through the shared parseStatValue — never a local copy.
 */
export function pickBestRead(candidates: Array<{ text: string; confidence: number }>): string {
  let bestText = ''
  let bestScore = -Infinity
  for (const candidate of candidates) {
    const text = candidate.text ?? ''
    const score =
      (parseStatValue(text).ok ? 1000 : 0) +
      (text.trim() !== '' ? 100 : 0) +
      candidate.confidence
    if (score > bestScore) {
      bestScore = score
      bestText = text
    }
  }
  return bestText
}
