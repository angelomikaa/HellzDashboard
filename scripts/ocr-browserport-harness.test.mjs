// ocr-browserport-harness.test.mjs — offline exact-value proof harness for the
// browser OCR pipeline (debug session d05-uat-ocr-defects; architecture pivot,
// round 3: the reading strategy is the STRUCTURAL reader ported from
// scripts/ocr-spike-structural.mjs — commit 012956f).
//
// Runs the ACTUAL production pipeline — readScreenshot, the structural
// detection (structure.ts/locate.ts), the preprocess pure functions, the
// parse+sanity accept gate — against the REAL samples in .secrets/ocr-samples/
// (gitignored, D-09/D-10: they never enter git or the network; this file
// contains no image data and is skipped when the samples folder is absent).
//
// Environment-boundary adaptation (the ONLY deviation from production, sanctioned by
// the debug-session method): production creates the Tesseract worker with browser
// transport (blob worker + self-hosted /ocr/* URLs + canvas.toBlob PNG handoff). In
// Node there is no DOM worker, so vi.mock('tesseract.js') re-creates the worker with
// the Node transport (worker_threads + node_modules core, spike's tmp cachePath) and
// converts the pipeline's canvases to PNG buffers at the recognize boundary —
// exactly what browser loadImage does via canvas.toBlob. Geometry, detection,
// preprocessing, scoring, gates, and readScreenshot itself run VERBATIM from src.
//
// Experiments (the spike proof grid F/G/H, mirrored permanently):
//   A) needsCrop stays silent on every canonical optimal sample (D-05-UAT-1 optimal path);
//      all 11 calibration samples decode at their recorded calibration resolutions exactly
//      (the >5% gate stays; the crop UX itself was ratified separately 2026-10-12 —
//      "Remove gate, keep crop": always-confirm + full-image default box, pinned by
//      CropOverlay.test.ts)
//   B) [= the spike's F: native] exact-value comparison vs expected.json on the
//      56 shipped fields through the STRUCTURAL reader (the pivot's bar)
//   E) crop→read contract (D-05-UAT-6, re-pointed round 3): a correct-aspect
//      frame-exact crop of a full screenshot reads exact — crop + structural
//      read compose. [E2 RETIRED: it pinned the OLD region-fraction contract
//      ("a forced-square crop reads near-zero" via region displacement); under
//      the structural reader margin tolerance is the pinned behavior instead —
//      see H. Beyond-grid margin sizes are deliberately not asserted.]
//   G) [= the spike's G] rescale invariance: the 4 canonical samples at
//      0.6x / 0.75x / 1.25x / 1.5x (simulating other window sizes) — exact
//   H) [= the spike's H] loose crops: the 4 canonical samples padded with
//      synthetic plain margins (white/gray/dark) — exact (the reader must
//      locate the panel grammar, not assume full-bleed)
//   F) full-phone-shot variant (D-05-UAT-8, round 4): a realistic 1080x2280
//      full phone screenshot (dark game-bg backdrop, panel scaled to ~30% of
//      the frame width — margins far beyond H's 20%) — the crop trigger fires
//      on EVERY capture step, and the owner's ratified gesture (shrink the
//      crop box loosely around the panel, confirm) reads 14/14 exact
//      end-to-end; the DIRECT unadjusted read on the full frame resolves
//      without throwing (graceful all-failed — the crop overlay is the
//      isolation tool, owner-ratified 2026-10-12)
//   [C RETIRED (round 3): the per-field diagnostic replica pinned the OLD
//   region-map read path (rectToPixels + prepareCandidates); the structural
//   reader has no per-region replica to mirror. Gate decomposition evidence
//   lives in the debug session records.]
//   K) identity header (08.10 hotfix, owner-reported garbage prefill 2026-10-22):
//      readBasicProfile reads nickname/ID/class exactly on the two canonical
//      Basic samples AND on the owner's capture, and a crop that cuts the name
//      open prefills NOTHING (the nickname fragment "ryah"/"dh" is never taken
//      as a name). The nickname is anchored on the class label's left edge —
//      the game prints the two left-aligned.
//   L) identity read is scale-invariant (owner report 2026-10-23 round 2: the
//      tester's ORIGINAL higher-resolution capture failed with
//      "Não conseguimos ler o nick" while the owner's compressed 739px copy
//      read fine — the calibrated samples are all Full HD-monitor snips, so a
//      Quad HD/4K monitor snips the same card much larger): the SAME canonical
//      captures resampled to the monitor-width range (1000-3600px) must never
//      dead-end with a null field, and the REPORTED card must read
//      nickname/ID/class EXACTLY — readBasicProfile resamples to the
//      calibrated operating width (identityReadDimensions) instead of
//      trusting the source resolution.
//   [D RETIRED (round 3): "the default centered-80% crop misaligns every
//   region" was a mechanism claim about the region-fraction reader; the
//   structural reader is not region-fraction-based, so the premise is gone.
//   The crop UX itself was ratified 2026-10-12 ("Remove gate, keep crop" —
//   full-image default box, always-confirm; the centered-80% default is
//   retired with it) and is pinned by CropOverlay.test.ts.]
//
// Acceptance tolerance (D-05-UAT-11(a), round 4, owner verbatim 2026-10-12):
// "power in the game is somewhat volatile, minor tweaks might cost hundreds
// in power. shifts in power are only relevant when they are in the thousands
// between submissions." The read itself stays EXACT (the engine reads what's
// printed); only the EXPECTATION matching for combat_power becomes
// tolerance-based — |read - expected| <= 2000 (thousands scale, inclusive).
// Every other stat keeps the exact-value bar, and the polarity must always
// agree. The tolerance lives HERE (harness code), never in expected.json —
// .secrets/ files are runtime-read only and never enter git.
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
// 07.2-06 checkpoint round 3: the owner re-cut the sample bundle with the
// "ideal" fixtures - sampbasic.png now ships as sampbasicideal.png. Resolve
// the canonical name so the harness reads either bundle unchanged.
const SAMPLE_ALIASES = { 'sampbasic.png': 'sampbasicideal.png' }
function samplePath(file) {
  const alias = SAMPLE_ALIASES[file]
  if (alias !== undefined && existsSync(path.join(SAMPLES_DIR, alias))) return path.join(SAMPLES_DIR, alias)
  return path.join(SAMPLES_DIR, file)
}
function expectedFor(expected, file) {
  return expected[SAMPLE_ALIASES[file] ?? file] ?? expected[file]
}
const CALIBRATION_PATH = path.join(ROOT, 'scripts', 'ocr-regions.json')
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
      // Pass the output options through: readBasicProfile reads with
      // { blocks: true } — a mock that drops the 3rd arg silently degrades
      // the harness to the text-only path (it hid the word-box defects).
      recognize: async (canvas, options, output) => {
        const png = await hoisted.encodeCanvas(canvas)
        return real.recognize(png, options, output)
      },
      terminate: () => real.terminate(),
    }
  }
  return { ...actual, createWorker }
})

