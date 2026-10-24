// Proof image helpers (08-03 task 1; T-08-23).
//
// PURE module: the 2 MB budget is enforced here so both the FirstAccessPage
// and the RequestAccessPage share one rule, and so the guards are
// unit-testable without a canvas. The server re-validates magic bytes and
// size — this is the client half of the same contract.
//
// Capture parity (owner report 2026-10-23): the INPUT half of the T-08-23
// contract is widened from JPEG-only to any image/* — the proof field now
// pastes Windows clipboard screenshots (PNG) through the same dropzone the
// stats flows use, and a JPEG-only input would reject that paste. The
// UPLOAD half is unchanged: ProofField re-encodes every input to a <=1600 px
// JPEG 0.85 before it leaves the browser, and the server still validates
// the JPEG magic bytes and the 2 MB budget.

/** Server contract (_shared/session.ts MAX_PROOF_BYTES): 2 MB decoded. */
export const MAX_PROOF_BYTES = 2 * 1024 * 1024
/** Pre-resize guard: a >8 MB source is not a screenshot worth processing. */
export const MAX_PROOF_INPUT_BYTES = 8 * 1024 * 1024
/** Longest side after downscale (same discipline as CardPhotoUpload). */
export const PROOF_MAX_SIDE = 1600
/** JPEG quality for the downscaled proof. */
export const PROOF_QUALITY = 0.85

export const PROOF_LABEL = 'Comprovante (print do personagem)'

export interface ProofFileLike {
  type: string
  size: number
}

/**
 * Pre-read guard. Returns the pt-BR error copy, or null when the file is an
 * acceptable image under the input-size ceiling. Any image/* input is
 * accepted (capture parity, owner report 2026-10-23): a Windows clipboard
 * screenshot pastes as PNG, and the UPLOADED copy is re-encoded to JPEG by
 * ProofField anyway.
 */
export function validateProofFile(file: ProofFileLike): string | null {
  if (!file.type.startsWith('image/')) return 'Envie uma imagem (print da tela).'
  if (file.size > MAX_PROOF_INPUT_BYTES) return 'Arquivo muito grande (máx. 8 MB).'
  return null
}

/** Downscale so the longest side is at most `maxSide` (never upscales). */
export function downscaleDimensions(
  width: number,
  height: number,
  maxSide: number = PROOF_MAX_SIDE,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxSide || longest <= 0) return { width, height }
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Decoded byte size of a base64 data URL (padding-aware). */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  const payload = dataUrl.slice(comma + 1)
  if (payload.length === 0) return 0
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding)
}

/** The 2 MB post-encode budget (server rejects with proof_too_large). */
export function proofTooLarge(dataUrl: string): boolean {
  return dataUrlByteLength(dataUrl) > MAX_PROOF_BYTES
}
