// ProofField — the JPEG identity-proof capture (08-03 task 1).
//
// CAPTURE PARITY (owner report 2026-10-23): this field IS the Basic-screen
// capture — the same one the stats wizard and the prospect application
// use — so the print now enters through the SAME CaptureDropzone surface:
// drag-and-drop, a clipboard-first click (PrtScn / Win+Shift+S pastes with
// one click) and the file picker as the fallback, over the same image/*
// input contract. A Windows clipboard screenshot is PNG, so the old
// JPEG-only INPUT guard would have rejected the paste; the input half of
// the T-08-23 contract is widened to image/*. The upload half is
// unchanged: every input is re-encoded client-side to <=1600 px JPEG 0.85
// and refused above 2 MB (the server re-validates magic bytes and size).
//
// STRIP PARITY (owner follow-up, same report): the example shot and the
// upload zone live in ONE strip — the exact lg:flex-row layout the stats
// wizard and the prospect application use — instead of the zone breaking
// to a full-width line below the example. Both share the 160 px height;
// below lg (narrow cards/phones) the strip stacks for readability, like
// every wizard strip. The parents' cards are max-w-2xl so the strip fits
// at lg with the zone at a comfortable width.
//
// Pipeline parity (2026-10-22, owner report): the OPTIMAL EXAMPLE
// (/examples/basic.png) above the zone — rendered at the zone's height
// (h-40, the dropzone minimum; width follows the capture's aspect —
// owner alignment rule 2026-10-23), the >5% aspect gate against the
// Basic reference opening the SAME CropOverlay the wizard uses, and the
// identity OCR reading the NATIVE (cropped) pixels, NEVER the downscaled
// JPEG copy.
//
// Status parity: ONE status slot below the zone (idle renders none), with
// the same states the stats capture uses — reading / done / failed /
// cancelled — so every capture surface behaves identically. "done" means
// the print is attached; the identity read itself is owned by the parent
// through onImage. Validation failures render in the failed slot.
import { useState } from 'react'
import { CaptureDropzone } from '../submit/CaptureDropzone'
import { CropOverlay } from '../submit/CropOverlay'
import { ExampleShot } from '../submit/ExampleShot'
import { decodeUpload, needsCrop } from '../submit/OcrCapture'
import { CAPTURES } from '../submit/ocr/regions'
import {
  PROOF_LABEL,
  PROOF_QUALITY,
  downscaleDimensions,
  proofTooLarge,
  validateProofFile,
} from './proof'

export interface ProofFieldProps {
  value: string | null
  onChange: (dataUrl: string | null) => void
  /** Receives the NATIVE (cropped) canvas before JPEG downscale (one decode only). */
  onImage?: (canvas: HTMLCanvasElement) => void
  disabled?: boolean
}

// Locked per-surface CTA copy (the zone's main label). Kept short so the
// zone holds the shared 160 px height in the proof strip's narrower column
// (the wizard's CTA fits one line at the same width; a longer copy would
// wrap and grow the zone past the example's height).
const CTA_LABEL = 'Faça upload do print aqui'
const EXAMPLE_SRC = '/examples/basic.png'
const EXAMPLE_ALT = 'Exemplo da tela básica do personagem'

const DECODE_FAILED = 'Não foi possível ler a imagem. Envie outro print.'
const TOO_LARGE = 'Comprovante muito grande (máx. 2 MB).'
// Same single-slot discipline as the stats capture: one line per state,
// every transition replaces the visible line.
const STATUS_READING = 'Lendo captura…'
const STATUS_DONE = 'Print anexado — confira os valores abaixo.'
const STATUS_CANCELLED = 'Leitura cancelada'

/** The single status slot a proof capture renders (idle renders none). */
type ProofStatus =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'done' }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' }