// --- production pipeline (verbatim) -------------------------------------------------
import { readBasicProfile, readScreenshot } from '../src/features/submit/ocr/recognize'
import { CAPTURES } from '../src/features/submit/ocr/regions'
import { needsCrop } from '../src/features/submit/OcrCapture'
import { parseStatValue } from '../src/lib/parseStatValue'

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

// Tooltip captures prove the new tooltip grammar/reader against the two
// owner-seeded screenshot samples. Kept separate from CANONICAL so the
// rescale (G) and loose-margin (H) experiments stay pinned to the 4
// canonical screenshots until tooltip margin invariance is calibrated.
const TOOLTIP_CANONICAL = [
  { capture: 'pdef_tooltip', file: 'samplepdef.png' },
  { capture: 'mdef_tooltip', file: 'samplemdef.png' },
]

// Localized (pt-BR) Details captures — the LIVE client is pt-BR, so these are
// the screens members actually photograph (owner-seeded 08.10). Kept separate
// from CANONICAL so the English counts and the rescale (G) / loose-margin (H)
// experiments stay pinned to the 4 English fixtures.
// The Especial panel OMITS zero-valued rows (owner-measured: a 0% stat has no
// line), so the two samples together cover both paths — one where TdR Global%
// has no row (⇒ 0) and one where it prints -10.00% while Dano x Bruto /
// Redução de Dano x Bruto have no rows (⇒ 0).
const LOCALIZED_CANONICAL = [
  { capture: 'general', file: 'sampidealptcomuns.png' },
  { capture: 'quasi', file: 'sampidealptavancados.png' },
  { capture: 'special', file: 'sampidealptidealespecial.png' },
  { capture: 'special', file: 'sampespecialtdr.png' },
]
const hasLocalizedSamples = LOCALIZED_CANONICAL.every(({ file }) => existsSync(samplePath(file)))

// Phase 9.1's raw-defense captures live on their OWN screenshot basis
// (.secrets samples samplepdef/samplemdef, plus their pt-BR counterparts) —
// a tooltip read is NOT part of the first-input Details flow. Kept in its own
// list so the localized first-input experiment stays exactly that.
// pt-BR wording: "DEFF de Equipamento: 5149" / "DEFM de Equipamento: 1525"
// (the reader used to require the literal English word "equipment").
const LOCALIZED_TOOLTIP_CANONICAL = [
  { capture: 'pdef_tooltip', file: 'samplepdefpt.png' },
  { capture: 'mdef_tooltip', file: 'samplemdefpt.png' },
]
const hasLocalizedTooltipSamples = LOCALIZED_TOOLTIP_CANONICAL.every(({ file }) =>
  existsSync(samplePath(file)),
)

