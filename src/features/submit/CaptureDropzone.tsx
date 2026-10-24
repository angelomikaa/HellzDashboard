// CaptureDropzone — the ONE screenshot-capture surface (owner report
// 2026-10-23): the identification proof must enter through the same
// capture system as the stats wizard (SubmitPage) and the prospect
// application, so the entry — a dashed dropzone with drag-and-drop (owner
// feedback, 07.2-06 checkpoint round 3), a clipboard-first click (owner
// checkpoint round 14: on Windows a PrtScn / Win+Shift+S screenshot is
// already in the clipboard, so one click pastes it; the file picker only
// opens when there is no image or no Clipboard API/permission) and the
// hidden `image/*` picker as the fallback — was extracted verbatim from
// OcrCapture into this shared component. Before this, the identification
// ProofField was the only capture still using a plain file input.
//
// This component owns ONLY the entry surface. Every consumer keeps its own
// decode/crop/read pipeline and status copy: OcrCapture runs the
// region-based stat read, ProofField encodes the JPEG proof and hands the
// native canvas to the identity read. The clipboard read stays inside the
// user gesture either way.
import { useRef, useState, type DragEvent } from 'react'

/**
 * The clipboard image as a File, or null when there is nothing usable.
 * Windows screenshots (PrtScn / Win+Shift+S) arrive as an `image/*` item;
 * ANY failure — missing API, denied permission, unfocused document, a
 * clipboard holding only text — degrades to null so the caller can fall
 * back to the file picker. Never throws.
 */
export async function clipboardImage(): Promise<File | null> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (typeof clipboard?.read !== 'function') return null
  try {
    const items = await clipboard.read()
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'))
      if (type === undefined) continue
      const blob = await item.getType(type)
      const ext = type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length)
      return new File([blob], `captura.${ext}`, { type })
    }
  } catch {
    // Expected: the picker is the fallback path, not an error state.
  }
  return null
}

interface CaptureDropzoneProps {
  /** Locked per-surface CTA copy (rendered as the zone's main label). */
  label: string
  running: boolean
  disabled?: boolean
  onFile: (file: File) => void
}

// Locked UI-SPEC hint (definition site — comments describe, never quote):
// shared by every capture surface in the app.
const CTA_HINT = 'Arraste o print ou clique para colar a captura'
// The running label shown in place of the CTA while a capture is processed.
const READING_LABEL = 'Lendo captura…'

export function CaptureDropzone({
  label,
  running,
  disabled = false,
  onFile,
}: CaptureDropzoneProps) {
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * Click = clipboard first (round 14): a Windows screenshot is already in
   * the clipboard, so one click reads it without opening the picker. The
   * picker only appears when the clipboard has no image — or when there is
   * no Clipboard API / permission.
   */
  function handleZoneClick(): void {
    if (running || disabled) return
    void (async () => {
      const fromClipboard = await clipboardImage()
      if (fromClipboard !== null) {
        onFile(fromClipboard)
        return
      }
      fileInputRef.current?.click()
    })()
  }

  return (
    <>
      {/* Dropzone (owner feedback, 07.2-06 checkpoint round 3): drag a print
          here OR click to paste/browse. A real <button> keeps it keyboard
          reachable; the drag handlers only add the pointer affordance. */}
      <button
        type="button"
        disabled={disabled || running}
        aria-busy={running}
        onClick={handleZoneClick}
        onDragEnter={(e: DragEvent<HTMLButtonElement>) => {
          e.preventDefault()
          if (!disabled && !running) setDragActive(true)
        }}
        onDragOver={(e: DragEvent<HTMLButtonElement>) => {
          e.preventDefault()
          if (!disabled && !running) setDragActive(true)
        }}
        onDragLeave={(e: DragEvent<HTMLButtonElement>) => {
          e.preventDefault()
          setDragActive(false)
        }}
        onDrop={(e: DragEvent<HTMLButtonElement>) => {
          e.preventDefault()
          setDragActive(false)
          if (disabled || running) return
          const file = e.dataTransfer.files?.[0]
          if (file) onFile(file)
        }}
        className={`flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${
          dragActive
            ? 'border-accent bg-accent/10'
            : 'border-line bg-surface hover:border-accent'
        }`}
      >
        {/* Upload icon: arrow-up-from-bracket shape (05-UI-SPEC). */}
        <svg
          aria-hidden="true"
          width="28"
          height="28"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted"
        >
          <path d="M8 11V3" />
          <path d="M4 7l4-4 4 4" />
          <path d="M2 13h12" />
        </svg>
        <span className="text-base font-semibold text-content">
          {running ? READING_LABEL : label}
        </span>
        <span className="text-sm text-muted">
          {CTA_HINT}
        </span>
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
          if (file) onFile(file)
        }}
      />
    </>
  )
}