export function ProofField({ value, onChange, onImage, disabled = false }: ProofFieldProps) {
  const [status, setStatus] = useState<ProofStatus>({ kind: 'idle' })
  const [cropBitmap, setCropBitmap] = useState<ImageBitmap | null>(null)
  const running = status.kind === 'reading'

  function reset(): void {
    onChange(null)
  }

  /** Land in the failed slot and drop any previously attached proof. */
  function fail(message: string): void {
    setStatus({ kind: 'failed', message })
    reset()
  }

  function toCanvas(
    source: CanvasImageSource,
    width: number,
    height: number,
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('[proof] canvas 2d context unavailable')
    context.drawImage(source, 0, 0, width, height)
    return canvas
  }

  /**
   * Hand the identity read the image at SOURCE resolution (the overlay crop
   * included), then encode the <=1600 px upload copy. One decode, two sizes:
   * the reader must see the card header as large as the capture has it.
   * Returns false when the encoded proof exceeds the 2 MB budget.
   */
  function accept(source: CanvasImageSource, width: number, height: number): boolean {
    const native = toCanvas(source, width, height)
    onImage?.(native)
    const upload = downscaleDimensions(width, height)
    const canvas =
      upload.width === width && upload.height === height
        ? native
        : toCanvas(native, upload.width, upload.height)
    const dataUrl = canvas.toDataURL('image/jpeg', PROOF_QUALITY)
    if (proofTooLarge(dataUrl)) return false
    onChange(dataUrl)
    return true
  }

  async function handleFile(file: File): Promise<void> {
    if (running || disabled) return
    const invalid = validateProofFile(file)
    if (invalid !== null) {
      fail(invalid)
      return
    }

    setStatus({ kind: 'reading' })
    let bitmap: ImageBitmap | null = null
    let handedToCrop = false
    try {
      bitmap = await decodeUpload(file)
      // Same gate as the stats flow (owner-ratified 2026-10-11): an
      // off-aspect upload is a full screenshot — the overlay isolates the panel.
      if (needsCrop(bitmap.width / bitmap.height, CAPTURES.basic.aspect)) {
        setCropBitmap(bitmap)
        handedToCrop = true
        return
      }
      if (!accept(bitmap, bitmap.width, bitmap.height)) {
        fail(TOO_LARGE)
        return
      }
      setStatus({ kind: 'done' })
    } catch {
      fail(DECODE_FAILED)
    } finally {
      if (!handedToCrop) bitmap?.close?.()
    }
  }

  function handleCropConfirm(cropped: HTMLCanvasElement): void {
    const bitmap = cropBitmap
    setCropBitmap(null)
    bitmap?.close?.()
    try {
      if (!accept(cropped, cropped.width, cropped.height)) {
        fail(TOO_LARGE)
        return
      }
      setStatus({ kind: 'done' })
    } catch {
      fail(DECODE_FAILED)
    }
  }

  function handleCropCancel(): void {
    // Declining the crop cancels the capture (same semantics as the stats
    // flow): no proof is attached, and the cancelled line stays visible
    // until the next upload transitions the slot back to reading.
    const bitmap = cropBitmap
    setCropBitmap(null)
    bitmap?.close?.()
    setStatus({ kind: 'cancelled' })
    reset()
  }

  function clear(): void {
    setStatus({ kind: 'idle' })
    reset()
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-content">{PROOF_LABEL}</p>
      <p className="text-xs text-muted">
        Use a tela <span className="font-semibold">Básico</span> do personagem — a mesma captura do
        envio de status. É dela que o painel lê ID, nick e classe automaticamente.
      </p>
      {/* The SAME capture strip the stats wizard and the prospect application
          use: example beside the upload zone in ONE strip at lg — never the
          zone alone on a full-width line below the example — both sharing
          the 160 px height. The capture status slot lives in the zone's
          column, exactly like OcrCapture inside the wizard strips. Below lg
          the strip stacks for readability. */}
      <div className="flex w-full flex-col gap-4 rounded-lg border border-line bg-surface p-4 lg:flex-row lg:items-stretch">
        <ExampleShot src={EXAMPLE_SRC} alt={EXAMPLE_ALT} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <CaptureDropzone
            label={CTA_LABEL}
            running={running}
            disabled={disabled}
            onFile={(file) => void handleFile(file)}
          />
          {status.kind === 'reading' && (
            <p role="status" aria-live="polite" className="text-sm font-semibold text-muted">
              {STATUS_READING}
            </p>
          )}
          {status.kind === 'done' && (
            <p role="status" className="text-sm font-semibold text-success">
              {STATUS_DONE}
            </p>
          )}
          {status.kind === 'cancelled' && (
            <p role="status" className="text-sm font-semibold text-muted">
              {STATUS_CANCELLED}
            </p>
          )}
          {status.kind === 'failed' && (
            <p role="alert" className="text-sm font-semibold text-error">
              {status.message}
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted">
        O print é enviado aos oficiais apenas para confirmar sua identidade.
      </p>
      {value !== null && (
        <div className="flex flex-col gap-2">
          <img
            src={value}
            alt="Prévia do comprovante"
            className="max-h-48 w-auto self-start rounded-md border border-line"
          />
          <button
            type="button"
            onClick={clear}
            disabled={disabled || running}
            className="self-start text-sm font-semibold text-muted hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Remover
          </button>
        </div>
      )}
      {cropBitmap !== null && (
        <CropOverlay
          bitmap={cropBitmap}
          aspect={CAPTURES.basic.aspect}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  )
}
