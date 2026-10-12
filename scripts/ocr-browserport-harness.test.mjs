// ocr-browserport-harness.test.mjs — offline exact-value proof harness for the
// browser OCR pipeline (debug session d05-uat-ocr-defects, defects D-05-UAT-1/2/3).
//
// Runs the ACTUAL ported production pipeline — readScreenshot, rectToPixels, the
// preprocess pure functions, pickBestRead, the confidence/sanity gates — against the
// REAL spike-calibrated samples in .secrets/ocr-samples/ (gitignored, D-09/D-10:
// they never enter git or the network; this file contains no image data and is
// skipped when the samples folder is absent).
//
// Environment-boundary adaptation (the ONLY deviation from production, sanctioned by
// the debug-session method): production creates the Tesseract worker with browser
// transport (blob worker + self-hosted /ocr/* URLs + canvas.toBlob PNG handoff). In
// Node there is no DOM worker, so vi.mock('tesseract.js') re-creates the worker with
// the Node transport (worker_threads + node_modules core, spike's tmp cachePath) and
// converts the pipeline's region canvases to PNG buffers at the recognize boundary —
// exactly what browser loadImage does via canvas.toBlob. Geometry, preprocessing,
// scoring, gates, and readScreenshot itself run VERBATIM from src.
//
// Experiments:
//   A) needsCrop stays silent on every canonical optimal sample (D-05-UAT-1 optimal path)
//   B) exact-value comparison vs expected.json on the 56 shipped fields (the spike's
//      222/222 bar restricted to the shipped region maps)
//   C) diagnostic replica: per-field raw reads, confidences, and gate
//      decomposition (parse / sanity — the recalibrated spike-parity accept
//      gate; confidence logged for calibration evidence)
//   D) owner-flow reproduction: a full-phone-screenshot upload fires the crop, and the
//      crop overlay's DEFAULT centered-80% confirm box produces a misaligned frame
//      (mechanism candidate for D-05-UAT-2/3)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SAMPLES_DIR = path.join(ROOT, '.secrets', 'ocr-samples')
const EXPECTED_PATH = path.join(SAMPLES_DIR, 'expected.json')
const hasSamples =
  existsSync(SAMPLES_DIR) && readdirSync(SAMPLES_DIR).some((f) => /\.png$/i.test(f))

// --- tesseract.js boundary adaptation (browser transport -> node transport) --------
const hoisted = vi.hoisted(() => {
  let encoder = null
  return {
    encodeCanvas: (canvas) => encoder(canvas),
    setEncoder: (fn) => {
      encoder = fn
    },
  }
})

vi.mock('tesseract.js', async () => {
  const actual = await vi.importActual('tesseract.js')
  const nodePath = await import('node:path')
  const nodeOs = await import('node:os')
  // Same cache dir the spike used — warm from prior spike runs.
  const cachePath = nodePath.join(nodeOs.tmpdir(), 'neofoot-ocr-cache')
  const createWorker = async (langs, oem, _browserOptions) => {
    const real = await actual.createWorker(langs, oem, { cachePath })
    return {
      setParameters: (params) => real.setParameters(params),
      recognize: async (canvas) => {
        const png = await hoisted.encodeCanvas(canvas)
        return real.recognize(png)
      },
      terminate: () => real.terminate(),
    }
  }
  return { ...actual, createWorker }
})

// --- production pipeline (verbatim) -------------------------------------------------
import { readScreenshot } from '../src/features/submit/ocr/recognize'
import { CAPTURES, rectToPixels } from '../src/features/submit/ocr/regions'
import {
  binarize,
  negate,
  needsDualPolarity,
  normalizeContrast,
  pickBestRead,
  toGrayscale,
} from '../src/features/submit/ocr/preprocess'
import { sanityAccepts } from '../src/features/submit/ocr/sanity'
import { needsCrop } from '../src/features/submit/OcrCapture'
import { parseStatValue } from '../src/lib/parseStatValue'
import { createWorker, PSM } from 'tesseract.js' // the mocked (node-transport) worker factory

// --- minimal DOM shim (only what recognize.ts touches) ------------------------------
class FakeImageData {
  constructor(data, width, height) {
    this.data = data
    this.width = width
    this.height = height
  }
}

