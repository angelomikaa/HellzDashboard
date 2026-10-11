#!/usr/bin/env node
/**
 * copy-ocr-assets.mjs — self-host the Tesseract worker + WASM core (plan
 * 05-01, 05-RESEARCH §3.3).
 *
 * Copies node_modules/tesseract.js/dist/worker.min.js -> public/ocr/ and every
 * node_modules/tesseract.js-core/*.{js,wasm} -> public/ocr/core/ (the worker
 * probes SIMD/LSTM support and picks a variant at runtime, so ALL variants
 * must exist).
 *
 * public/ocr/ is gitignored: no binaries in git. The folder is regenerated
 * from node_modules by the predev/prebuild hooks, so the self-hosted assets
 * stay version-locked to the installed tesseract.js — a deploy can never
 * ship a worker/core pair from a different version.
 *
 * Fails loudly if either package is missing from node_modules.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const WORKER_SRC = path.join(ROOT, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js')
const CORE_SRC_DIR = path.join(ROOT, 'node_modules', 'tesseract.js-core')
const OUT_DIR = path.join(ROOT, 'public', 'ocr')
const OUT_CORE_DIR = path.join(OUT_DIR, 'core')

function fail(message) {
  console.error(`[copy-ocr-assets] FAIL: ${message}`)
  process.exit(1)
}

if (!existsSync(WORKER_SRC)) {
  fail(`missing ${WORKER_SRC} — run npm install first`)
}
if (!existsSync(CORE_SRC_DIR)) {
  fail(`missing ${CORE_SRC_DIR} — run npm install first`)
}

mkdirSync(OUT_CORE_DIR, { recursive: true })

copyFileSync(WORKER_SRC, path.join(OUT_DIR, 'worker.min.js'))
console.log('[copy-ocr-assets] worker.min.js -> public/ocr/worker.min.js')

const coreFiles = readdirSync(CORE_SRC_DIR).filter((f) => /\.(js|wasm)$/.test(f))
if (coreFiles.length === 0) {
  fail(`no core assets found in ${CORE_SRC_DIR}`)
}
for (const file of coreFiles) {
  copyFileSync(path.join(CORE_SRC_DIR, file), path.join(OUT_CORE_DIR, file))
}
console.log(`[copy-ocr-assets] ${coreFiles.length} core files -> public/ocr/core/`)

// The default modern path is the SIMD+LSTM variant — its absence means the
// copy is incomplete, so guard it explicitly.
const simdLstm = path.join(OUT_CORE_DIR, 'tesseract-core-simd-lstm.wasm')
if (!existsSync(simdLstm)) {
  fail(`expected core variant missing after copy: ${simdLstm}`)
}
console.log('[copy-ocr-assets] OK: self-hosted OCR assets are in place')
