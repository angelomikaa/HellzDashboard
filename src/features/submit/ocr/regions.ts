// Capture reference data for the client OCR auto-read layer.
//
// ARCHITECTURE PIVOT (D-05-UAT round 3): the pixel-fraction region maps left
// the read path — the reading strategy is now STRUCTURAL (the panel's visual
// grammar, ported from the proven spike scripts/ocr-spike-structural.mjs;
// see structure.ts/locate.ts/recognize.ts). This module keeps ONLY what the
// non-read consumers need: the per-capture reference ASPECTS consumed by
// OcrCapture's needsCrop gate and the crop overlay's example rectangle
// (both pending a separate owner decision on the crop UX — consumed as-is).
// Recalibration of the READER (D-19, amended) now happens in the structural
// reader's visual grammar (structure.ts), never here.
//
// The game UI layout version these aspects were calibrated against (D-21 —
// single active version).
export type CaptureKey = 'basic' | 'general' | 'quasi' | 'special'

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
}
