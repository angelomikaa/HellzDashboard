// Headless REAL-RENDER check for the card export (07.2-05 gates; round 5,
// the owner's single card.svg source of truth). Draws all four tier cards
// via the ACTUAL drawCard pipeline (fonts, images, canvas) at the 2160×3200
// download backing store (2× the 1080×1600 design space), then probes the
// pixels:
//
//  - frame: the tier plate fill covers the canvas corners (outside the
//    plate silhouette) and the plate area is painted
//  - photo: the class portrait is CLIPPED INTO the crop path (grid probe
//    inside the crop bbox differs from the plate fill) — monogram tier:
//    the ASST-01 tile shows
//  - border: the tier gradient stroke shows along the silhouette edges at
//    the gradient line's ends (probe near stop0 / stop1 colors, distinct
//    from the plate fill)
//  - text: white OVR + job glyphs over the photo (top-left); palette
//    text-fill glyphs for the name (on the plate) and the six stat columns
//  - fonts: document.fonts.check confirms Orbitron loaded (no serif
//    fallback rendered)
//  - readability: the points type stays ≥ 8% of the card width (the
//    round-5 lock on the big rank numbers)
//  - aspect gate: drawCard REJECTS a wrong-aspect (square) backing store
//  - taint: canvas.toBlob('image/jpeg') succeeds for every tier
//
// The summary JSON lands in #results; the runner reads the DOM dumped by
// Edge headless and asserts every probe passed.
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { buildCardPlan, drawCard, type CardExportData } from '../../src/features/export/cardExport'
import { CARD_DESIGN_HEIGHT, CARD_DESIGN_WIDTH, CARD_GEOMETRY, TIER_PALETTE } from '../../src/features/export/cardAssets'
import { CardSvg } from '../../src/features/cards/CardSvg'

const base: CardExportData = {
  name: 'Maria Silva',
  charClass: 'Assassin Cross',
  charFunction: 'dps',
  ovr: 87,
  stats: [
    { label_short: 'PCB', value: '1.234', points: 96 },
    { label_short: 'CRT', value: '42,5%', points: 71 },
    { label_short: 'HP', value: '98.765', points: 55 },
    { label_short: 'ASP', value: '183%', points: 30 },
    { label_short: 'PAT', value: '2.345', points: 12 },
    { label_short: 'SPM', value: '67,8%', points: 88 },
  ],
  photoSrc: null,
  monogramLetter: 'A',
}

const CASES: Array<{ tier: string; ovr: number; photo: string | null }> = [
  { tier: 'bronze', ovr: 60, photo: null }, // monogram fallback path
  { tier: 'silver', ovr: 70, photo: '/assets/classes/class-icon-high-wizard.png' },
  { tier: 'gold', ovr: 80, photo: '/assets/classes/class-icon-assassin-cross.png' },
  { tier: 'platinum', ovr: 87, photo: '/assets/classes/class-icon-lord-knight.png' },
]