class FakeCtx {
  constructor(canvas) {
    this.canvas = canvas
    this.imageSmoothingEnabled = true
    this.imageSmoothingQuality = 'high'
  }

  /** 9-arg crop/scale form + 5-arg scale form; 1:1 fast path is an exact copy. */
  drawImage(src, a, b, c, d, e, f, g, h) {
    let sx, sy, sw, sh, dx, dy, dw, dh
    if (h !== undefined) {
      ;[sx, sy, sw, sh, dx, dy, dw, dh] = [a, b, c, d, e, f, g, h]
    } else {
      ;[dx, dy, dw, dh] = [a, b, c, d]
      sx = 0
      sy = 0
      sw = src.width
      sh = src.height
    }
    const dst = this.canvas._buffer()
    const sbuf = src._buffer()
    if (sw === dw && sh === dh) {
      for (let row = 0; row < sh; row++) {
        const srow = ((sy + row) * src.width + sx) * 4
        const drow = ((dy + row) * this.canvas.width + dx) * 4
        for (let x = 0; x < sw * 4; x++) dst[drow + x] = sbuf[srow + x]
      }
      return
    }
    // bilinear resample (browser smoothing-quality kernels differ; binarization
    // downstream quantizes the residual difference away)
    for (let py = 0; py < dh; py++) {
      const v = sy + ((py + 0.5) * sh) / dh - 0.5
      const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(v)))
      const y1 = Math.max(0, Math.min(src.height - 1, Math.floor(v) + 1))
      const fy = v - Math.floor(v)
      for (let px = 0; px < dw; px++) {
        const u = sx + ((px + 0.5) * sw) / dw - 0.5
        const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(u)))
        const x1 = Math.max(0, Math.min(src.width - 1, Math.floor(u) + 1))
        const fx = u - Math.floor(u)
        const di = ((dy + py) * this.canvas.width + dx + px) * 4
        for (let ch = 0; ch < 4; ch++) {
          const p00 = sbuf[(y0 * src.width + x0) * 4 + ch]
          const p01 = sbuf[(y0 * src.width + x1) * 4 + ch]
          const p10 = sbuf[(y1 * src.width + x0) * 4 + ch]
          const p11 = sbuf[(y1 * src.width + x1) * 4 + ch]
          dst[di + ch] = (p00 * (1 - fx) + p01 * fx) * (1 - fy) + (p10 * (1 - fx) + p11 * fx) * fy
        }
      }
    }
  }

  getImageData(x, y, w, h) {
    const buf = this.canvas._buffer()
    const out = new Uint8ClampedArray(w * h * 4)
    for (let row = 0; row < h; row++) {
      const srow = ((y + row) * this.canvas.width + x) * 4
      out.set(buf.subarray(srow, srow + w * 4), row * w * 4)
    }
    return new FakeImageData(out, w, h)
  }

  putImageData(img, dx, dy) {
    const buf = this.canvas._buffer()
    for (let row = 0; row < img.height; row++) {
      const drow = ((dy + row) * this.canvas.width + dx) * 4
      buf.set(
        img.data.subarray(row * img.width * 4, (row + 1) * img.width * 4),
        drow,
      )
    }
  }
}

export class FakeCanvas {
  constructor(width = 0, height = 0) {
    this.width = width
    this.height = height
    this._buf = null
    this._ctx = null
  }

  _buffer() {
    const need = this.width * this.height * 4
    if (this._buf === null || this._buf.length !== need) this._buf = new Uint8ClampedArray(need)
    return this._buf
  }

  getContext() {
    if (this._ctx === null) this._ctx = new FakeCtx(this)
    return this._ctx
  }
}

// --- helpers -------------------------------------------------------------------------
const CANONICAL = [
  { capture: 'basic', file: 'sampbasic.png' },
  { capture: 'general', file: 'sampideal1.png' },
  { capture: 'quasi', file: 'sampideal2.png' },
  { capture: 'special', file: 'sampideal3.png' },
]

