// Crop-trigger boundary tests (plan 05-04 task 1, TDD RED; recalibrated
// 2026-10-11 to the owner-ratified 5% gate — debug session
// .planning/debug/d05-uat-ocr-defects.md, D-05-UAT-2 disposition). Pure
// helper only — vitest runs node-env (no DOM), per the house pattern in
// ../auth/session.test.ts. Behavior source: D-05 — the crop prompt appears
// only when the uploaded image's aspect deviates from the capture's
// reference aspect by MORE than 5% (exclusive boundary); optimal crops and
// the exact calibration frames (deviation ≤0.01%) skip cropping entirely.
//
// Why 5% (owner-ratified calibration change): at the old 12% gate, frames
// with 5-12% deviation (e.g. samp2 vs quasi = 9.4%) passed uncropped and
// produced parseable-but-wrong values — the regions are valid only on the
// calibration frame. Tightening routes those misaligned uploads to the
// crop overlay instead of reading garbage uncropped. The 11 calibration
// samples deviate at most 0.01% and must stay no-crop (pinned below +
// harness test A on the real bytes).
import { describe, expect, it, vi, afterEach } from 'vitest'
import { decodeUpload, needsCrop, statusMessage } from './OcrCapture'

describe('needsCrop — D-05 aspect-deviation trigger (>5%, exclusive)', () => {
  it('an optimal crop (identical aspect) never triggers cropping', () => {
    expect(needsCrop(1.661, 1.661)).toBe(false)
  })

  it('a phone full screenshot vs the basic reference triggers cropping', () => {
    expect(needsCrop(0.9, 1.661)).toBe(true)
  })

  it('deviation of exactly 0.05 does not trigger (boundary is exclusive)', () => {
    expect(needsCrop(1.05, 1)).toBe(false)
    expect(needsCrop(0.95, 1)).toBe(false)
  })

  it('deviation just above 0.05 triggers', () => {
    expect(needsCrop(1.0501, 1)).toBe(true)
    expect(needsCrop(0.9499, 1)).toBe(true)
  })

  it('the samp2-vs-quasi misalignment (9.4% deviation) now triggers', () => {
    // 650x670 frame read against the 673x759 quasi calibration — the
    // D-05-UAT-2 case that passed the old 12% gate uncropped and produced
    // parseable-but-wrong values.
    expect(needsCrop(650 / 670, 673 / 759)).toBe(true)
  })

  it('the old 12% boundary cases now trigger', () => {
    expect(needsCrop(1.12, 1)).toBe(true)
    expect(needsCrop(0.88, 1)).toBe(true)
  })

  it('deviation of 0.121 still triggers', () => {
    expect(needsCrop(1.121, 1)).toBe(true)
    expect(needsCrop(0.879, 1)).toBe(true)
  })

  it('general reference: identical aspect skips; 17.1% deviation triggers', () => {
    expect(needsCrop(0.854, 0.854)).toBe(false)
    expect(needsCrop(1.0, 0.854)).toBe(true) // 17.1%
  })

  it('general reference: 11.2% deviation now triggers (above the 5% gate)', () => {
    expect(needsCrop(0.95, 0.854)).toBe(true)
  })

  it('the exact calibration frames (deviation ≤0.01%) stay no-crop', () => {
    expect(needsCrop(691 / 416, 1.6611)).toBe(false) // sampbasic -> basic
    expect(needsCrop(648 / 759, 0.8538)).toBe(false) // sampideal1 -> general
    expect(needsCrop(673 / 759, 0.8867)).toBe(false) // sampideal2 -> quasi
    expect(needsCrop(649 / 782, 0.8299)).toBe(false) // sampideal3 -> special
  })
})

describe('statusMessage — cancelled-read feedback line (D-05-UAT-5, owner-ratified 2026-10-12)', () => {
  it('declining the crop surfaces a visible cancelled status line — the return is no longer silent', () => {
    const line = statusMessage('cancelled')
    expect(line).not.toBe(null)
    expect(line?.tone).toBe('muted') // neutral notice, same weight as the failed-read line
  })

  it('each status renders exactly one distinct line (single status slot)', () => {
    const texts = new Set(
      (['reading', 'done', 'failed', 'cancelled'] as const).map((s) => statusMessage(s)?.text),
    )
    expect(texts.size).toBe(4)
  })

  it('idle renders no status line — the pure manual flow stays copy-free', () => {
    expect(statusMessage('idle')).toBe(null)
  })

  it('the next upload clears the cancelled line: the reading line replaces it in the single status slot', () => {
    // handleFile's first transition is to the reading status; rendering
    // switches on the one status slot, so the cancelled line is gone the
    // moment a new upload starts (and the CTA re-disables for the read).
    expect(statusMessage('reading')).not.toEqual(statusMessage('cancelled'))
  })
})

