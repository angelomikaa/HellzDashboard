// Public API surface of the client-side OCR auto-read engine (plan 05-01).
//
// This file is the ONLY import surface: the wizard (05-04) pulls it in via
// dynamic import inside the image handler, so Vite emits the OCR + tesseract
// code as a lazy chunk — nothing OCR-related loads on initial page load.
export { readScreenshot } from './recognize'
export type { OcrFieldOutcome } from './recognize'
export { CAPTURES } from './regions'
export type { CaptureKey } from './regions'
