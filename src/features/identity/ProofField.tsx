// ProofField — the JPEG identity-proof picker (08-03 task 1).
//
// One basic-screen screenshot, client-resized to <=1600 px and re-encoded as
// JPEG 0.85 before it ever leaves the browser (T-08-23). The same canvas is
// handed to `onImage` BEFORE encoding so the caller can run the identity OCR
// without a second decode/upload. Non-JPEG and >8 MB sources are rejected
// up-front; a post-encode payload above 2 MB is refused with the server's
// budget copy. The file input only resets on Remover/retake.
import { useRef, useState, type ChangeEvent } from 'react'
import {
  PROOF_LABEL,
  PROOF_MAX_SIDE,
  PROOF_QUALITY,
  proofTooLarge,
  validateProofFile,
} from './proof'

export interface ProofFieldProps {
  value: string | null
  onChange: (dataUrl: string | null) => void
  /** Receives the downscaled canvas before JPEG encoding (one decode only). */
  onImage?: (canvas: HTMLCanvasElement) => void
  disabled?: boolean
}

function decodeFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('[proof] image decode failed'))
    }
    image.src = url
  })
}

export function ProofField({ value, onChange, onImage, disabled = false }: ProofFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function clear(): void {
    setError(null)
    onChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleFile(file: File): Promise<void> {
    const invalid = validateProofFile(file)
    if (invalid !== null) {
      setError(invalid)
      onChange(null)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setBusy(true)
    setError(null)
    try {
      const image = await decodeFile(file)
      const longest = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)
      const scale = longest > PROOF_MAX_SIDE ? PROOF_MAX_SIDE / longest : 1
      const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
      const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('[proof] canvas 2d context unavailable')
      context.drawImage(image, 0, 0, width, height)

      // OCR seam: the caller reads this exact canvas (no second decode).
      onImage?.(canvas)

      const dataUrl = canvas.toDataURL('image/jpeg', PROOF_QUALITY)
      if (proofTooLarge(dataUrl)) {
        setError('Comprovante muito grande (máx. 2 MB).')
        onChange(null)
        if (inputRef.current) inputRef.current.value = ''
        return
      }
      onChange(dataUrl)
    } catch {
      setError('Não foi possível ler a imagem. Envie outro print.')
      onChange(null)
      if (inputRef.current) inputRef.current.value = ''
    } finally {
      setBusy(false)
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (file) void handleFile(file)
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="proof-file" className="text-sm font-semibold text-content">
        {PROOF_LABEL}
      </label>
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
    </div>
  )
}
