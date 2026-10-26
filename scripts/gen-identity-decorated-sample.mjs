#!/usr/bin/env node
// Generates the DECORATED-NICKNAME identity fixture (owner report 2026-10-26:
// the "☆★RAIZA★☆" print read as "SXRAIZAK 2" — the Latin whitelist has no
// class for the decoration, so each star was forced into its nearest letter).
//
// Input : .secrets/ocr-samples/sampidentityaryah.jpg   (real card, "Aryah")
// Output: .secrets/ocr-samples/sampidentitystarname.jpg ("☆★Aryah★☆")
//
// Only the star glyphs are composited — the card pixels stay untouched, so the
// read still exercises the real card geometry, JPEG noise and font. The stars
// are drawn as SVG PATHS (not text) so the fixture is identical on every
// machine (no font resolution involved), in the card's own text colour and cap
// height, where the game prints decoration: immediately before and after the
// name. The pencil badge right of the name is cleared first (a background
// patch copy, not a flat fill, so the card's gradient stays seamless) so the
// trailing pair lands on card background instead of on top of the icon.
//
// The sample bytes are gitignored by design (D-09/D-10); this script is the
// committed recipe. Run it before the OCR harness when the fixture is missing.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SAMPLES = path.join(ROOT, '.secrets', 'ocr-samples')
const SOURCE = path.join(SAMPLES, 'sampidentityaryah.jpg')
const TARGET = path.join(SAMPLES, 'sampidentitystarname.jpg')

// Geometry measured on sampidentityaryah.jpg (725x341): the name glyphs run
// x 169..243, y 25..48 (cap height 24px); the pencil badge sits x 252..295,
// y 15..45; everything right of x 300 is card background.
const NAME = { left: 169, right: 243, top: 25, baseline: 48 }
const BADGE = { left: 252, top: 15, width: 44, height: 44 }
const PATCH = { left: 300, top: 15, width: 44, height: 44 }
const NAME_COLOR = '#5b87e7' // dominant glyph colour (89,135,231)

/** Five-point star as an SVG path (outer radius `outer`, inner `inner`). */
function starPath(cx, cy, outer, inner) {
  const points = []
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    points.push(
      `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`,
    )
  }
  return `M${points.join('L')}Z`
}

const OUTER = 11
const INNER = 4.6
const CY = (NAME.top + NAME.baseline) / 2 // vertical centre of the name band

// "☆★" before the name, "★☆" after it (owner's description of the print).
const stars = [
  `<path d="${starPath(132, CY, OUTER, INNER)}" fill="none" stroke="${NAME_COLOR}" stroke-width="2.4" stroke-linejoin="round"/>`,
  `<path d="${starPath(156, CY, OUTER, INNER)}" fill="${NAME_COLOR}"/>`,
  `<path d="${starPath(259, CY, OUTER, INNER)}" fill="${NAME_COLOR}"/>`,
  `<path d="${starPath(283, CY, OUTER, INNER)}" fill="none" stroke="${NAME_COLOR}" stroke-width="2.4" stroke-linejoin="round"/>`,
].join('')

if (!existsSync(SOURCE)) {
  console.error(`[gen] missing source sample: ${path.relative(ROOT, SOURCE)}`)
  process.exit(1)
}

const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

// Clear the pencil badge by copying a same-size background patch over it.
for (let row = 0; row < BADGE.height; row++) {
  const from = ((PATCH.top + row) * info.width + PATCH.left) * 4
  const to = ((BADGE.top + row) * info.width + BADGE.left) * 4
  data.copyWithin(to, from, from + BADGE.width * 4)
}

const overlay = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${stars}</svg>`,
)

await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .composite([{ input: overlay }])
  .jpeg({ quality: 95 })
  .toFile(TARGET)

console.log(`[gen] wrote ${path.relative(ROOT, TARGET)} (${info.width}x${info.height})`)
