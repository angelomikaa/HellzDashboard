// Preprocessing + read-scoring tests (plan 05-01 task 2, TDD RED).
// Pure functions over synthetic ImageData-shaped objects — no canvas, no DOM
// (vitest runs node-env, per the house pattern in ../auth/session.test.ts).
// Behavior source: 05-01-PLAN <behavior> + scripts/ocr-spike.mjs
// preprocessRegion/recognizeBest semantics + 05-RESEARCH §3.1, §6 pitfalls 1-2.
import { describe, expect, it } from 'vitest'
import {
  binarize,
  chroma,
  cropImageData,
  luma,
  meanLuma,
  negate,
  needsDualPolarity,
  normalizeContrast,
  padBinarized,
  pickBestRead,
  toGrayscale,
  type ImageDataLike,
} from './preprocess'

/** Synthetic ImageData-shaped fixture: [r, g, b, a] per pixel. */
function img(width: number, height: number, pixels: Array<[number, number, number, number]>): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4)
  pixels.forEach((pixel, i) => data.set(pixel, i * 4))
  return { data, width, height }
}

describe('toGrayscale', () => {
  it('converts each pixel to its luma in RGB, alpha preserved', () => {
    // luma(red) = round(0.299 * 255) = 76; luma(green) = round(0.587 * 255) = 150;
    // luma(blue) = round(0.114 * 255) = 29.
    const out = toGrayscale(
      img(3, 1, [
        [255, 0, 0, 255],
        [0, 255, 0, 255],
        [0, 0, 255, 128],
      ]),
    )
    expect([...out.data]).toEqual([76, 76, 76, 255, 150, 150, 150, 255, 29, 29, 29, 128])
  })
})

describe('normalizeContrast', () => {
  it('stretches {10, 200} to {0, 255}', () => {
    const out = normalizeContrast(
      img(2, 1, [
        [10, 10, 10, 255],
        [200, 200, 200, 255],
      ]),
    )
    expect([...out.data.slice(0, 4)]).toEqual([0, 0, 0, 255])
    expect([...out.data.slice(4, 8)]).toEqual([255, 255, 255, 255])
  })

  it('leaves a constant image unchanged (min == max guard, no division by zero)', () => {
    const fixture = img(2, 1, [
      [128, 128, 128, 255],
      [128, 128, 128, 255],
    ])
    const out = normalizeContrast(fixture)
    expect([...out.data]).toEqual([...fixture.data])
  })
})

describe('binarize', () => {
  it('maps luma >= threshold to 255, else 0 (alpha preserved)', () => {
    const out = binarize(
      img(2, 1, [
        [150, 150, 150, 255],
        [100, 100, 100, 200],
      ]),
      140,
    )
    expect([...out.data]).toEqual([255, 255, 255, 255, 0, 0, 0, 200])
  })

  it('defaults the threshold to 140 (spike tuning), inclusive on the boundary', () => {
    expect([...binarize(img(1, 1, [[139, 139, 139, 255]])).data]).toEqual([0, 0, 0, 255])
    expect([...binarize(img(1, 1, [[140, 140, 140, 255]])).data]).toEqual([255, 255, 255, 255])
  })
})

describe('negate', () => {
  it('flips RGB bytes around 255, alpha untouched', () => {
    const out = negate(img(1, 1, [[10, 200, 128, 77]]))
    expect([...out.data]).toEqual([245, 55, 127, 77])
  })
})

describe('meanLuma', () => {
  it('computes the exact mean of per-pixel luma over a fixture', () => {
    const image = img(2, 1, [
      [100, 100, 100, 255],
      [200, 200, 200, 255],
    ])
    expect(meanLuma(image)).toBe(150)
  })
})

describe('needsDualPolarity', () => {
  it('flags mostly-dark crops (mean luma < 128) as polarity-ambiguous', () => {
    // Spike rule (§6 pitfall 1): a hard negate made some regions unreadable,
    // so a mostly-dark binarized crop must be read in BOTH polarities.
    expect(needsDualPolarity(img(1, 1, [[100, 100, 100, 255]]))).toBe(true)
    expect(needsDualPolarity(img(1, 1, [[200, 200, 200, 255]]))).toBe(false)
  })
})

