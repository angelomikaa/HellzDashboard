#!/usr/bin/env node
/**
 * NeoFoot OCR feasibility spike — Phase 1, plan 01-04 (D-08, D-09, D-10).
 *
 * A committed, re-runnable Node script that runs REGION-based Tesseract.js
 * recognition (never whole-image) over the 10 REAL guild screenshots living
 * in the gitignored `.secrets/ocr-samples/` folder — member data never enters
 * git or Supabase Storage (D-10). Prints a per-field accuracy report and a
 * GO/NO-GO verdict against the ~70% field-accuracy threshold (D-08).
 *
 * Usage:
 *   node scripts/ocr-spike.mjs              run the spike on .secrets/ocr-samples/
 *   node scripts/ocr-spike.mjs --info       print sample resolutions (region calibration aid)
 *   node scripts/ocr-spike.mjs --self-test  synthetic-image pipeline proof (no real data used)
 *
 * Real-data inputs (both gitignored):
 *   .secrets/ocr-samples/<general|quasi|special>.png   the 10 real screenshots
 *   .secrets/ocr-samples/expected.json                true values per screenshot
 *                                                      (template: scripts/ocr-samples-expected.example.json)
 * Region rects: scripts/ocr-regions.json (pixel rects per screenshot group).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SAMPLES_DIR = path.resolve(__dirname, '..', '.secrets', 'ocr-samples');
const EXPECTED_PATH = path.join(SAMPLES_DIR, 'expected.json');
const REGIONS_PATH = fileURLToPath(new URL('./ocr-regions.json', import.meta.url));
const EXPECTED_TEMPLATE_PATH = fileURLToPath(new URL('./ocr-samples-expected.example.json', import.meta.url));

/** D-08 pivot threshold: ~70% field accuracy. */
export const ACCURACY_THRESHOLD = 0.7;
/** OCR whitelist: stat values are digits, pt-BR separators, and % only. */
const WHITELIST = '0123456789.,%';
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;

// ---------------------------------------------------------------------------
// Pure functions (unit-tested in scripts/ocr-spike.accuracy.test.mjs)
// ---------------------------------------------------------------------------

/**
 * Parse one raw OCR string into a stat value, honoring the game's Portuguese
 * locale: `.` groups thousands (`1.234.567`), `,` marks decimals (`12,34`),
 * and a trailing `%` marks a percentual stat.
 *
 * Rules (per plan 01-04):
 *  - trim; strip trailing `%` and record it as percentual
 *  - `.` thousand separators are removed (`1.234.567` -> 1234567)
 *  - `,` becomes a decimal point only for the single-comma `\d+,\d+` shape
 *  - anything else fails: `{ ok: false, value: null, isPercentual: false }`
 *
 * @param {string} raw
 * @returns {{ ok: boolean, value: number|null, isPercentual: boolean }}
 */
export function parseValue(raw) {
  const fail = { ok: false, value: null, isPercentual: false };
  if (typeof raw !== 'string') return fail;
  let s = raw.trim();
  if (s === '') return fail;

  let isPercentual = false;
  if (s.endsWith('%')) {
    isPercentual = true;
    s = s.slice(0, -1).trim();
  }
  if (s === '') return fail;

  // Negative values exist in real data (Variable CT, Fixed CT, Global CD).
  let isNegative = false;
  if (s.startsWith('-')) {
    isNegative = true;
    s = s.slice(1);
  }
  if (s === '') return fail;
  if (!/^[\d.,]+$/.test(s)) return fail;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // Mixed separators (pt-BR full form): dots group thousands, comma is decimal.
    if (!/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) return fail;
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // Comma decimal only in the `\d+,\d+` single-comma shape (per plan).
    if (!/^\d+,\d+$/.test(s)) return fail;
    s = s.replace(',', '.');
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) {
      // Multiple dots = thousand separators (`1.234.567` -> 1234567).
      if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return fail;
      s = parts.join('');
    } else {
      // Single dot: a 3-digit tail is a pt-BR thousand group (`1.234` -> 1234);
      // anything shorter is a decimal read (`12.34` -> 12.34, per plan test 4).
      const [int, dec] = parts;
      s = dec.length === 3 ? int + dec : int + '.' + dec;
    }
  }

  if (!/^\d+(\.\d+)?$/.test(s)) return fail;
  const value = Number(s);
  if (!Number.isFinite(value)) return fail;
  return { ok: true, value: isNegative ? -value : value, isPercentual };
}

