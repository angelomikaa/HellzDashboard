// ProofField — the JPEG identity-proof picker (08-03 task 1).
//
// CAPTURE PARITY (2026-10-22, owner report): this field IS the Basic-screen
// capture — the same one the stats wizard and the prospect application use — so
// it now goes through the same capture pipeline instead of a plain file input:
//
//   1. the OPTIMAL EXAMPLE (`/examples/basic.png`) is shown above the picker,
//   2. an upload whose aspect deviates >5% from the Basic reference opens the
//      SAME `CropOverlay` the wizard uses (full-image default box, optional
//      isolation of the panel on busy/large screenshots),
//   3. the identity OCR reads the NATIVE (cropped) pixels, NEVER the
//      downscaled JPEG copy.
//
// Why: the live "Comprovante" prefilled the nickname as "dh" on a capture that
// read correctly through the stats flow. The proof read the WHOLE upload AFTER
// the <=1600 px downscale, with no aspect gate and no crop — a phone screenshot
// handed the reader a card header several times smaller than the wizard ever
// sees (and a dark game backdrop its sparse-text pass does not threshold at
// all). Reading the isolated card at source scale is what makes the three
// fields reliable.
//
// Upload contract unchanged: JPEG-only, <=8 MB source, client-resized to
// <=1600 px and re-encoded as JPEG 0.85 before it ever leaves the browser
// (T-08-23); a post-encode payload above 2 MB is refused with the budget copy.
// The server re-validates magic bytes and size.
import { useRef, useState, type ChangeEvent } from 'react'
import { CropOverlay } from '../submit/CropOverlay'
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

const DECODE_FAILED = 'Não foi possível ler a imagem. Envie outro print.'
const CROP_CANCELLED = 'Recorte cancelado. Envie o print de novo — de preferência a tela Básico do personagem.'
const EXAMPLE_SRC = '/examples/basic.png'
const EXAMPLE_ALT = 'Exemplo da tela básica do personagem'

export function ProofField({ value, onChange, onImage, disabled = false }: ProofFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cropBitmap, setCropBitmap] = useState<ImageBitmap | null>(null)

  function clearInput(): void {
    if (inputRef.current) inputRef.current.value = ''
  }

  function reset(): void {
    onChange(null)
    clearInput()
  }

  function clear(): void {
    setError(null)
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
   */
  function accept(source: CanvasImageSource, width: number, height: number): void {
    const native = toCanvas(source, width, height)
    onImage?.(native)
    const upload = downscaleDimensions(width, height)
    const canvas =
      upload.width === width && upload.height === height
        ? native
        : toCanvas(native, upload.width, upload.height)
    const dataUrl = canvas.toDataURL('image/jpeg', PROOF_QUALITY)
    if (proofTooLarge(dataUrl)) {
      setError('Comprovante muito grande (máx. 2 MB).')
      reset()
      return
    }
    onChange(dataUrl)
  }

  async function handleFile(file: File): Promise<void> {
    const invalid = validateProofFile(file)
    if (invalid !== null) {
      setError(invalid)
      reset()
      return
    }

    setError(null)
    setBusy(true)
    let bitmap: ImageBitmap | null = null
    let handedToCrop = false
    try {
      bitmap = await decodeUpload(file)
      // Same gate as the stats flow (owner-ratified 2026-10-11): an off-aspect
      // upload is a full screenshot — the overlay isolates the panel.
      if (needsCrop(bitmap.width / bitmap.height, CAPTURES.basic.aspect)) {
        setCropBitmap(bitmap)
        handedToCrop = true
        return
      }
      accept(bitmap, bitmap.width, bitmap.height)
      setBusy(false)
    } catch {
      setError(DECODE_FAILED)
      reset()
      setBusy(false)
    } finally {
      if (!handedToCrop) bitmap?.close?.()
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (file) void handleFile(file)
  }

  function handleCropConfirm(cropped: HTMLCanvasElement): void {
    const bitmap = cropBitmap
    setCropBitmap(null)
    bitmap?.close?.()
    try {
      accept(cropped, cropped.width, cropped.height)
    } catch {
      setError(DECODE_FAILED)
      reset()
    } finally {
      setBusy(false)
    }
  }

  function handleCropCancel(): void {
    const bitmap = cropBitmap
    setCropBitmap(null)
    bitmap?.close?.()
    setBusy(false)
    setError(CROP_CANCELLED)
    reset()
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="proof-file" className="text-sm font-semibold text-content">
        {PROOF_LABEL}
      </label>
      <p className="text-xs text-muted">
        Use a tela <span className="font-semibold">Básico</span> do personagem — a mesma captura do
        envio de status. É dela que o painel lê ID, nick e classe automaticamente.
      </p>
      <a
        href={EXAMPLE_SRC}
        target="_blank"
        rel="noreferrer"
        className="block w-full max-w-[16rem] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <img
          src={EXAMPLE_SRC}
          alt={EXAMPLE_ALT}
          className="h-auto w-full rounded-md border border-line object-contain"
        />
      </a>
      <input
        id="proof-file"
        ref={inputRef}
        type="file"
        accept="image/jpeg"
        disabled={disabled || busy}
        onChange={handleChange}
        className="block w-full cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-sm text-content file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-accent-foreground hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
      />
      <p className="text-xs text-muted">
        O print é enviado aos oficiais apenas para confirmar sua identidade.
      </p>
      {busy && (
        <p role="status" aria-live="polite" className="text-sm text-muted">
          Processando print…
        </p>
      )}
      {error !== null && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
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
            disabled={disabled || busy}
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