describe('pickBestRead (spike recognizeBest semantics)', () => {
  it('a parseable read beats an empty read even at far lower confidence', () => {
    expect(pickBestRead([{ text: '12,34%', confidence: 40 }, { text: '', confidence: 99 }])).toBe('12,34%')
  })

  it('a parseable read beats a higher-confidence unparseable one', () => {
    expect(pickBestRead([{ text: 'abc', confidence: 90 }, { text: '1.234', confidence: 30 }])).toBe('1.234')
  })

  it('both unparseable non-empty: higher confidence wins', () => {
    expect(pickBestRead([{ text: 'abc', confidence: 90 }, { text: 'xyz', confidence: 30 }])).toBe('abc')
  })

  it('both empty: returns the empty text', () => {
    expect(pickBestRead([{ text: '', confidence: 90 }, { text: '', confidence: 30 }])).toBe('')
  })

  it('parses via the shared locale rules (pt-BR single-dot 3-digit tail = thousands)', () => {
    // Parity with src/lib/parseStatValue by construction (§6 pitfall 2: the
    // OCR module must never carry a second parser).
    expect(pickBestRead([{ text: 'n/a', confidence: 99 }, { text: '1.234', confidence: 10 }])).toBe('1.234')
    expect(pickBestRead([{ text: '-33,38%', confidence: 5 }, { text: 'x', confidence: 95 }])).toBe('-33,38%')
  })

  it('returns the empty text for an empty candidate list', () => {
    expect(pickBestRead([])).toBe('')
  })
})

describe('luma/chroma (float pixel statistics — structural detection thresholds)', () => {
  it('computes ITU-R 601 luma without rounding', () => {
    expect(luma(20, 24, 58)).toBeCloseTo(26.68, 2)
    expect(luma(255, 255, 255)).toBe(255)
  })
  it('computes the max-min channel spread', () => {
    expect(chroma(142, 164, 208)).toBe(66) // the measured label-halo case
    expect(chroma(128, 128, 128)).toBe(0)
  })
})

describe('padBinarized (spike ocrRect margin — lone glyphs misread on a tight canvas)', () => {
  it('pads a constant-value border around the content, alpha opaque', () => {
    const bin = img(2, 2, [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ])
    const out = padBinarized(bin, 1, 1, 255)
    expect(out.width).toBe(4)
    expect(out.height).toBe(4)
    // border is the pad value, interior preserved
    expect([...out.data.slice(0, 4)]).toEqual([255, 255, 255, 255])
    expect([...out.data.slice((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 4)]).toEqual([0, 0, 0, 255])
    expect([...out.data.slice((2 * 4 + 2) * 4, (2 * 4 + 2) * 4 + 4)]).toEqual([0, 0, 0, 255])
  })
  it('never mutates the input', () => {
    const bin = img(1, 1, [[0, 0, 0, 255]])
    const snapshot = [...bin.data]
    padBinarized(bin, 2, 2, 255)
    expect([...bin.data]).toEqual(snapshot)
  })
})

describe('cropImageData (pure sub-rect extraction)', () => {
  it('extracts the clamped sub-rect', () => {
    const src = img(3, 3, Array.from({ length: 9 }, (_, i) => [i, i, i, 255] as [number, number, number, number]))
    const out = cropImageData(src, { left: 1, top: 1, width: 2, height: 2 })
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
    expect(out.data[0]).toBe(4) // pixel (1,1) = index 4
    expect(out.data[out.data.length - 4]).toBe(8) // pixel (2,2) = index 8
  })
  it('clamps out-of-bounds rects to the image', () => {
    const src = img(2, 2, Array.from({ length: 4 }, (_, i) => [i, i, i, 255] as [number, number, number, number]))
    const out = cropImageData(src, { left: 1, top: 1, width: 10, height: 10 })
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
  })
})
