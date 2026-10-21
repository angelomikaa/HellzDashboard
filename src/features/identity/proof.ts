// Proof image helpers (08-03 task 1; T-08-23).
//
// PURE module: the JPEG-only/2 MB budget is enforced here so both the
// FirstAccessPage and the RequestAccessPage share one rule, and so the guards
// are unit-testable without a canvas. The server re-validates magic bytes and
// size — this is the client half of the same contract.

/** Server contract (_shared/session.ts MAX_PROOF_BYTES): 2 MB decoded. */
export const MAX_PROOF_BYTES = 2 * 1024 * 1024
/** Pre-resize guard: a >8 MB source is not a screenshot worth processing. */
export const MAX_PROOF_INPUT_BYTES = 8 * 1024 * 1024
/** Longest side after downscale (same discipline as CardPhotoUpload). */
export const PROOF_MAX_SIDE = 1600
/** JPEG quality for the downscaled proof. */
export const PROOF_QUALITY = 0.85

export const PROOF_LABEL = 'Comprovante (print do personagem, JPEG)'

export interface ProofFileLike {
  type: string
  size: number
}

/**
 * Pre-read guard. Returns the pt-BR error copy, or null when the file is an
 * acceptable JPEG under the input-size ceiling.
 */
export function validateProofFile(file: ProofFileLike): string | null {
  if (file.type !== 'image/jpeg') return 'Envie um arquivo JPEG.'
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