/**
 * Field accuracy = correct / total. Each result row is
 * `{ field, expected, parsed, ok }`; parse failures (`ok: false`) and value
 * mismatches both count as misses. An empty result set scores 0 (never NaN).
 *
 * @param {Array<{field: string, expected: number|null, parsed: number|null, ok: boolean}>} results
 * @returns {number} accuracy in [0, 1]
 */
export function computeAccuracy(results) {
  const rows = Array.isArray(results) ? results : [];
  if (rows.length === 0) return 0;
  const correct = rows.filter(
    (r) => r && r.ok === true && Number(r.parsed) === Number(r.expected),
  ).length;
  return correct / rows.length;
}

/**
 * GO when accuracy meets the threshold (>=), NO-GO otherwise.
 * D-08: the pivot threshold is ~70% field accuracy.
 *
 * @param {number} accuracy
 * @param {number} [threshold=0.7]
 * @returns {'GO'|'NO-GO'}
 */
export function verdict(accuracy, threshold = ACCURACY_THRESHOLD) {
  return accuracy >= threshold ? 'GO' : 'NO-GO';
}

/**
 * Compare one expected value against one raw OCR read, by field type.
 *
 *  - `numeric` (default): both sides go through parseValue (same locale rules),
 *    so expected.json may carry values exactly as displayed in-game
 *    (`1.234.567`, `12,34%`, `-33.38%`). Percentual flag must match.
 *  - `text` (header-screen fields — job, nickname): case-insensitive,
 *    whitespace-normalized string equality.
 *
 * @param {string} expectedRaw
 * @param {string} ocrText
 * @param {'numeric'|'text'} [type]
 * @returns {{ ok: boolean, expected: number|string|null, parsed: number|string|null, isPercentual: boolean }}
 */