describe('needsCrop — full phone screenshots fire on EVERY capture step (D-05-UAT-8 pin)', () => {
  it('a 1080x2280 full phone shot (aspect ~0.47) deviates 43-71% from every reference — the crop must fire on all four steps', () => {
    const aspect = 1080 / 2280
    expect(needsCrop(aspect, 1.6611)).toBe(true) // basic
    expect(needsCrop(aspect, 0.8538)).toBe(true) // general
    expect(needsCrop(aspect, 0.8867)).toBe(true) // quasi
    expect(needsCrop(aspect, 0.8299)).toBe(true) // special
  })

  it('a landscape phone shot (2280x1080, aspect ~2.11) also triggers on every step', () => {
    const aspect = 2280 / 1080
    expect(needsCrop(aspect, 1.6611)).toBe(true)
    expect(needsCrop(aspect, 0.8538)).toBe(true)
    expect(needsCrop(aspect, 0.8867)).toBe(true)
    expect(needsCrop(aspect, 0.8299)).toBe(true)
  })
})

// D-05-UAT-8 (round 4): the ONLY await between the reading status and the
// needsCrop/crop-overlay decision is the decode. When it rejects — an
// unsupported format, a dimension-overflow capture, or a browser whose
// options dict is rejected — the old single-call code short-circuited
// straight to the failed status: the crop interface never opened, exactly
// the owner's step-8 report. decodeUpload is the fallback chain that keeps
// the ratified crop tool reachable for every decodable upload:
//   1. createImageBitmap(file, { imageOrientation: 'from-image' }) — the
//      correct path (EXIF-oriented); 'from-image' is the spec default on
//      modern engines but was added to the ImageOrientation enum late, so
//      some engines reject the whole call for it.
//   2. bare createImageBitmap(file) — engines that reject the options dict
//      but decode the blob fine (orientation only diverges for rotated-EXIF
//      uploads, which screenshots do not carry).
//   3. the <img> element decode path (object URL + decode()) — a distinct
//      decoder route that succeeds where the blob bitmap path fails.
// Only when ALL THREE reject does the promise reject — the caller then
// shows the designed failed status (D-18) and the file genuinely cannot be
// read on this device.
describe('decodeUpload — decode fallback chain (D-05-UAT-8)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubGlobals({
    withOptions,
    bare,
    imgBitmap,
  }: {
    withOptions?: (source: unknown, options: unknown) => Promise<unknown>
    bare?: (source: unknown) => Promise<unknown>
    imgBitmap?: (source: unknown, options?: unknown) => Promise<unknown>
  }): { images: Array<{ src: string }> } {
    const images: Array<{ src: string }> = []
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (source: unknown, options?: unknown) => {
        const isBlob = source instanceof FakeUpload
        if (!isBlob) {
          if (imgBitmap === undefined) throw new Error('img call rejected')
          return imgBitmap(source, options)
        }
        if (options !== undefined) {
          if (withOptions === undefined) throw new Error('options call rejected')
          return withOptions(source, options)
        }
        if (bare === undefined) throw new Error('bare call rejected')
        return bare(source)
      }),
    )
    vi.stubGlobal(
      'URL',
      Object.assign(Object.create(URL), {
        createObjectURL: vi.fn(() => 'blob:mock'),
        revokeObjectURL: vi.fn(),
      }) as unknown as typeof URL,
    )
    class FakeImage {
      src = ''
      decoding = 'async'
      decode = async () => {
        images.push(this)
      }
    }
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
    return { images }
  }

  class FakeUpload {
    size = 10
    type = 'image/png'
  }

  const BITMAP = { width: 1080, height: 2280, close() {} } as unknown as ImageBitmap

  it('strategy 1: the from-image options call is tried first and its bitmap is returned', async () => {
    stubGlobals({ withOptions: async () => BITMAP })
    const bitmap = await decodeUpload(new FakeUpload() as unknown as Blob)
    expect(bitmap).toBe(BITMAP)
  })

  it('strategy 2: falls back to bare createImageBitmap when the options call rejects', async () => {
    stubGlobals({ bare: async () => BITMAP })
    const bitmap = await decodeUpload(new FakeUpload() as unknown as Blob)
    expect(bitmap).toBe(BITMAP)
  })

  it('strategy 3: falls back to the <img> element decode path when both blob decodes reject', async () => {
    const { images } = stubGlobals({ imgBitmap: async () => BITMAP })
    const bitmap = await decodeUpload(new FakeUpload() as unknown as Blob)
    expect(bitmap).toBe(BITMAP)
    expect(images).toHaveLength(1)
    expect(images[0].src).toBe('blob:mock')
  })

  it('the object URL is revoked after the <img> fallback (no leak)', async () => {
    stubGlobals({ imgBitmap: async () => BITMAP })
    await decodeUpload(new FakeUpload() as unknown as Blob)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('when ALL strategies reject, the promise rejects — the caller shows the designed failed status', async () => {
    stubGlobals({})
    await expect(decodeUpload(new FakeUpload() as unknown as Blob)).rejects.toThrow()
  })
})

