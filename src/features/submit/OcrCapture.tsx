// OcrCapture — the per-step OCR upload entry (05-UI-SPEC "Upload CTA
// block", D-09/D-10). One instance sits above each capture step's content;
// selecting a screenshot auto-runs the region-based read and pre-fills the
// step's fields via the parent's outcome callback. The bright accent CTA is
// the ONLY OCR entry — manual entry stays fully available with no upload
// (criterion 3), and re-uploading simply runs the read again (D-10/D-15).
//
// D-10/T-05-11: the uploaded bytes are decoded and read ENTIRELY on this
// device — no multipart/upload machinery of any kind, no Storage; the
// bitmap is dropped (close()) as soon as the read is done.
//
// Lazy-load boundary (criterion 3): the OCR engine is pulled in ONLY via
// the dynamic import inside runRead — never a static import of the ocr
// index/recognize modules — so tesseract stays out of the entry bundle.
// CAPTURES is imported STATICALLY from the data-only regions module (no
// tesseract reachable through it).
//
// Declining the optional crop (D-05) cancels the read entirely: no
// outcomes, no failure claims — fields stay as they are for manual
// entry (05-RESEARCH §6 pitfall 7). Owner-ratified deviation
// (2026-10-12, D-05-UAT-5): the cancel is no longer silent — the step
// surfaces a cancelled-feedback status line (and the overlay's decline
// button is relabelled accordingly) that clears on the next upload.
import { useRef, useState } from 'react'
import { CropOverlay } from './CropOverlay'
import type { CaptureKey, OcrFieldOutcome } from './ocr'
import { CAPTURES } from './ocr/regions'

// D-05 crop-trigger threshold: strictly more than 5% deviation (owner-
// ratified calibration change, 2026-10-11 — see .planning/debug/
// d05-uat-ocr-defects.md: at the old 12% gate, 5-12% misaligned frames
// passed uncropped and produced parseable-but-wrong values; 5% routes
// them to the crop overlay. The exact calibration frames deviate ≤0.01%
// and stay no-crop). The tiny epsilon absorbs IEEE-754 representation
// noise (e.g. 1.05 - 1 evaluates a hair above 0.05) so a mathematically
// exact 5% deviation stays on the no-crop side of the boundary, as
// documented; real deviations (0.051 and up) are orders of magnitude
// above it.
const CROP_DEVIATION_MAX = 0.05
const CROP_FLOAT_EPSILON = 1e-9

/**
 * D-05 crop trigger: the optional crop prompt appears only when the
 * uploaded image's aspect deviates MORE than 5% (exclusive boundary)
 * from the capture's reference aspect. Optimal crops skip cropping.
 */
export function needsCrop(imgAspect: number, refAspect: number): boolean {
  return Math.abs(imgAspect / refAspect - 1) > CROP_DEVIATION_MAX + CROP_FLOAT_EPSILON
}

// Locked UI-SPEC copy (definition site — comments describe, never quote).
const CTA_LABEL = 'Faça upload dos seus status aqui'

const STATUS_READING = 'Lendo captura…'
const STATUS_DONE = 'Leitura concluída — confira os valores abaixo.'
const STATUS_FAILED =
  'Não foi possível ler a captura automaticamente. Preencha os valores manualmente.'
// Ratified deviation (D-05-UAT-5): the cancelled-read feedback line.
const STATUS_CANCELLED = 'Leitura cancelada'

type OcrStatus = 'idle' | 'reading' | 'done' | 'failed' | 'cancelled'

/** The single status line a step renders for its OCR state (null = none). */
export interface StatusLine {
  text: string
  tone: 'muted' | 'success'
}

/**
 * The status-slot mapping: each OCR state renders exactly one line (idle
 * renders none). Because the step keeps ONE status slot, any state
 * transition replaces the visible line — e.g. the cancelled feedback is
 * cleared the moment the next upload starts (reading state).
 */