function isWhiteish(d: Uint8ClampedArray): boolean {
  return d[0] > 200 && d[1] > 200 && d[2] > 200
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function near(d: Uint8ClampedArray, hex: string, tol: number): boolean {
  const [r, g, b] = hexToRgb(hex)
  return Math.abs(d[0] - r) <= tol && Math.abs(d[1] - g) <= tol && Math.abs(d[2] - b) <= tol
}

async function checkTier(canvas: HTMLCanvasElement, c: (typeof CASES)[number]): Promise<Record<string, unknown>> {
  const data = { ...base, ovr: c.ovr, photoSrc: c.photo, monogramLetter: 'A' }
  await drawCard(canvas, data)
  const ctx = canvas.getContext('2d')!
  const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
  const palette = TIER_PALETTE[plan.tier]
  const s = canvas.width / CARD_DESIGN_WIDTH // 2160/1080 = 2× the design space

  const px = (x: number, y: number): Uint8ClampedArray => ctx.getImageData(Math.round(x * s), Math.round(y * s), 1, 1).data

  const plateFill = palette.plateFill

  // Frame: the canvas corners are OUTSIDE the plate silhouette → they show
  // the edge-to-edge plate fill base.
  const frame = near(px(4, 4), plateFill, 8) && near(px(CARD_DESIGN_WIDTH - 4, 4), plateFill, 8)

  // Photo area: the crop path. Sample a grid inside its bbox (skipping the
  // scrimmed top and the OVR block) — the photo is present if ANY sampled
  // pixel differs from the plate fill (single-point probes are fragile:
  // light portraits can touch the silver fill's color at one spot).
  let photo: boolean
  const b = plan.photoBBox
  if (c.photo !== null) {
    photo = false
    for (let y = b.y + b.h * 0.45; y < b.y + b.h * 0.95 && !photo; y += 40) {
      for (let x = b.x + b.w * 0.15; x < b.x + b.w * 0.85 && !photo; x += 40) {
        if (!near(px(x, y), plateFill, 12)) photo = true
      }
    }
  } else {
    // ASST-01 monogram tile (#1E1E1E) fills the crop path — probe BELOW the
    // OVR block (whose white glyphs sit over the photo's upper region).
    photo = near(px(b.x + b.w * 0.3, b.y + b.h * 0.75), plan.colors.monogramTile, 10)
  }

  // Gradient border: probe the silhouette's left/right edges BELOW the
  // crop area (y=1100 — the photo covers the border above y≈864 by design:
  // the crop path reaches the silhouette edges). The clip shows the
  // stroke's inner half (~20px wide); the gradient line's horizontal
  // offsets depend only on x.
  const line = plan.card.borderStroke.line
  const stop0 = palette.borderStops[0].color
  const stop1 = palette.borderStops[palette.borderStops.length - 1].color
  const leftX = line.x1 + 21
  const rightX = line.x2 - 11
  const midY = 1100
  const toHex = (d: Uint8ClampedArray): string =>
    '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')
  const leftPx = px(leftX, midY)
  const rightPx = px(rightX, midY)
  const borderGradient =
    (near(leftPx, stop0, 70) || near(leftPx, stop1, 70)) &&
    (near(rightPx, stop1, 70) || near(rightPx, stop0, 70)) &&
    !near(leftPx, plateFill, 8) &&
    !near(rightPx, plateFill, 8)

  // OVR text: count white glyphs over the photo (number + job name block,
  // top-left — the parsed OVR/job slots' region).
  let ovrText = 0
  for (let y = 230; y < 545; y += 5) {
    for (let x = 100; x < 560; x += 5) {
      if (isWhiteish(px(x, y))) ovrText++
    }
  }

  // Name: glyph pixels in the palette's text fill, on the plate between
  // the crop area and the stat columns.
  let nameText = 0
  for (let y = 920; y < 1060; y += 4) {
    for (let x = 150; x < 930; x += 6) {
      if (near(px(x, y), palette.textFill, 60)) nameText++
    }
  }

  // Stat columns: glyph pixels in the text fill across the three slot rows
  // (labels ≈1141 / points ≈1265 / values ≈1315).
  let statText = 0
  for (let y = 1090; y < 1340; y += 4) {
    for (let x = 110; x < 1000; x += 5) {
      if (near(px(x, y), palette.textFill, 60)) statText++
    }
  }

  // Taint check: toBlob must succeed (same-origin discipline).
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))

  return {
    frame,
    photo,
    borderGradient,
    borderProbe: { left: toHex(leftPx), right: toHex(rightPx), expectL: stop0, expectR: stop1, plate: plateFill },
    ovrTextPixels: ovrText,
    nameTextPixels: nameText,
    statTextPixels: statText,
    pointsSizeRatio: plan.stats[0].pointsSize / CARD_DESIGN_WIDTH,
    blobOk: blob !== null && blob.type === 'image/jpeg' && blob.size > 20000,
  }
}

// ---------------------------------------------------------------------------
// ON-PAGE SVG AUDIT (round 6, the owner's overflow defect: "the card is
// overflowing — the shape was reduced but the letters were not").
//
// The canvas probes above only exercise the EXPORT surface; the owner saw
// the overflow on the PAGE. This audit mounts the REAL CardSvg component
// (the same <svg viewBox> composition the Destaques/Painel render) and
// measures every text slot's RENDERED advance with the real loaded Orbitron
// (getComputedTextLength — font-metric truth, in design-space user units,
// independent of display size) against its column bound:
//
//  - slot fit: every text's rendered length ≤ its bound (label/points/value
//    ≤ column width; name ≤ plate bound; OVR/job ≤ their bounds) — this is
//    the assertion that would have caught the round-5 defect (the SVG-side
//    0.62em advance estimate passed slots that REAL Orbitron metrics
//    overflow: a 3-letter 72px label is ~162px wide, its column ~136px).
//  - plate containment: name/stat glyphs stay inside the plate silhouette's
//    inner span (60..1020 in design space).
//  - scale tracking: the same SVG mounted at 360px and 720px container
//    widths renders the name glyph box at exactly half/double the client
//    width — text and card shape MUST scale together (this would have
//    caught an HTML-overlay regression where text lives outside the SVG's
//    coordinate space).
const OVR_MAXW_DESIGN = CARD_DESIGN_WIDTH - CARD_GEOMETRY.slots.ovr.x - 40 // mirrors the job bound

