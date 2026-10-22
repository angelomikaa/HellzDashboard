// Capture reference data for the client OCR auto-read layer.
//
// ARCHITECTURE PIVOT (D-05-UAT round 3): the pixel-fraction region maps left
// the read path — the reading strategy is now STRUCTURAL (the panel's visual
// grammar, ported from the proven spike scripts/ocr-spike-structural.mjs;
// see structure.ts/locate.ts/recognize.ts). This module keeps ONLY what the
// non-read consumers need: the per-capture reference ASPECTS consumed by
// OcrCapture's needsCrop gate and the crop overlay's resize floor (the
// isolation-tool sanity minimum — owner-ratified crop UX 2026-10-12:
// "Remove gate, keep crop"; no example rectangle, no confirm gate).
// Recalibration of the READER (D-19, amended) now happens in the structural
// reader's visual grammar (structure.ts), never here.
//
// The game UI layout version these aspects were calibrated against (D-21 —
// single active version).
export type CaptureKey =
  | 'basic'
  | 'general'
  | 'quasi'
  | 'special'
  | 'pdef_tooltip'
  | 'mdef_tooltip'

export const GAME_UI_VERSION = 'ro-origin-ui-2026-10'

export interface CaptureMap {
  aspect: number
}

export const CAPTURES: Record<CaptureKey, CaptureMap> = {
  basic: {
    aspect: 1.6611, // 691/416 (sampbasic)
  },
  general: {
    aspect: 0.8538, // 648/759 (sampideal1)
  },
  quasi: {
    aspect: 0.8867, // 673/759 (sampideal2)
  },
  special: {
    aspect: 0.8299, // 649/782 (sampideal3)
  },
  pdef_tooltip: {
    aspect: 1.3384, // 613/458 (samplepdef)
  },
  mdef_tooltip: {
    aspect: 1.3599, // 665/489 (samplemdef)
  },
}