export function statusMessage(status: OcrStatus): StatusLine | null {
  switch (status) {
    case 'idle':
      return null
    case 'reading':
      return { text: STATUS_READING, tone: 'muted' }
    case 'done':
      return { text: STATUS_DONE, tone: 'success' }
    case 'failed':
      return { text: STATUS_FAILED, tone: 'muted' }
    case 'cancelled':
      return { text: STATUS_CANCELLED, tone: 'muted' }
  }
}

interface OcrCaptureProps {
  capture: CaptureKey
  disabled?: boolean
  onOutcomes: (outcomes: OcrFieldOutcome[]) => void
  onReadFailed: () => void
  onRunStateChange: (running: boolean) => void
}

export function OcrCapture({
  capture,
  disabled = false,
  onOutcomes,
  onReadFailed,
  onRunStateChange,
}: OcrCaptureProps) {
  const [status, setStatus] = useState<OcrStatus>('idle')
  const [cropBitmap, setCropBitmap] = useState<ImageBitmap | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const running = status === 'reading'
  const line = statusMessage(status)

  /** THE lazy boundary (criterion 3): tesseract enters the app only here. */
  async function runRead(image: ImageBitmap | HTMLCanvasElement): Promise<void> {
    try {
      const { readScreenshot } = await import('./ocr')
      const outcomes = await readScreenshot(capture, image)
      onOutcomes(outcomes)
      setStatus('done')
    } catch {
      // D-18: decode/import/worker/read failures are an EXPECTED state —
      // the parent clears failure claims, inputs stay untouched, and the
      // manual flow keeps working fully. Retry path: re-upload.
      onReadFailed()
      setStatus('failed')
    } finally {
      // The screenshot bytes live only in memory and die with the read
      // (T-05-11). The cropped-canvas path owns no bitmap to close.
      if ('close' in image) image.close()
      onRunStateChange(false)
    }
  }

  async function handleFile(file: File): Promise<void> {
    if (running || disabled) return
    setStatus('reading')
    onRunStateChange(true)
    try {
      // EXIF orientation (05-RESEARCH §6 pitfall 6): decode with the
      // image's own orientation or a phone-portrait screenshot crops at
      // wrong rects.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const imgAspect = bitmap.width / bitmap.height
      if (needsCrop(imgAspect, CAPTURES[capture].aspect)) {
        // Full screenshot / bad crop: the optional crop runs BEFORE any
        // read; the overlay's confirm/cancel callbacks continue or cancel.
        setCropBitmap(bitmap)
        return
      }
      await runRead(bitmap)
    } catch {
      onReadFailed()
      setStatus('failed')
      onRunStateChange(false)
    }
  }

  function handleCropConfirm(cropped: HTMLCanvasElement): void {
    const bitmap = cropBitmap
    setCropBitmap(null)
    if (bitmap) bitmap.close()
    void runRead(cropped)
  }

  function handleCropCancel(): void {
    // Declining the crop CANCELS the read entirely (D-05): no outcomes, no
    // failure spam — fields stay untouched. Ratified deviation: the return
    // is no longer silent; the cancelled status line stays visible until
    // the next upload transitions the slot to the reading state.
    const bitmap = cropBitmap
    setCropBitmap(null)
    if (bitmap) bitmap.close()
    setStatus('cancelled')
    onRunStateChange(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled || running}
        aria-busy={running}
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex h-11 items-center justify-center gap-1 self-start rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {/* Upload icon: arrow-up-from-bracket shape, 16px (05-UI-SPEC). */}
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 11V3" />
          <path d="M4 7l4-4 4 4" />
          <path d="M2 13h12" />
        </svg>
        {CTA_LABEL}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset so re-selecting the SAME file re-runs the read (D-15).
          e.target.value = ''
          if (file) void handleFile(file)
        }}
      />
      {line !== null && (
        <p
          role="status"
          aria-live="polite"
          className={`text-sm font-semibold ${line.tone === 'success' ? 'text-success' : 'text-muted'}`}
        >
          {line.text}
        </p>
      )}
      {cropBitmap !== null && (
        <CropOverlay
          bitmap={cropBitmap}
          aspect={CAPTURES[capture].aspect}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  )
}