async function loadSampleCanvas(file) {
  const { data, info } = await sharp(path.join(SAMPLES_DIR, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.channels !== 4) throw new Error(`expected RGBA decode for ${file}`)
  const canvas = new FakeCanvas(info.width, info.height)
  canvas._buf = new Uint8ClampedArray(data)
  return canvas
}

function canvasFromImageData(image) {
  const canvas = new FakeCanvas(image.width, image.height)
  canvas.getContext().putImageData(image, 0, 0)
  return canvas
}

/** Compare an outcome raw string against the expected.json string (spike semantics). */
function matchesExpected(raw, expectedRaw) {
  const e = parseStatValue(String(expectedRaw))
  const p = parseStatValue(raw)
  return e.ok && p.ok && e.value === p.value && e.isPercentual === p.isPercentual
}

describe.skipIf(!hasSamples)('offline exact-value harness — real samples through the ACTUAL ported pipeline', () => {
  beforeAll(() => {
    global.document = {
      createElement: (tag) => {
        if (tag !== 'canvas') throw new Error(`[harness] unsupported createElement("${tag}")`)
        return new FakeCanvas()
      },
    }
    global.ImageData = FakeImageData
    hoisted.setEncoder(async (canvas) =>
      sharp(Buffer.from(canvas._buffer()), {
        raw: { width: canvas.width, height: canvas.height, channels: 4 },
      })
        .png()
        .toBuffer(),
    )
  })

  it(
    'A) needsCrop stays silent on every canonical optimal sample (D-05-UAT-1 optimal path)',
    async () => {
      for (const { capture, file } of CANONICAL) {
        const meta = await sharp(path.join(SAMPLES_DIR, file)).metadata()
        const imgAspect = meta.width / meta.height
        expect(
          needsCrop(imgAspect, CAPTURES[capture].aspect),
          `${file} (${meta.width}x${meta.height}, aspect ${imgAspect.toFixed(4)}) vs capture "${capture}" (ref ${CAPTURES[capture].aspect})`,
        ).toBe(false)
      }
    },
  )

  it(
    'B) readScreenshot reproduces the spike bar: exact values on the 56 shipped fields',
    { timeout: 30 * 60_000 },
    async () => {
      const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'))
      let total = 0
      let filled = 0
      let correct = 0
      const misses = []
      for (const { capture, file } of CANONICAL) {
        const canvas = await loadSampleCanvas(file)
        const outcomes = await readScreenshot(capture, canvas)
        const exp = expected[file]
        for (const o of outcomes) {
          total += 1
          if (o.status === 'filled') {
            filled += 1
            if (matchesExpected(o.raw, exp[o.stat_key])) correct += 1
            else misses.push(`${file}:${o.stat_key} WRONG raw="${o.raw}" expected="${exp[o.stat_key]}"`)
          } else {
            misses.push(`${file}:${o.stat_key} FAILED expected="${exp[o.stat_key]}"`)
          }
        }
      }
      console.log(`[harness B] fields=${total} filled=${filled} correct=${correct}`)
      if (misses.length > 0) console.log(`[harness B] misses:\n${misses.join('\n')}`)
      expect(correct).toBe(total)
    },
  )

  it(
    'C) diagnostic replica: per-field reads, confidences, and gate decomposition',
    { timeout: 30 * 60_000 },
    async () => {
      const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'))
      const worker = await createWorker('eng', 1, {})
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789.,%-',
        user_defined_dpi: '300',
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      })
      const rows = []
      let correct = 0
      let total = 0
      for (const { capture, file } of CANONICAL) {
        const canvas = await loadSampleCanvas(file)
        const map = CAPTURES[capture]
        for (const region of map.regions) {
          const rect = rectToPixels(region.rect, canvas.width, canvas.height)
          // prepareCandidates replica (recognize.ts lines 84-120, verbatim stages)
          const crop = new FakeCanvas(rect.w, rect.h)
          crop.getContext().drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h)
          const gray = toGrayscale(crop.getContext().getImageData(0, 0, rect.w, rect.h))
          const grayCanvas = canvasFromImageData(gray)
          const up = new FakeCanvas(rect.w * 3, rect.h * 3)
          const upCtx = up.getContext()
          upCtx.imageSmoothingEnabled = true
          upCtx.imageSmoothingQuality = 'high'
          upCtx.drawImage(grayCanvas, 0, 0, rect.w * 3, rect.h * 3)
          const binarized = binarize(
            normalizeContrast(upCtx.getImageData(0, 0, rect.w * 3, rect.h * 3)),
          )
          const candidates = [canvasFromImageData(binarized)]
          const dual = needsDualPolarity(binarized)
          if (dual) candidates.push(canvasFromImageData(negate(binarized)))
          const reads = []
          for (const c of candidates) {
            const { data } = await worker.recognize(c)
            reads.push({ text: data.text || '', confidence: Number(data.confidence ?? 0) })
          }
          const best = pickBestRead(reads)
          const bestConfidence = reads.find((r) => r.text === best)?.confidence ?? 0
          const parsed = parseStatValue(best)
          const expRaw = expected[file][region.stat_key]
          const gateParse = parsed.ok && parsed.value !== null
          const gateSanity = gateParse && sanityAccepts(parsed.value, parsed.isPercentual, region.stat_key)
          // Recalibrated accept gate (spike parity, see sanity.ts header):
          // parse + sanity; confidence stays the pickBestRead tiebreak only.
          const accepted = gateParse && gateSanity
          const exact = parsed.ok && matchesExpected(best, expRaw)
          if (exact) correct += 1
          total += 1
          rows.push(
            `${file}:${region.stat_key} dual=${dual ? 'Y' : 'N'} best="${best.trim()}" conf=${bestConfidence.toFixed(1)} ` +
              `parse=${gateParse ? 'ok' : 'FAIL'} sanity=${gateSanity ? 'ok' : 'FAIL'} ` +
              `accepted=${accepted ? 'Y' : 'N'} exact=${exact ? 'Y' : 'N'} expected="${expRaw}" all=${JSON.stringify(reads.map((r) => [r.text.trim(), r.confidence.toFixed(0)]))}`,
          )
        }
      }
      await worker.terminate()
      console.log(`[harness C] ${correct}/${total} exact through the replica`)
      console.log(`[harness C] per-field:\n${rows.join('\n')}`)
      expect(total).toBe(56)
    },
  )

  it(
    'D) owner-flow reproduction: full screenshot fires the crop; the DEFAULT centered-80% confirm box misaligns every region',
    { timeout: 30 * 60_000 },
    async () => {
      // Synthesize a full phone screenshot: 1080x2280 device frame with the sampideal1
      // panel (648x759) placed inside it (game screens sit offset inside a phone shot).
      const panel = await loadSampleCanvas('sampideal1.png')
      const full = new FakeCanvas(1080, 2280)
      full.getContext().drawImage(panel, 216, 420, 648, 759, 216, 420, 648, 759)
      const fullAspect = full.width / full.height
      expect(needsCrop(fullAspect, CAPTURES.general.aspect)).toBe(true) // crop fires (D-05-UAT-1 for full screenshots)

      // CropOverlay.handleConfirm with the DEFAULT box (no drag): 80% of maxBoxWidth, centered.
      const aspect = CAPTURES.general.aspect
      const maxW = Math.min(full.width, full.height * aspect)
      const boxW = 0.8 * maxW
      const boxX = (full.width - boxW) / 2
      const boxH = boxW / aspect
      const boxY = (full.height - boxH) / 2
      const cropped = new FakeCanvas(
        Math.max(1, Math.round(boxW)),
        Math.max(1, Math.round(boxH)),
      )
      cropped.getContext().drawImage(
        full,
        boxX,
        boxY,
        boxW,
        boxH,
        0,
        0,
        cropped.width,
        cropped.height,
      )

      const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'))
      const exp = expected['sampideal1.png']
      const outcomes = await readScreenshot('general', cropped)
      let correct = 0
      let failedFields = 0
      const lines = []
      for (const o of outcomes) {
        if (o.status === 'filled') {
          const ok = matchesExpected(o.raw, exp[o.stat_key])
          if (ok) correct += 1
          lines.push(`${o.stat_key}: filled raw="${o.raw}" expected="${exp[o.stat_key]}" ${ok ? 'OK' : 'WRONG'}`)
        } else {
          failedFields += 1
          lines.push(`${o.stat_key}: FAILED expected="${exp[o.stat_key]}"`)
        }
      }
      console.log(
        `[harness D] default-crop read: correct=${correct}/${outcomes.length} failedFields=${failedFields}\n${lines.join('\n')}`,
      )
      // Documents the defect mechanism: a one-click default crop cannot reproduce the
      // spike bar (regions are displaced far beyond the ~2% frame tolerance).
      expect(correct).toBeLessThan(outcomes.length)
    },
  )
})
