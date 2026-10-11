#!/usr/bin/env node
/**
 * convert-spike-regions.mjs — the D-19 recalibration vehicle (plan 05-01).
 *
 * Converts the owner-validated spike pixel calibration (scripts/ocr-regions.json)
 * into the shipped percentage region maps (src/features/submit/ocr/regions.ts).
 *
 * Canonical reference groups only (05-RESEARCH §2):
 *   basic <- sampbasic, general <- sampideal1, quasi <- sampideal2,
 *   special <- sampideal3. The `common` samples are arbitrary scrolled crops
 *   used only for spike robustness measurement — never shipped.
 *
 * Group trimming (planner discretion, ratified at the 05-05 UAT): a region
 * ships only if its stat_key belongs to the capture's own catalog group
 * (supabase/seeds/stat_catalog.sql); basic keeps ONLY combat_power (D-06 —
 * nickname/job/levels are never submitted). A read then replaces exactly the
 * fields displayed on its own wizard step — no cross-step silent clearing.
 *
 * Loud failures: an unknown region key (a spike rename would silently ship a
 * dead region) or a trimmed count that does not match the catalog-derived
 * expectation aborts the run.
 *
 * Usage: node scripts/convert-spike-regions.mjs
 * Idempotent: re-running over an unchanged ocr-regions.json reproduces the
 * identical output file (hash-checked in 05-01 acceptance).
 *
 * Recalibration after a game UI change: recalibrate the spike maps, re-run
 * this script, normal deploy (D-19/D-21 — single active UI version).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REGIONS_PATH = path.join(__dirname, 'ocr-regions.json')
const OUT_PATH = path.resolve(
  __dirname,
  '..',
  'src',
  'features',
  'submit',
  'ocr',
  'regions.ts',
)

// The 57-stat catalog groups, mirroring supabase/seeds/stat_catalog.sql (the
// seed is the runtime truth; this copy is the generator's trimming filter —
// keep both in lockstep when the catalog evolves).
const CATALOG_GROUPS = {
  general: [
    'combat_power', 'hp', 'sp', 'patk', 'pdef', 'matk', 'mdef',
    'refine_patk', 'refine_pdef', 'refine_matk', 'refine_mdef',
    'hp_recover', 'sp_recover', 'hit', 'flee',
  ],
  quasi: [
    'aspd', 'mspd', 'variable_ct', 'variable_ct_pct', 'fixed_ct',
    'fixed_ct_pct', 'healing_done', 'healing_taken', 'crit', 'crit_res',
    'crit_dmg', 'crit_dmg_res', 'pdmg', 'pdmg_r', 'mdmg', 'mdmg_r',
    'ignore_pdef', 'ignore_pdef_pct', 'ignore_mdef', 'ignore_mdef_pct',
    'pdmg_bonus', 'mdmg_bonus', 'pve_dmg_reduction', 'pve_dmg_bonus',
    'pvp_dmg_reduction', 'pvp_dmg_bonus',
  ],
  special: [
    'max_sp_pct', 'equip_patk_pct', 'equip_matk_pct', 'equip_pdef_pct',
    'equip_mdef_pct', 'global_cd_pct', 'dmg_vs_small', 'dmg_vs_medium',
    'dmg_vs_large', 'dmg_vs_brute', 'dmg_vs_demi_human',
    'dmg_reduction_vs_small', 'dmg_reduction_vs_medium',
    'dmg_reduction_vs_large', 'dmg_reduction_vs_brute',
    'dmg_reduction_vs_demi_human',
  ],
}
const CATALOG = new Set(Object.values(CATALOG_GROUPS).flat())

// Canonical capture -> spike group projection, plus the catalog-derived
// region count each shipped capture must have after trimming.
const CAPTURE_SOURCES = [
  { capture: 'basic', group: 'sampbasic', expectedCount: 1 },
  { capture: 'general', group: 'sampideal1', expectedCount: 14 },
  { capture: 'quasi', group: 'sampideal2', expectedCount: 26 },
  { capture: 'special', group: 'sampideal3', expectedCount: 15 },
]

function fail(message) {
  console.error(`[convert-spike-regions] FAIL: ${message}`)
  process.exit(1)
}

/** pct = round((pixel / refDim) * 10000) / 10000 (05-RESEARCH §2). */
function toPct(pixel, refDim) {
  return Math.round((pixel / refDim) * 10000) / 10000
}

/** A region ships only if its key belongs to the capture's own catalog group. */
function keepKey(capture, key) {
  if (capture === 'basic') return key === 'combat_power' // D-06
  return CATALOG_GROUPS[capture].includes(key)
}

let spike
try {
  spike = JSON.parse(readFileSync(REGIONS_PATH, 'utf8'))
} catch (err) {
  fail(`could not read/parse ${REGIONS_PATH}: ${err.message}`)
}