interface SlotExpectation {
  text: string
  maxW: number
  x: number | null // null = centered (name) — plate-containment instead
}

async function auditMount(
  width: number,
  data: CardExportData,
  expectNameClientW: boolean,
): Promise<Record<string, unknown>> {
  const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
  const expected: SlotExpectation[] = [
    { text: plan.ovr.text, maxW: OVR_MAXW_DESIGN, x: plan.ovr.x },
    { text: plan.ovr.jobText, maxW: plan.ovr.jobMaxW, x: plan.ovr.jobX },
    { text: plan.name.text, maxW: plan.name.maxWidth, x: null },
    ...plan.stats.flatMap((c) => [
      { text: c.label, maxW: c.labelMaxW, x: c.labelX },
      { text: c.points, maxW: c.pointsMaxW, x: c.pointsX },
      { text: c.value, maxW: c.valueMaxW, x: c.valueX },
    ]),
  ]

  const host = document.createElement('div')
  host.style.width = `${width}px`
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(createElement(CardSvg, { data }))
  // Concurrent React commits via MessageChannel — timer ticks (NOT rAF:
  // headless virtual time never pumps frames) are enough to flush the
  // commit before measuring.
  await new Promise<void>((resolve) => setTimeout(resolve, 150))
  void fetch(`/__progress?audit=w${width}`, { method: 'POST', body: 'mounted' }).catch(() => {})

  const svg = host.querySelector('svg')
  const violations: string[] = []
  let nameClientW = -1
  if (!svg) {
    violations.push('no <svg> mounted')
  } else {
    const texts = Array.from(svg.querySelectorAll('text'))
    if (texts.length !== expected.length) {
      violations.push(`expected ${expected.length} text nodes, found ${texts.length}`)
    }
    texts.forEach((t, i) => {
      const exp = expected[i]
      if (!exp) return
      if (t.textContent !== exp.text) {
        violations.push(`slot ${i}: content "${t.textContent}" ≠ expected "${exp.text}"`)
        return
      }
      const len = t.getComputedTextLength()
      // 4px: glyph INK boxes overshoot/undershoot the advance-width anchors
      // by ~2-3px (side bearings) — the bounds are advance-based with an 8px
      // gutter, so bearing-level excursions are typographically safe.
      if (len > exp.maxW + 4) {
        violations.push(`slot ${i} "${exp.text}": rendered ${len.toFixed(1)} > bound ${exp.maxW.toFixed(1)}`)
      }
      const bb = t.getBBox()
      if (exp.x === null) {
        // Centered name on the plate: glyphs must stay in the silhouette's
        // inner span (plate interior 60..1020 in design space).
        if (bb.x < 60 || bb.x + bb.width > 1020) {
          violations.push(`name bbox ${bb.x.toFixed(1)}..${(bb.x + bb.width).toFixed(1)} leaves the plate span 60..1020`)
        }
      } else {
        if (bb.x < exp.x - 4) {
          violations.push(`slot ${i} starts at ${bb.x.toFixed(1)} < anchor ${exp.x.toFixed(1)}`)
        }
        if (bb.x + bb.width > exp.x + exp.maxW + 4) {
          violations.push(`slot ${i} "${exp.text}" glyphs end at ${(bb.x + bb.width).toFixed(1)} > ${exp.x + exp.maxW}`)
        }
      }
    })
    if (expectNameClientW && texts[2]) {
      nameClientW = texts[2].getBoundingClientRect().width
    }
  }
  root.unmount()
  host.remove()
  return { containerWidth: width, texts: violations.length === 0 ? expected.length : 'violations', violations, nameClientW }
}