export function compareField(expectedRaw, ocrText, type = 'numeric') {
  if (type === 'text') {
    const norm = (s) =>
      String(s ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
    const expected = String(expectedRaw ?? '').trim();
    const parsed = String(ocrText ?? '').trim();
    const ok = parsed !== '' && norm(expected) === norm(parsed);
    return { ok, expected, parsed, isPercentual: false };
  }
  const expected = parseValue(String(expectedRaw));
  const parsed = parseValue(ocrText);
  const ok =
    parsed.ok &&
    expected.ok &&
    parsed.value === expected.value &&
    parsed.isPercentual === expected.isPercentual;
  return {
    ok,
    expected: expected.ok ? expected.value : null,
    parsed: parsed.ok ? parsed.value : null,
    isPercentual: parsed.ok ? parsed.isPercentual : false,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

function loadJson(file, what) {
  if (!existsSync(file)) {
    console.error(`[ocr-spike] Missing ${what}: ${file}`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`[ocr-spike] Could not parse ${what} (${file}): ${err.message}`);
    process.exit(1);
  }
}

/** Image files present in the samples folder, or null when folder is missing/unreadable. */
function listSampleImages() {
  if (!existsSync(SAMPLES_DIR)) return null;
  try {
    return readdirSync(SAMPLES_DIR).filter((f) => IMAGE_RE.test(f));
  } catch {
    return null;
  }
}

/**
 * D-09/D-10 guard: the spike measures REAL data only. If the gitignored
 * `.secrets/ocr-samples/` folder is missing or has no screenshots, refuse to
 * run (exit 1) with instructions. Never reads screenshots from anywhere else.
 */
function guardSamples() {
  const images = listSampleImages();
  if (!images || images.length === 0) {
    console.error('[ocr-spike] No real screenshots found in .secrets/ocr-samples/.');
    console.error('[ocr-spike] D-09/D-10: the spike must run on the 10 REAL guild screenshots');
    console.error('[ocr-spike] (Portuguese locale, "1.234.567" separators) — no synthetic stand-ins.');
    console.error('[ocr-spike] To proceed:');
    console.error('[ocr-spike]   1. Place the screenshots in .secrets/ocr-samples/ (gitignored), named');
    console.error('[ocr-spike]      per scripts/ocr-regions.json (or update the region maps to match).');
    console.error('[ocr-spike]   2. Share one screenshot\'s pixel resolution so region rects can be');
    console.error('[ocr-spike]      calibrated (run "node scripts/ocr-spike.mjs --info" for the dimensions).');
    console.error('[ocr-spike]   3. Fill .secrets/ocr-samples/expected.json with the true stat values');
    console.error('[ocr-spike]      (template: scripts/ocr-samples-expected.example.json).');
    process.exit(1);
  }
  return images;
}

/**
 * Crop one region rect and preprocess it per .planning/research/STACK.md:
 * grayscale -> 3x upscale (cubic) -> contrast boost (normalize) -> binarize,
 * with automatic polarity (stat UIs are usually light text on a dark panel,
 * Tesseract wants dark text on white).
 */
async function preprocessRegion(sharp, image, region) {
  const meta = await sharp(image).metadata();
  const x = clamp(Math.round(region.x), 0, Math.max(0, meta.width - 1));
  const y = clamp(Math.round(region.y), 0, Math.max(0, meta.height - 1));
  const w = clamp(Math.round(region.w), 1, meta.width - x);
  const h = clamp(Math.round(region.h), 1, meta.height - y);

  const crop = await sharp(image).extract({ left: x, top: y, width: w, height: h }).toBuffer();
  const pre = await sharp(crop)
    .greyscale()
    .resize({ width: w * 3, kernel: 'cubic' })
    .normalize()
    .png()
    .toBuffer();
  let bin = await sharp(pre).threshold(140).png().toBuffer();
  const stats = await sharp(bin).stats();
  if (stats.channels[0].mean < 128) {
    bin = await sharp(bin).negate().png().toBuffer();
  }
  return bin;
}

/** Create the whitelisted Tesseract worker (parameters per STACK.md OCR tuning). */
async function createOcrWorker() {
  const os = await import('node:os');
  const { createWorker, PSM } = await import('tesseract.js');
  // Cache the eng traineddata outside the repo (runtime artifact — never committed).
  const cachePath = path.join(os.tmpdir(), 'neofoot-ocr-cache');
  const worker = await createWorker('eng', 1, { cachePath });
  await worker.setParameters({
    tessedit_char_whitelist: WHITELIST,
    user_defined_dpi: '300',
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  });
  return worker;
}

/**
 * Build one report row by comparing an expected value against a raw OCR read.
 * `type` comes from the region map (`text` for header-screen fields like
 * job/nickname; anything else is a locale-parsed numeric stat).
 */
function buildRow(file, field, expectedRaw, ocrText, type = 'numeric') {
  const cmp = compareField(expectedRaw, ocrText, type);
  return {
    field: `${file}:${field}`,
    expected: cmp.expected,
    parsed: cmp.parsed,
    ok: cmp.ok,
    raw: ocrText.trim(),
    expectedRaw: String(expectedRaw),
  };
}

/** Print the per-field accuracy table, overall field accuracy %, and verdict. */
function printReport(rows, accuracy, label) {
  console.log(`\n=== NeoFoot OCR spike — per-field accuracy report (${label}) ===`);
  console.log('field                       expected      parsed        ok      raw OCR');
  console.log('----------------------------------------------------------------------');
  for (const r of rows) {
    const name = r.field.padEnd(26);
    const exp = String(r.expectedRaw).padEnd(13);
    const got = String(r.parsed ?? '—').padEnd(13);
    const ok = r.ok ? 'OK  ' : 'FAIL';
    console.log(`${name} ${exp} ${got} ${ok}   "${r.raw}"`);
  }
  const pct = (accuracy * 100).toFixed(1);
  console.log('----------------------------------------------------------------------');
  console.log(
    `Fields: ${rows.length}   Correct: ${rows.filter((r) => r.ok).length}   ` +
      `Field accuracy: ${pct}%   Threshold: ${(ACCURACY_THRESHOLD * 100).toFixed(0)}%`,
  );
  console.log(`VERDICT: ${verdict(accuracy)}`);
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

/** Default mode: run the spike on the real screenshots. */
async function runSpike() {
  guardSamples();
  const regions = loadJson(REGIONS_PATH, 'region map (scripts/ocr-regions.json)');
  if (!existsSync(EXPECTED_PATH)) {
    console.error('[ocr-spike] Missing expected values: .secrets/ocr-samples/expected.json');
    console.error(`[ocr-spike] Copy the template ${EXPECTED_TEMPLATE_PATH} there and fill in the true values.`);
    process.exit(1);
  }
  const expected = loadJson(EXPECTED_PATH, 'expected values (.secrets/ocr-samples/expected.json)');

  const sharp = (await import('sharp')).default;
  const worker = await createOcrWorker();
  const rows = [];
  const warnings = [];

  for (const [groupName, group] of Object.entries(regions.groups || {})) {
    const file = group.screenshot;
    const filePath = path.join(SAMPLES_DIR, file);
    if (!existsSync(filePath)) {
      warnings.push(`group "${groupName}": screenshot ${file} not found in .secrets/ocr-samples/ — skipped`);
      continue;
    }
    const expectedForFile = expected[file];
    if (!expectedForFile || typeof expectedForFile !== 'object') {
      warnings.push(`group "${groupName}": no expected values for ${file} in expected.json — skipped`);
      continue;
    }
    const image = readFileSync(filePath);
    for (const [fieldName, rect] of Object.entries(group.regions || {})) {
      const expectedRaw = expectedForFile[fieldName];
      if (expectedRaw === undefined) {
        warnings.push(`${file}: no expected value for field "${fieldName}" — skipped`);
        continue;
      }
      const buf = await preprocessRegion(sharp, image, rect);
      const { data } = await worker.recognize(buf);
      rows.push(buildRow(file, fieldName, expectedRaw, data.text || ''));
    }
  }
  await worker.terminate();

  for (const w of warnings) console.warn(`[ocr-spike] WARN: ${w}`);
  if (rows.length === 0) {
    console.error('[ocr-spike] Nothing was measured — check the warnings above.');
    process.exit(1);
  }

  const accuracy = computeAccuracy(rows);
  printReport(rows, accuracy, 'REAL DATA');
  console.log('[ocr-spike] Record these numbers in the decision document:');
  console.log('[ocr-spike]   .planning/phases/01-foundation-secure-access-data-model/OCR-SPIKE-RESULTS.md');
}

/** Calibration aid: print each sample image's resolution. */
async function runInfo() {
  const images = guardSamples();
  const sharp = (await import('sharp')).default;
  console.log(`[ocr-spike] Samples in ${SAMPLES_DIR}:`);
  for (const file of images.sort()) {
    const meta = await sharp(path.join(SAMPLES_DIR, file)).metadata();
    console.log(`  ${file.padEnd(24)} ${meta.width}x${meta.height}`);
  }
  console.log('[ocr-spike] Calibrate scripts/ocr-regions.json pixel rects against these dimensions.');
}

/**
 * Synthetic pipeline self-test: renders numbers into images with sharp and runs
 * the full pipeline (region crop -> preprocess -> OCR -> parse -> accuracy ->
 * verdict). Proves the pipeline is runnable end-to-end WITHOUT real data —
 * this is NOT the go/no-go measurement (D-09 requires the real screenshots).
 */
async function runSelfTest() {
  const sharp = (await import('sharp')).default;

  // Synthetic "screenshots": white panel, black right-aligned values,
  // with region rects that exactly match the drawn text positions.
  const fixtures = [
    {
      file: 'general.png',
      values: { hp: '1.234.567', patk: '89.012', hit: '345' },
    },
    {
      file: 'quasi.png',
      values: { crit: '12,34%', aspd: '1.234' },
    },
    {
      file: 'special.png',
      values: { max_sp_pct: '5,67%', global_cd_pct: '0,5%' },
    },
  ];

  const worker = await createOcrWorker();
  const rows = [];
  for (const fx of fixtures) {
    const entries = Object.entries(fx.values);
    const height = 120 * entries.length + 60;
    const texts = entries
      .map(([, v], i) => `<text x="500" y="${120 + i * 120}" font-size="64" font-family="Arial, sans-serif" fill="black">${v}</text>`)
      .join('\n  ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}">\n  <rect width="800" height="${height}" fill="white"/>\n  ${texts}\n</svg>`;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();

    for (const [fieldName, expectedRaw] of entries) {
      const i = entries.findIndex(([n]) => n === fieldName);
      const rect = { x: 480, y: 120 + i * 120 - 60, w: 300, h: 80 };
      const buf = await preprocessRegion(sharp, image, rect);
      const { data } = await worker.recognize(buf);
      rows.push(buildRow(fx.file, fieldName, expectedRaw, data.text || ''));
    }
  }
  await worker.terminate();

  const accuracy = computeAccuracy(rows);
  printReport(rows, accuracy, 'SYNTHETIC SELF-TEST — not the real measurement');
  console.log('[ocr-spike] SELF-TEST OK: pipeline runs end-to-end (load -> preprocess -> OCR -> parse -> report).');
  console.log('[ocr-spike] The GO/NO-GO decision still requires the 10 real screenshots (D-09).');
}

// ---------------------------------------------------------------------------
// Entry point (import guard: the unit tests import the pure functions only)
// ---------------------------------------------------------------------------

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const mode = process.argv[2] || '';
  try {
    if (mode === '--self-test') await runSelfTest();
    else if (mode === '--info') await runInfo();
    else if (mode === '--help' || mode === '-h') {
      console.log('Usage: node scripts/ocr-spike.mjs [--self-test | --info]');
    } else await runSpike();
  } catch (err) {
    console.error('[ocr-spike] FAILED:', err?.message || err);
    process.exit(1);
  }
}