const captures = []
for (const source of CAPTURE_SOURCES) {
  const group = spike.groups?.[source.group]
  if (!group || !group.resolution) {
    fail(`spike group "${source.group}" (capture "${source.capture}") missing from ${REGIONS_PATH}`)
  }
  const { width, height } = group.resolution
  const regions = []
  for (const [key, rect] of Object.entries(group.regions ?? {})) {
    if (!keepKey(source.capture, key)) continue
    if (!CATALOG.has(key)) {
      // A spike rename must never silently ship a dead region.
      fail(`region key "${key}" (${source.group}) is not a known catalog stat`)
    }
    regions.push({
      stat_key: key,
      rect: {
        x: toPct(rect.x, width),
        y: toPct(rect.y, height),
        w: toPct(rect.w, width),
        h: toPct(rect.h, height),
      },
    })
  }
  if (regions.length !== source.expectedCount) {
    fail(
      `capture "${source.capture}" trimmed to ${regions.length} regions, ` +
        `expected ${source.expectedCount} — spike map and catalog have drifted`,
    )
  }
  captures.push({
    capture: source.capture,
    aspect: Math.round((width / height) * 10000) / 10000,
    regions,
  })
}

// --- emit regions.ts --------------------------------------------------------

const ts = []
ts.push('// GENERATED by scripts/convert-spike-regions.mjs — DO NOT EDIT')
ts.push('// Region maps for the client OCR auto-read layer (plan 05-01), converted')
ts.push('// from the owner-validated spike calibration in scripts/ocr-regions.json')
ts.push('// and group-trimmed per 05-RESEARCH §2. Recalibration vehicle (D-19):')
ts.push('// recalibrate the spike maps, re-run the generator — never hand-edit.')
ts.push('')
ts.push("export type CaptureKey = 'basic' | 'general' | 'quasi' | 'special'")
ts.push('')
ts.push('/** The game UI layout version these rects were calibrated against (D-21 — single active version). */')
ts.push("export const GAME_UI_VERSION = 'ro-origin-ui-2026-10'")
ts.push('')
ts.push('/** Region rect as 0..1 fractions of the reference resolution. */')
ts.push('export interface PctRect { x: number; y: number; w: number; h: number }')
ts.push('')
ts.push('export interface CaptureMap {')
ts.push('  aspect: number')
ts.push('  regions: Array<{ stat_key: string; rect: PctRect }>')
ts.push('}')
ts.push('')
ts.push('export const CAPTURES: Record<CaptureKey, CaptureMap> = {')
for (const capture of captures) {
  ts.push(`  ${capture.capture}: {`)
  ts.push(`    aspect: ${capture.aspect},`)
  ts.push('    regions: [')
  for (const region of capture.regions) {
    const r = region.rect
    ts.push(
      `      { stat_key: '${region.stat_key}', rect: { x: ${r.x}, y: ${r.y}, w: ${r.w}, h: ${r.h} } },`,
    )
  }
  ts.push('    ],')
  ts.push('  },')
}
ts.push('}')
ts.push('')
ts.push('/**')
ts.push(' * Scale a percentage rect to a pixel rect on a concrete image (D-01: every')
ts.push(' * device renders the same layout proportionally). Round, then clamp: x/y land')
ts.push(' * within [0, dim-1]; w/h stay at least 1 and never run past the image edge.')
ts.push(' */')
ts.push(
  'export function rectToPixels(rect: PctRect, imgW: number, imgH: number): { x: number; y: number; w: number; h: number } {',
)
ts.push('  const x = clamp(Math.round(rect.x * imgW), 0, Math.max(0, imgW - 1))')
ts.push('  const y = clamp(Math.round(rect.y * imgH), 0, Math.max(0, imgH - 1))')
ts.push('  const w = clamp(Math.round(rect.w * imgW), 1, Math.max(1, imgW - x))')
ts.push('  const h = clamp(Math.round(rect.h * imgH), 1, Math.max(1, imgH - y))')
ts.push('  return { x, y, w, h }')
ts.push('}')
ts.push('')
ts.push('function clamp(n: number, lo: number, hi: number): number {')
ts.push('  return Math.min(Math.max(n, lo), hi)')
ts.push('}')
ts.push('')

const out = ts.join('\n')
writeFileSync(OUT_PATH, out, 'utf8')

const total = captures.reduce((n, c) => n + c.regions.length, 0)
console.log(`[convert-spike-regions] wrote ${OUT_PATH}`)
for (const capture of captures) {
  console.log(`[convert-spike-regions]   ${capture.capture.padEnd(8)} ${capture.regions.length} regions (aspect ${capture.aspect})`)
}
console.log(`[convert-spike-regions] ${total} regions total (56 of 57 catalog stats covered; only dmg_vs_demi_human is not)`)