async function auditOnPage(): Promise<Record<string, unknown>> {
  await Promise.all([
    document.fonts.load('900 100px Orbitron'),
    document.fonts.load('700 100px Orbitron'),
    document.fonts.load('600 100px Orbitron'),
  ])
  await document.fonts.ready
  const out: Record<string, unknown> = {}
  // The showcase-data case (short name) and a stress case (long name — the
  // clamp path) at TWO display widths each.
  const showcase: CardExportData = { ...base, ovr: 87, photoSrc: '/assets/classes/class-icon-lord-knight.png' }
  const stress: CardExportData = {
    ...showcase,
    name: 'Alexander von Hohenzollern-Sigmaringen',
    stats: showcase.stats.map((s, i) => (i === 0 ? { ...s, value: '123.456' } : s)),
  }
  for (const width of [360, 720]) {
    out[`w${width}`] = await auditMount(width, showcase, true)
    out[`stressW${width}`] = await auditMount(width, stress, false)
  }
  // Scale tracking: the name glyph box must double exactly when the card
  // container doubles (text lives IN the SVG's coordinate space).
  const w360 = out.w360 as { nameClientW: number }
  const w720 = out.w720 as { nameClientW: number }
  const ratio = w720.nameClientW / w360.nameClientW
  out.scaleTracking = { nameRatio360to720: Number(ratio.toFixed(4)), ok: Math.abs(ratio - 2) < 0.05 }
  return out
}

async function main(): Promise<void> {
  try {
    const results: Record<string, unknown> = {}
    for (const c of CASES) {
      const canvas = document.createElement('canvas')
      canvas.width = 2160
      canvas.height = 3200
      try {
        results[c.tier] = await checkTier(canvas, c)
        void fetch(`/__progress?tier=${c.tier}`, { method: 'POST', body: 'ok' }).catch(() => {})
      } catch (err) {
        results[c.tier] = { error: err instanceof Error ? err.message : String(err) }
        void fetch(`/__progress?tier=${c.tier}`, { method: 'POST', body: 'err' }).catch(() => {})
      }
    }
    // The aspect gate: a wrong-aspect (square) backing store must be
    // REJECTED loudly (round-2 lesson, at the 27:40 design aspect).
    const gateCanvas = document.createElement('canvas')
    gateCanvas.width = 2000
    gateCanvas.height = 2000
    let aspectGate = false
    try {
      await drawCard(gateCanvas, base)
    } catch {
      aspectGate = true
    }
    // Fonts: Orbitron must ACTUALLY be loaded (no serif fallback in the
    // glyph probes above).
    const fontsLoaded =
      document.fonts.check('900 100px Orbitron') &&
      document.fonts.check('700 100px Orbitron') &&
      document.fonts.check('600 100px Orbitron')
    // The on-page SVG surface: real-metric slot-fit + scale-tracking audit.
    try {
      results.onPage = await auditOnPage()
    } catch (err) {
      results.onPage = { fatal: err instanceof Error ? err.message : String(err) }
    }
    // Static design facts ride along (they pin the design-source wiring).
    results.meta = {
      designSize: `${CARD_DESIGN_WIDTH}x${CARD_DESIGN_HEIGHT}`,
      sourceFile: 'src/assets/card.svg (single source of truth, round 5)',
      slotCount: CARD_GEOMETRY.slots.stats.length,
      ovrEffectiveSize: CARD_GEOMETRY.slots.ovr.size,
      plateFillsDistinct: new Set(Object.values(TIER_PALETTE).map((p) => p.plateFill)).size === 4,
      borderWidthAllTiers: CARD_GEOMETRY.borderStroke.width === 40,
      fontsLoaded,
      aspectGateRejectsSquare: aspectGate,
    }
    document.getElementById('results')!.textContent = JSON.stringify(results)
    document.title = 'card-render-check-done'
    // Edge 155's headless --dump-dom prints nothing — ship the results to
    // the collector server instead (same origin; best-effort, the DOM copy
    // above stays the primary sink for interactive runs).
    void fetch('/__results', { method: 'POST', body: JSON.stringify(results) }).catch(() => {})
  } catch (err) {
    document.getElementById('results')!.textContent = JSON.stringify({ fatal: err instanceof Error ? err.message : String(err) })
    document.title = 'card-render-check-fatal'
    void fetch('/__results', { method: 'POST', body: JSON.stringify({ fatal: err instanceof Error ? err.message : String(err) }) }).catch(() => {})
  }
}

window.addEventListener('error', (e) => {
  document.getElementById('results')!.textContent = JSON.stringify({ fatal: e.message })
  document.title = 'card-render-check-fatal'
  void fetch('/__results', { method: 'POST', body: JSON.stringify({ fatal: e.message }) }).catch(() => {})
})
window.addEventListener('unhandledrejection', (e) => {
  document.getElementById('results')!.textContent = JSON.stringify({ fatal: String(e.reason) })
  document.title = 'card-render-check-fatal'
  void fetch('/__results', { method: 'POST', body: JSON.stringify({ fatal: String(e.reason) }) }).catch(() => {})
})

void main()
