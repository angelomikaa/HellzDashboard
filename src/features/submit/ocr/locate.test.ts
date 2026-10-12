// Panel localization tests (architecture pivot, D-05-UAT round 3 — TDD RED).
// Pure functions over synthetic ImageData-shaped fixtures — background-
// independent panel localization (white/gray/dark margins), ported verbatim
// from scripts/ocr-spike-structural.mjs (commit 012956f).
import { describe, expect, it } from 'vitest'
import { computePanelRect, longestPaperRun, panelRowRange, paperProfile } from './locate'
import type { ImageDataLike } from './preprocess'

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

const CREAM: [number, number, number] = [240, 236, 220] // luma ~235, chroma 20 — panel paper
const DARK: [number, number, number] = [34, 34, 34] // game backdrop
const GRAY: [number, number, number] = [128, 128, 128]

describe('paperProfile (cream-paper mask: high luma + low chroma)', () => {
  it('counts paper pixels per column (axis x) and per row (axis y)', () => {
    const img = makeImg(6, 3)
    fillRect(img, 0, 1, 0, 3, DARK)
    fillRect(img, 1, 5, 0, 3, CREAM)
    fillRect(img, 5, 6, 0, 3, GRAY) // luma 128 — fails the luma test
    expect([...paperProfile(img, 'x')]).toEqual([0, 3, 3, 3, 3, 0])
    expect([...paperProfile(img, 'y')]).toEqual([4, 4, 4])
  })
})

describe('longestPaperRun', () => {
  it('finds the longest merged run reaching frac*span', () => {
    const counts = new Int32Array([5, 5, 0, 9, 9, 9, 0])
    // threshold = 0.5 * 10 = 5; runs {0,2},{3,6}; mergeGap = round(0.03*7)=0
    expect(longestPaperRun(counts, 0.5, 10)).toEqual({ from: 3, to: 6 })
  })
  it('returns null when nothing qualifies', () => {
    expect(longestPaperRun(new Int32Array(8), 0.4, 10)).toBeNull()
  })
})

describe('panelRowRange (first..last qualifying run — separator bars are internal gaps)', () => {
  it('spans the first through the last qualifying run', () => {
    const counts = new Int32Array([5, 5, 0, 0, 5, 0, 5, 5, 0])
    // threshold = 0.5 * 4 = 2; runs {0,2},{4,5},{6,8}; all qualify (>= 0.05*9)
    expect(panelRowRange(counts, 0.5, 4)).toEqual({ from: 0, to: 8 })
  })
  it('returns null when no run qualifies', () => {
    expect(panelRowRange(new Int32Array(9), 0.5, 4)).toBeNull()
  })
})

describe('computePanelRect (background-independent panel localization)', () => {
  it('locates a cream panel inside a dark game backdrop', () => {
    const img = makeImg(20, 16)
    fillRect(img, 0, 20, 0, 16, DARK)
    fillRect(img, 4, 14, 3, 13, CREAM)
    expect(computePanelRect(img)).toEqual({ left: 4, top: 3, width: 10, height: 10 })
  })
  it('locates a cream panel inside gray margins too', () => {
    const img = makeImg(20, 16)
    fillRect(img, 0, 20, 0, 16, GRAY)
    fillRect(img, 4, 14, 3, 13, CREAM)
    expect(computePanelRect(img)).toEqual({ left: 4, top: 3, width: 10, height: 10 })
  })
  it('returns null when the whole image is paper (white margins merge harmlessly)', () => {
    const img = makeImg(20, 16)
    fillRect(img, 4, 14, 3, 13, CREAM)
    fillRect(img, 0, 20, 0, 16, [255, 255, 255])
    // the white surround also passes the paper mask and carries no text —
    // cropping would change nothing, so the image is used as-is
    expect(computePanelRect(img)).toBeNull()
  })
  it('returns null when there is no credible paper rectangle at all', () => {
    const img = makeImg(20, 16)
    fillRect(img, 0, 20, 0, 16, DARK)
    expect(computePanelRect(img)).toBeNull()
  })
})
