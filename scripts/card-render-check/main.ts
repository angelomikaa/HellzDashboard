// Headless REAL-RENDER check for the crest card export (07.2-05 gates).
// Draws all four tier cards via the ACTUAL drawCard pipeline (fonts, images,
// canvas) at the 2000×2000 download backing store, then probes the pixels:
//
//  - frame: the plate base color covers the canvas edges (plate path painted)
//  - photo: the class portrait is clipped into the crop (crop-center pixels
//    differ from the plate base) — monogram tier: the ASST-01 tile shows
//  - text: white-ish glyph pixels exist inside the OVR guideline box and the
//    name band (text drawn per the owner's rects)
//  - chips: tier-hex chip pixels exist inside the six-key-stats band
//  - taint: canvas.toBlob('image/jpeg') succeeds for every tier
//
// The summary JSON lands in #results; the runner (PowerShell) reads the DOM
// dumped by Edge headless and asserts every probe passed.
import { buildCardPlan, drawCard, type CardExportData } from '../../src/features/export/cardExport'
import { CREST_GEOMETRY, type CrestPlateSolid } from '../../src/features/export/crestAssets'

const base: CardExportData = {
  name: 'Maria Silva',
  charClass: 'Assassin Cross',
  charFunction: 'dps',
  ovr: 87,
  stats: [
    { label_short: 'PCB', value: '1.234', points: 96, tier: 'platinum' },
    { label_short: 'CRT', value: '42,5%', points: 71, tier: 'gold' },
    { label_short: 'HP', value: '98.765', points: 55, tier: 'silver' },
    { label_short: 'ASP', value: '183%', points: 30, tier: 'bronze' },
    { label_short: 'PAT', value: '2.345', points: 12, tier: 'bronze' },
    { label_short: 'SPM', value: '67,8%', points: 88, tier: 'platinum' },
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
  const solid: CrestPlateSolid = { kind: 'solid', hex }
  void solid
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function near(d: Uint8ClampedArray, hex: string, tol: number): boolean {
  const [r, g, b] = hexToRgb(hex)
  return Math.abs(d[0] - r) <= tol && Math.abs(d[1] - g) <= tol && Math.abs(d[2] - b) <= tol
}

const CHIP_HEX: Record<string, string> = {
  bronze: '#C97F3F',
  silver: '#B8C0CC',
  gold: '#E9B44C',
  platinum: '#D7E3F0',
}

async function checkTier(canvas: HTMLCanvasElement, c: (typeof CASES)[number]): Promise<Record<string, unknown>> {
  const data = { ...base, ovr: c.ovr, photoSrc: c.photo, monogramLetter: 'A' }
  await drawCard(canvas, data)
  const ctx = canvas.getContext('2d')!
  const plan = buildCardPlan(data, 1000)
  const s = 2 // 2000×2000 backing = 2× the 1000 design space

  const px = (x: number, y: number): Uint8ClampedArray => ctx.getImageData(Math.round(x * s), Math.round(y * s), 1, 1).data

  // Frame: corners are painted with the plate base color (solid hex or the
  // first gradient stop — the edge-to-edge base under the plate path).
  const baseFill = plan.plateFill.kind === 'solid' ? plan.plateFill.hex : plan.plateFill.stops[0].color
  const frame = near(px(4, 4), baseFill, 8) && near(px(996, 4), baseFill, 8)

  // Photo crop / monogram: sample the crop area well inside the frame.
  let photo: boolean
  if (c.photo !== null) {
    const p = px(500, 260)
    photo = !near(p, baseFill, 12) // something that is NOT the plate base → an image is there
  } else {
    // ASST-01 monogram tile (#1E1E1E) fills the crop.
    photo = near(px(500, 260), plan.colors.monogramTile, 10)
  }

  // OVR text: count white glyphs inside the OVR guideline box.
  const g = plan.crest.guides.ovrNumber
  let ovrText = 0
  for (let y = g.y; y < g.y + g.h; y += 6) {
    for (let x = g.x; x < g.x + g.w; x += 6) {
      if (isWhiteish(px(x, y))) ovrText++
    }
  }

  // Name band text.
  const n = plan.crest.guides.nameAndJob
  let nameText = 0
  for (let y = n.y; y < n.y + n.h; y += 5) {
    for (let x = n.x; x < n.x + n.w; x += 8) {
      if (isWhiteish(px(x, y))) nameText++
    }
  }

  // Chips: tier-hex pixels inside the six-key-stats band (all six cells).
  const st = plan.crest.guides.sixKeyStats
  const chips = { bronze: 0, silver: 0, gold: 0, platinum: 0 } as Record<string, number>
  for (let y = st.y; y < st.y + st.h; y += 3) {
    for (let x = st.x; x < st.x + st.w; x += 3) {
      const d = px(x, y)
      for (const [k, hex] of Object.entries(CHIP_HEX)) {
        if (near(d, hex, 22)) chips[k]++
      }
    }
  }
  const chipTotal = Object.values(chips).reduce((a, b) => a + b, 0)

  // Taint check: toBlob must succeed (same-origin discipline).
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))

  return {
    frame,
    photo,
    ovrTextPixels: ovrText,
    nameTextPixels: nameText,
    chipPixels: chipTotal,
    blobOk: blob !== null && blob.type === 'image/jpeg' && blob.size > 20000,
  }
}

async function main(): Promise<void> {
  try {
    const results: Record<string, unknown> = {}
  for (const c of CASES) {
    const canvas = document.createElement('canvas')
    canvas.width = 2000
    canvas.height = 2000
    try {
      results[c.tier] = await checkTier(canvas, c)
    } catch (err) {
      results[c.tier] = { error: err instanceof Error ? err.message : String(err) }
    }
  }
  // Static crest facts ride along (they pin the design-source wiring).
  results.meta = {
    designSize: 1000,
    plateBronze: (CREST_GEOMETRY.bronze.plateFill as CrestPlateSolid).hex,
    hasCropAllTiers: (['bronze', 'silver', 'gold', 'platinum'] as const).every(
      (t) => CREST_GEOMETRY[t].photoCropPath.length > 100,
    ),
  }
  document.getElementById('results')!.textContent = JSON.stringify(results)
    document.title = 'card-render-check-done'
  } catch (err) {
    document.getElementById('results')!.textContent = JSON.stringify({ fatal: err instanceof Error ? err.message : String(err) })
    document.title = 'card-render-check-fatal'
  }
}

window.addEventListener('error', (e) => {
  document.getElementById('results')!.textContent = JSON.stringify({ fatal: e.message })
  document.title = 'card-render-check-fatal'
})
window.addEventListener('unhandledrejection', (e) => {
  document.getElementById('results')!.textContent = JSON.stringify({ fatal: String(e.reason) })
  document.title = 'card-render-check-fatal'
})

void main()