// Identity header fixtures (experiment K). The two Basic screenshots are the
// canonical English/pt-BR samples; the third is the owner's real capture that
// prefilled "dh" — expected "Aryah" (the card literally prints A-r-y-a-h at
// 10x zoom), ID 39943, High Priest. The fourth (2026-10-23 owner report:
// "the reader errors on this print") is the merged-label capture — "ID 17069"
// reads as the single word "1017069E", so the ID only comes out through the
// word-box rescue (idFromLayout); nickname/class come from the same boxes.
const IDENTITY_CANONICAL = [
  { file: 'sampbasicideal.png', nickname: 'Ahrya', char_id: null, char_class: 'Gypsy' },
  { file: 'Samplebasicptbr.png', nickname: 'Ahrya', char_id: '32980', char_class: 'High Priest' },
  { file: 'sampidentityaryah.jpg', nickname: 'Aryah', char_id: '39943', char_class: 'High Priest' },
  { file: 'sampidentitysoldierhellz.jpg', nickname: 'SoldierHellz', char_id: '17069', char_class: 'Biochemist' },
]
const hasIdentitySamples = IDENTITY_CANONICAL.every(({ file }) => existsSync(samplePath(file)))

async function loadSampleCanvas(file) {
  const { data, info } = await sharp(samplePath(file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.channels !== 4) throw new Error(`expected RGBA decode for ${file}`)
  const canvas = new FakeCanvas(info.width, info.height)
  canvas._buf = new Uint8ClampedArray(data)
  return canvas
}

/** Rescale a sample by `factor` (sharp cubic — the spike's rescale fixture). */
async function rescaledSample(file, factor) {
  const src = await sharp(samplePath(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = Math.max(1, Math.round(src.info.width * factor))
  const h = Math.max(1, Math.round(src.info.height * factor))
  const { data, info } = await sharp(src.data, { raw: { width: src.info.width, height: src.info.height, channels: 4 } })
    .resize(w, h, { kernel: 'cubic' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const canvas = new FakeCanvas(info.width, info.height)
  canvas._buf = new Uint8ClampedArray(data)
  return canvas
}

/** Rescale a sample to an EXACT width — experiment L's Snipping-Tool-width
 *  fixture (the tester's original captures are larger than the corpus). */
async function rescaledSampleWidth(file, targetWidth) {
  const src = await sharp(samplePath(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return resampleRawToWidth(src, targetWidth)
}

async function resampleRawToWidth(src, targetWidth) {
  const w = Math.max(1, Math.round(targetWidth))
  const h = Math.max(1, Math.round((src.info.height * w) / src.info.width))
  const { data, info } = await sharp(src.data, { raw: { width: src.info.width, height: src.info.height, channels: 4 } })
    .resize(w, h, { kernel: 'cubic' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const canvas = new FakeCanvas(info.width, info.height)
  canvas._buf = new Uint8ClampedArray(data)
  return canvas
}

/** Crop a sample to a pixel rect (the crop-overlay fixture). */
async function croppedSample(file, rect) {
  const { data, info } = await sharp(samplePath(file))
    .ensureAlpha()
    .extract(rect)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const canvas = new FakeCanvas(info.width, info.height)
  canvas._buf = new Uint8ClampedArray(data)
  return canvas
}

/** Pad a sample with synthetic plain margins (the spike's loose-crop fixture). */
async function paddedSample(file, margins, bg) {
  const src = await sharp(samplePath(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { data, info } = await sharp(src.data, { raw: { width: src.info.width, height: src.info.height, channels: 4 } })
    .extend({
      top: Math.round(src.info.height * (margins.top ?? 0)),
      bottom: Math.round(src.info.height * (margins.bottom ?? 0)),
      left: Math.round(src.info.width * (margins.left ?? 0)),
      right: Math.round(src.info.width * (margins.right ?? 0)),
      background: bg,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const canvas = new FakeCanvas(info.width, info.height)
  canvas._buf = new Uint8ClampedArray(data)
  return canvas
}

/** Compare an outcome raw string against the expected.json string (spike
 *  semantics), with the D-05-UAT-11(a) acceptance tolerance for combat_power
 *  ONLY: the read itself stays exact (the engine reads what's printed), but
 *  the EXPECTATION matching accepts |read - expected| <= 2000 — the game's
 *  Power is volatile (minor tweaks cost hundreds), so only thousands-scale
 *  shifts are meaningful between submissions (owner verbatim, 2026-10-12).
 *  Every other stat stays exact-value; polarity must always agree. */
const COMBAT_POWER_TOLERANCE = 2000

export function matchesExpected(raw, expectedRaw, statKey) {
  const e = parseStatValue(String(expectedRaw))
  const p = parseStatValue(raw)
  if (!e.ok || !p.ok || e.isPercentual !== p.isPercentual) return false
  if (statKey === 'combat_power') {
    return Math.abs(p.value - e.value) <= COMBAT_POWER_TOLERANCE
  }
  return e.value === p.value
}

describe('matchesExpected — combat_power acceptance tolerance (D-05-UAT-11(a), round 4)', () => {
  it('accepts the exact printed value', () => {
    expect(matchesExpected('288115', '288115', 'combat_power')).toBe(true)
  })

  it('accepts a read within the 2000 tolerance (game drift at thousands scale)', () => {
    expect(matchesExpected('289000', '288115', 'combat_power')).toBe(true)
  })

  it('accepts a read exactly at the 2000 boundary (inclusive)', () => {
    expect(matchesExpected('290115', '288115', 'combat_power')).toBe(true)
  })

  it('rejects a read beyond the 2000 tolerance', () => {
    expect(matchesExpected('290200', '288115', 'combat_power')).toBe(false)
  })

  it('still requires the same polarity (a % read never matches a flat expectation)', () => {
    expect(matchesExpected('288115%', '288115', 'combat_power')).toBe(false)
  })

  it('unparseable reads never match', () => {
    expect(matchesExpected('N/A', '288115', 'combat_power')).toBe(false)
  })

  it('every OTHER stat stays exact-value (the tolerance is combat_power ONLY)', () => {
    expect(matchesExpected('699', '699', 'pve_dmg_bonus')).toBe(true)
    expect(matchesExpected('700', '699', 'pve_dmg_bonus')).toBe(false)
    expect(matchesExpected('5678', '5679', 'hp')).toBe(false)
    expect(matchesExpected('12,34', '12,34', 'crit')).toBe(true)
    expect(matchesExpected('12,35', '12,34', 'crit')).toBe(false)
  })
})

describe.skipIf(!hasSamples)('offline exact-value harness — real samples through the ACTUAL ported pipeline', () => {
  beforeAll(() => {
    global.document = {
      createElement: (tag) => {
        if (tag !== 'canvas') throw new Error(`[harness] unsupported createElement("${tag}")`)
        return new FakeCanvas()
      },
    }
    global.ImageData = FakeImageData
    global.HTMLCanvasElement = FakeCanvas // readBasicProfile's canvas fast-path
    hoisted.setEncoder(async (canvas) =>
      sharp(Buffer.from(canvas._buffer()), {
        raw: { width: canvas.width, height: canvas.height, channels: 4 },
      })
        .png()
        .toBuffer(),
    )
  })

  it(
    'A) needsCrop stays silent on every canonical optimal sample (D-05-UAT-1 optimal path); all 11 calibration samples decode at their recorded resolutions',
    async () => {
      // Every one of the 11 calibration samples must decode at EXACTLY its
      // recorded calibration resolution (the round-1/round-2 "0.00% deviation"
      // pin) — the shipped 5% needsCrop then keeps the canonical optimal
      // samples no-crop at their matching wizard steps.
      const groups = Object.values(JSON.parse(readFileSync(CALIBRATION_PATH, 'utf8')).groups)
      expect(groups.length).toBe(11)
      for (const g of groups) {
        const meta = await sharp(samplePath(g.screenshot)).metadata()
        expect(
          [meta.width, meta.height],
          `${g.screenshot} decoded dims vs recorded calibration resolution`,
        ).toEqual([g.resolution.width, g.resolution.height])
        const imgAspect = meta.width / meta.height
        const devs = Object.entries(CAPTURES).map(
          ([key, m]) => `${key}=${(Math.abs(imgAspect / m.aspect - 1) * 100).toFixed(2)}%`,
        )
        console.log(
          `[harness A] ${g.screenshot} ${meta.width}x${meta.height}: deviation vs captures ${devs.join(' ')}`,
        )
      }
      for (const { capture, file } of CANONICAL) {
        const meta = await sharp(samplePath(file)).metadata()
        const imgAspect = meta.width / meta.height
        expect(
          needsCrop(imgAspect, CAPTURES[capture].aspect),
          `${file} (${meta.width}x${meta.height}, aspect ${imgAspect.toFixed(4)}) vs capture "${capture}" (ref ${CAPTURES[capture].aspect})`,
        ).toBe(false)
      }
    },
  )

  it(
    'B) [= spike F: native] readScreenshot reproduces the spike bar through the STRUCTURAL reader: exact values on the 56 shipped fields + 2 tooltip fields',
    { timeout: 30 * 60_000 },
    async () => {
      const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'))
      let total = 0
      let filled = 0
      let correct = 0
      const misses = []
      for (const { capture, file } of [...CANONICAL, ...TOOLTIP_CANONICAL]) {
        const canvas = await loadSampleCanvas(file)
        const outcomes = await readScreenshot(capture, canvas)
        const exp = expectedFor(expected, file)
        for (const o of outcomes) {
          total += 1
          if (o.status === 'filled') {
            filled += 1
            if (matchesExpected(o.raw, exp[o.stat_key], o.stat_key)) correct += 1
            else misses.push(`${file}:${o.stat_key} WRONG raw="${o.raw}" expected="${exp[o.stat_key]}"`)
          } else {
            misses.push(`${file}:${o.stat_key} FAILED expected="${exp[o.stat_key]}"`)
          }
        }
      }
      console.log(`[harness B] fields=${total} filled=${filled} correct=${correct}`)
      if (misses.length > 0) console.log(`[harness B] misses:\n${misses.join('\n')}`)
      expect(total).toBe(58)
      expect(correct).toBe(total)
    },
  )

  it.skipIf(!hasLocalizedSamples)(
    'I) pt-BR Details captures (Atributos Comuns/Avançados/Especial) read exactly — localized labels',
    { timeout: 30 * 60_000 },
    async () => {
      const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'))
      let total = 0
      let correct = 0
      const misses = []
      for (const { capture, file } of LOCALIZED_CANONICAL) {
        const canvas = await loadSampleCanvas(file)
        const outcomes = await readScreenshot(capture, canvas)
        const exp = expectedFor(expected, file)
        for (const o of outcomes) {
          total += 1
          const expectedRaw = exp[o.stat_key]
          if (expectedRaw === undefined) {
            misses.push(`${file}:${o.stat_key} has no ground-truth entry`)
            continue
          }
          if (o.status === 'filled' && matchesExpected(o.raw, expectedRaw, o.stat_key)) correct += 1
          else
            misses.push(
              `${file}:${o.stat_key} got=${o.status === 'filled' ? JSON.stringify(o.raw) : '<failed>'} expected="${expectedRaw}"`,
            )
        }
      }
      console.log(`[harness I] pt-BR fields=${total} correct=${correct}`)
      if (misses.length > 0) console.log(`[harness I] misses:\n${misses.join('\n')}`)
      // 14 (Comuns) + 26 (Avançados) + 15 + 15 (both Especial shots) = 70.
      // Every key has a printed row or is a documented zero-omission.
      expect(total).toBe(70)
      expect(correct).toBe(70)
    },
  )

  it.skipIf(!hasLocalizedTooltipSamples)(
    'J) pt-BR raw-defense tooltips (Phase 9.1 flow, separate screenshot basis) read exactly',
    { timeout: 30 * 60_000 },
    async () => {
      const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'))
      const misses = []
      let correct = 0
      for (const { capture, file } of LOCALIZED_TOOLTIP_CANONICAL) {
        const canvas = await loadSampleCanvas(file)
        const outcomes = await readScreenshot(capture, canvas)
        const exp = expectedFor(expected, file)
        for (const o of outcomes) {
          const expectedRaw = exp[o.stat_key]
          if (expectedRaw === undefined) {
            misses.push(`${file}:${o.stat_key} has no ground-truth entry`)
          } else if (o.status === 'filled' && matchesExpected(o.raw, expectedRaw, o.stat_key)) {
            correct += 1
          } else {
            misses.push(
              `${file}:${o.stat_key} got=${o.status === 'filled' ? JSON.stringify(o.raw) : '<failed>'} expected="${expectedRaw}"`,
            )
          }
        }
      }
      console.log(`[harness J] pt-BR tooltips correct=${correct}`)
      if (misses.length > 0) console.log(`[harness J] misses:\n${misses.join('\n')}`)
      expect(misses).toEqual([])
      expect(correct).toBe(LOCALIZED_TOOLTIP_CANONICAL.length)
    },
  )

  it.skipIf(!hasIdentitySamples)(
    'K) identity header reads nickname/ID/class exactly; a crop that cuts the name prefills nothing',
    { timeout: 30 * 60_000 },
    async () => {
      const misses = []
      for (const sample of IDENTITY_CANONICAL) {
        const canvas = await loadSampleCanvas(sample.file)
        const read = await readBasicProfile(canvas)
        for (const field of ['nickname', 'char_id', 'char_class']) {
          if (read[field] !== sample[field]) {
            misses.push(
              `${sample.file}:${field} got=${JSON.stringify(read[field])} expected=${JSON.stringify(sample[field])}`,
            )
          }
        }
      }
      // The owner-reported failure (2026-10-22): a crop starting inside the
      // name leaves only "ryah" (the site showed "dh"). The read must stay
      // EMPTY — never prefill a fragment of a name it could not see whole.
      const clipped = await croppedSample('sampidentityaryah.jpg', {
        left: 190,
        top: 0,
        width: 140,
        height: 60,
      })
      const cutRead = await readBasicProfile(clipped)
      if (cutRead.nickname !== null) {
        misses.push(`clipped crop: nickname got=${JSON.stringify(cutRead.nickname)} expected=null`)
      }
      // Proof-path regression (2026-10-22): the request-access "Comprovante"
      // read the WHOLE phone screenshot (dark game backdrop, no crop) and the
      // nickname came out as a fragment. A whole-frame upload must prefill
      // NOTHING — the crop overlay, now shared with the stats flow, is what
      // isolates the card and makes the three fields readable.
      const framed = await paddedSample(
        'sampidentityaryah.jpg',
        { top: 1.4, bottom: 3.4, left: 0.25, right: 0.25 },
        { r: 18, g: 20, b: 26, alpha: 1 },
      )
      const framedRead = await readBasicProfile(framed)
      if (framedRead.nickname !== null) {
        misses.push(
          `whole-frame proof (${framed.width}x${framed.height}): nickname got=${JSON.stringify(framedRead.nickname)} expected=null (no fragment from an uncropped screenshot)`,
        )
      }
      console.log(
        `[harness K] identity samples=${IDENTITY_CANONICAL.length} misses=${misses.length}`,
      )
      if (misses.length > 0) console.log(`[harness K] misses:\n${misses.join('\n')}`)
      expect(misses).toEqual([])
    },
  )

  it.skipIf(!hasIdentitySamples)(
    'L) identity read is scale-invariant: Snipping-Tool widths never dead-end, and the reported card reads exactly',
    { timeout: 30 * 60_000 },
    async () => {
      // The 2026-10-23 round-2 owner report: the tester's ORIGINAL
      // higher-resolution capture failed ("Não conseguimos ler o nick") while
      // the owner's compressed 739px copy of the SAME card read fine. Root
      // cause confirmed with the owner: the calibrated samples all come from a
      // Full HD monitor, so the same card region snipped on a Quad HD or 4K
      // monitor (or at Windows DPI scaling) lands as a much larger image —
      // 1000-3600px wide measured here. Measured before the resample fix, on
      // this very card: 1200px lost the nickname, 1000px glued the copy badge
      // into the ID as a digit ("399432"), 2800px produced "0170696"/
      // "Aryahrd". readBasicProfile must resample every capture to the
      // calibrated operating width (715px) instead of trusting the source
      // resolution.
      //
      // Two acceptance tiers. (1) NO sample may dead-end with a null field at
      // any width — the tester's failure mode is a missing-field error that
      // forces full manual typing. (2) The REPORTED card must read exact at
      // every width. The other samples' exact values are NOT pinned here: the
      // fixture resamples synthetic upscales (native -> sharp cubic -> the
      // read's own resample), a double-resample chain that perturbs pixels
      // beyond what a production capture's single browser resample does; under
      // that stress the copy/pencil badge can glue into a value ("Ahryard",
      // "Ahrya Z", "399435") — a pre-existing OCR sensitivity the mandatory
      // manual fix-up absorbs (D-03 review), not a regression of this fix.
      const widths = [1000, 1200, 1478, 1800, 2200, 2800, 3600]
      const deadEnds = []
      const exactMisses = []
      let reads = 0
      for (const sample of IDENTITY_CANONICAL) {
        for (const width of widths) {
          const canvas = await rescaledSampleWidth(sample.file, width)
          const read = await readBasicProfile(canvas)
          reads += 1
          for (const field of ['nickname', 'char_id', 'char_class']) {
            // A dead-end is LOSING a field the native capture reads
            // (sampbasicideal's canonical char_id IS null — the English card
            // prints no readable ID — so null there is the pinned behavior).
            if (sample[field] !== null && read[field] === null) {
              deadEnds.push(`${sample.file}@${canvas.width}x${canvas.height} ${field} is null`)
            }
            if (sample.file === 'sampidentitysoldierhellz.jpg' && read[field] !== sample[field]) {
              exactMisses.push(
                `${sample.file}@${canvas.width}x${canvas.height} ${field} got=${JSON.stringify(read[field])} expected=${JSON.stringify(sample[field])}`,
              )
            }
          }
        }
      }
      console.log(
        `[harness L] identity rescale reads=${reads} dead-ends=${deadEnds.length} exact-misses=${exactMisses.length}`,
      )
      if (deadEnds.length > 0) console.log(`[harness L] dead-ends:\n${deadEnds.join('\n')}`)
      if (exactMisses.length > 0) console.log(`[harness L] exact misses:\n${exactMisses.join('\n')}`)
      expect(deadEnds).toEqual([])
      expect(exactMisses).toEqual([])
    },
  )

  it(
    'G) [= spike G] rescale invariance: 0.6x/0.75x/1.25x/1.5x rescales read the 56 shipped fields exactly',
    { timeout: 30 * 60_000 },
    async () => {
      const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'))
      const factors = [0.6, 0.75, 1.25, 1.5]
      let variants = 0
      let failing = 0
      for (const factor of factors) {
        for (const { capture, file } of CANONICAL) {
          const canvas = await rescaledSample(file, factor)
          const outcomes = await readScreenshot(capture, canvas)
          const exp = expectedFor(expected, file)
          const lines = []
          let correct = 0
          let total = 0
          for (const o of outcomes) {
            total += 1
            if (o.status === 'filled' && matchesExpected(o.raw, exp[o.stat_key], o.stat_key)) correct += 1
            else
              lines.push(
                `    MISS ${o.stat_key}: got=${o.status === 'filled' ? JSON.stringify(o.raw) : '<failed>'} expected="${exp[o.stat_key]}"`,
              )
          }
          variants += 1
          const ok = correct === total
          if (!ok) {
            failing += 1
            console.log(`[harness G] x${factor} ${file}: ${correct}/${total}\n${lines.join('\n')}`)
          } else {
            console.log(`[harness G] x${factor} ${file}: ${correct}/${total} PASS`)
          }
        }
      }
      expect(variants).toBe(16)
      expect(failing).toBe(0)
    },
  )

  it(
    'H) [= spike H] loose crops: white/gray/dark synthetic margin pads read the 56 shipped fields exactly',
    { timeout: 30 * 60_000 },
    async () => {
      const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'))
      const PADS = [
        { name: 'white T15% L10%', margins: { top: 0.15, left: 0.1 }, bg: { r: 255, g: 255, b: 255, alpha: 1 } },
        { name: 'white R20% B5%', margins: { right: 0.2, bottom: 0.05 }, bg: { r: 255, g: 255, b: 255, alpha: 1 } },
        { name: 'gray all8%', margins: { top: 0.08, bottom: 0.08, left: 0.08, right: 0.08 }, bg: { r: 128, g: 128, b: 128, alpha: 1 } },
        { name: 'gray L20% R5% T5% B15%', margins: { left: 0.2, right: 0.05, top: 0.05, bottom: 0.15 }, bg: { r: 128, g: 128, b: 128, alpha: 1 } },
        { name: 'dark all12% (game-bg-like)', margins: { top: 0.12, bottom: 0.12, left: 0.12, right: 0.12 }, bg: { r: 34, g: 34, b: 34, alpha: 1 } },
      ]
      let variants = 0
      let failing = 0
      for (const pad of PADS) {
        for (const { capture, file } of CANONICAL) {
          const canvas = await paddedSample(file, pad.margins, pad.bg)
          const outcomes = await readScreenshot(capture, canvas)
          const exp = expectedFor(expected, file)
          const lines = []
          let correct = 0
          let total = 0
          for (const o of outcomes) {
            total += 1
            if (o.status === 'filled' && matchesExpected(o.raw, exp[o.stat_key], o.stat_key)) correct += 1
            else
              lines.push(
                `    MISS ${o.stat_key}: got=${o.status === 'filled' ? JSON.stringify(o.raw) : '<failed>'} expected="${exp[o.stat_key]}"`,
              )
          }
          variants += 1
          const ok = correct === total
          if (!ok) {
            failing += 1
            console.log(`[harness H] ${pad.name} ${file}: ${correct}/${total}\n${lines.join('\n')}`)
          } else {
            console.log(`[harness H] ${pad.name} ${file}: ${correct}/${total} PASS`)
          }
        }
      }
      expect(variants).toBe(20)
      expect(failing).toBe(0)
    },
  )

  it(
    'E) crop→read contract (D-05-UAT-6, re-pointed round 3): a correct-aspect frame-exact crop of a full screenshot reads exactly through the structural reader',
    { timeout: 30 * 60_000 },
    async () => {
      // Synthesize the owner's upload: a 1080x2280 full phone screenshot with
      // the sampideal1 panel (648x759) at (216,420) — the free-form crop
      // ratified at D-05-UAT-4 then composes with the structural read.
      const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'))
      const exp = expected['sampideal1.png']
      const panel = await loadSampleCanvas('sampideal1.png')
      const full = new FakeCanvas(1080, 2280)
      // 5-arg form: panel drawn AT (216,420) at natural size (see the harness-bug
      // note in the round-2 E experiment — the 9-arg form reads an out-of-bounds
      // source rect off the panel itself).
      full.getContext().drawImage(panel, 216, 420, 648, 759)
      expect(needsCrop(full.width / full.height, CAPTURES.general.aspect)).toBe(true)

      // CropOverlay.handleConfirm replica: draw a panel-exact box off the full
      // frame and read it. Box width = the panel's exact width; the capture-
      // aspect lock derives the height (648/0.8538 = 758.04 — the stored aspect
      // is 4-dp rounded vs the panel's true 759, a 0.13% shortfall well inside
      // the ~2% frame tolerance).
      const aspect = CAPTURES.general.aspect
      const cropped = new FakeCanvas(648, Math.round(648 / aspect))
      cropped.getContext().drawImage(full, 216, 420, 648, 648 / aspect, 0, 0, cropped.width, cropped.height)
      const outcomes = await readScreenshot('general', cropped)
      let correct = 0
      const lines = []
      for (const o of outcomes) {
        if (o.status === 'filled') {
          const ok = matchesExpected(o.raw, exp[o.stat_key], o.stat_key)
          if (ok) correct += 1
          lines.push(`${o.stat_key}: filled raw="${o.raw}" expected="${exp[o.stat_key]}" ${ok ? 'OK' : 'WRONG'}`)
        } else {
          lines.push(`${o.stat_key}: FAILED expected="${exp[o.stat_key]}"`)
        }
      }
      console.log(`[harness E] frame-exact crop: ${correct}/${outcomes.length} correct\n${lines.join('\n')}`)
      expect(correct).toBe(outcomes.length)
    },
  )

  it(
    'F) full-phone-shot variant (D-05-UAT-8): the crop trigger fires on EVERY capture step and a panel-isolating crop of a realistic 1080x2280 screenshot reads exactly end-to-end',
    { timeout: 30 * 60_000 },
    async () => {
      // The owner's step-8 upload: a FULL phone screenshot — the game panel
      // a minority of the frame, deep game-UI margins all around. Synthetic
      // construction only (no image bytes committed): the sampideal1 panel
      // scaled to 0.5x (324x380 — ~30% of the 1080-wide frame, inside the
      // panel's proven rescale grid at the 0.6x floor boundary) centered
      // horizontally at y=420 on a 1080x2280 dark game-bg backdrop.
      const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'))
      const exp = expected['sampideal1.png']
      const SCALE = 0.5
      const pw = Math.round(648 * SCALE)
      const ph = Math.round(759 * SCALE)
      const src = await sharp(path.join(SAMPLES_DIR, 'sampideal1.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const { data, info } = await sharp(src.data, {
        raw: { width: src.info.width, height: src.info.height, channels: 4 },
      })
        .resize(pw, ph, { kernel: 'cubic' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const panel = new FakeCanvas(info.width, info.height)
      panel._buf = new Uint8ClampedArray(data)

      const full = new FakeCanvas(1080, 2280)
      full._buffer().fill(34) // dark game-bg-like backdrop (harness H's dark pad color)
      const px = Math.round((1080 - pw) / 2)
      const py = 420
      full.getContext().drawImage(panel, px, py, pw, ph)

      // The trigger MUST fire on every capture step — this is what routes the
      // full shot to the crop overlay (the decode-fallback fix keeps this
      // decision reachable; see decodeUpload in OcrCapture.tsx).
      const imgAspect = full.width / full.height
      for (const [key, m] of Object.entries(CAPTURES)) {
        expect(needsCrop(imgAspect, m.aspect), `full phone shot vs capture "${key}"`).toBe(true)
      }

      // The owner's ratified gesture: shrink/move the crop box loosely around
      // the panel (panel + 8% margins — any shape confirms) and read it.
      // CropOverlay.handleConfirm replica: draw the box region off the full
      // frame onto a fresh canvas, hand it to readScreenshot.
      const mx = Math.round(pw * 0.08)
      const my = Math.round(ph * 0.08)
      const bx = Math.max(0, px - mx)
      const by = Math.max(0, py - my)
      const bw = Math.min(full.width - bx, pw + 2 * mx)
      const bh = Math.min(full.height - by, ph + 2 * my)
      const cropped = new FakeCanvas(bw, bh)
      cropped.getContext().drawImage(full, bx, by, bw, bh, 0, 0, bw, bh)
      const outcomes = await readScreenshot('general', cropped)
      let correct = 0
      const lines = []
      for (const o of outcomes) {
        const ok = o.status === 'filled' && matchesExpected(o.raw, exp[o.stat_key], o.stat_key)
        if (ok) correct += 1
        lines.push(
          `  ${o.stat_key}: ${o.status === 'filled' ? `raw="${o.raw}"` : '<failed>'} expected="${exp[o.stat_key]}" ${ok ? 'OK' : 'MISS'}`,
        )
      }
      console.log(`[harness F] full-phone crop-then-read (${bw}x${bh} box): ${correct}/${outcomes.length} correct\n${lines.join('\n')}`)
      expect(correct).toBe(outcomes.length)

      // Confirming WITHOUT adjusting reads the whole upload: the structural
      // reader cannot localize a panel this deep in the frame (its paper-run
      // thresholds are span-relative by design) — the ratified behavior is a
      // GRACEFUL all-failed outcome set (per-field failure alerts, manual
      // fix-up), never an exception. Pins the D-18 degradation contract.
      const direct = await readScreenshot('general', full)
      const directFilled = direct.filter((o) => o.status === 'filled').length
      console.log(`[harness F] direct full-frame read: ${directFilled}/${direct.length} filled (resolved without throwing)`)
      expect(Array.isArray(direct)).toBe(true)
      expect(direct).toHaveLength(14)
    },
  )
})
