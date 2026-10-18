// Headless REAL-RENDER check for the crest card export (07.2-05 gates;
// round 4 readability redesign). Draws all four tier cards via the ACTUAL
// drawCard pipeline (fonts, images, canvas) at the 2160×3200 download
// backing store (2× the 1080×1600 design space), then probes the pixels:
//
//  - frame: the tier fill covers the canvas corners (outside the plate
//    silhouette) and the plate area is painted
//  - photo: the class portrait fills the Content-safezone (probe differs
//    from the tier fill) — monogram tier: the ASST-01 tile shows
//  - bands: the SOLID Name-only / six-key-stats bands are the tier hex
//  - text: white glyph pixels exist inside the OVR box (number + job name);
//    band-text-colored glyph pixels exist inside the Name-only band
//  - chips: tier-hex chip pixels exist inside the six-key-stats band
//  - readability: the stat value type is ≥ 3.5% of the card width (the
//    round-4 contract — text must be LARGE)
//  - aspect gate: drawCard REJECTS a wrong-aspect (square) backing store
//  - taint: canvas.toBlob('image/jpeg') succeeds for every tier
//
// The summary JSON lands in #results; the runner reads the DOM dumped by
// Edge headless and asserts every probe passed.
import { buildCardPlan, drawCard, type CardExportData } from '../../src/features/export/cardExport'
import { CREST_DESIGN_HEIGHT, CREST_DESIGN_WIDTH, CREST_GEOMETRY } from '../../src/features/export/crestAssets'

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
  const plan = buildCardPlan(data, CREST_DESIGN_WIDTH)
  const s = canvas.width / CREST_DESIGN_WIDTH // 2160/1080 = 2× the design space

  const px = (x: number, y: number): Uint8ClampedArray => ctx.getImageData(Math.round(x * s), Math.round(y * s), 1, 1).data

  const tierFill = plan.crest.tierFillHex

  // Frame: the canvas corners are OUTSIDE the plate silhouette → they show
  // the edge-to-edge tier fill base.
  const frame = near(px(4, 4), tierFill, 8) && near(px(CREST_DESIGN_WIDTH - 4, 4), tierFill, 8)

  // Photo area: sample a grid across the Content-safezone (well above the
  // solid bands) — the photo is present if ANY sampled pixel differs from
  // the tier fill (single-point probes are fragile: light portraits can
  // touch the silver fill's color at one spot).
  let photo: boolean
  const g0 = plan.crest.guides.contentSafezone
  if (c.photo !== null) {
    photo = false
    for (let y = g0.y + g0.h * 0.1; y < g0.y + g0.h * 0.7 && !photo; y += 40) {
      for (let x = g0.x + g0.w * 0.15; x < g0.x + g0.w * 0.85 && !photo; x += 40) {
        if (!near(px(x, y), tierFill, 12)) photo = true
      }
    }
  } else {
    // ASST-01 monogram tile (#1E1E1E) fills the safezone.
    photo = near(px(g0.x + g0.w / 2, 640), plan.colors.monogramTile, 10)
  }

  // SOLID bands: the Name-only band's fill is the tier hex (over the photo).
  const n = plan.crest.guides.nameOnly
  const bandSolid =
    near(px(n.x + n.w / 2, n.y + 8), tierFill, 10) && near(px(n.x + 8, n.y + n.h / 2), tierFill, 10)

  // OVR text: count white glyphs inside the OVR box (number + job name).
  const g = plan.crest.guides.ovrBox
  let ovrText = 0
  for (let y = g.y; y < g.y + g.h; y += 6) {
    for (let x = g.x; x < g.x + g.w; x += 6) {
      if (isWhiteish(px(x, y))) ovrText++
    }
  }

  // Name band text: glyph pixels in the band's TEXT color (dark on metals,
  // white on the pristine magenta — the round-4 contrast contract).
  let nameText = 0
  for (let y = n.y; y < n.y + n.h; y += 5) {
    for (let x = n.x; x < n.x + n.w; x += 8) {
      if (near(px(x, y), plan.nameBand.text, 40)) nameText++
    }
  }

  // Chips: tier-hex pixels inside the six-key-stats band (all six cells).
  const st = plan.crest.guides.sixKeyStats
  const chips: Record<string, number> = { bronze: 0, silver: 0, gold: 0, platinum: 0 }
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
    bandSolid,
    ovrTextPixels: ovrText,
    nameTextPixels: nameText,
    chipPixels: chipTotal,
    valueSizeRatio: plan.stats[0].valueSize / CREST_DESIGN_WIDTH,
    blobOk: blob !== null && blob.type === 'image/jpeg' && blob.size > 20000,
  }
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
      } catch (err) {
        results[c.tier] = { error: err instanceof Error ? err.message : String(err) }
      }
    }
    // The aspect gate: a wrong-aspect (square) backing store must be
    // REJECTED loudly (round-2 lesson, now at the 27:40 design aspect).
    const gateCanvas = document.createElement('canvas')
    gateCanvas.width = 2000
    gateCanvas.height = 2000
    let aspectGate = false
    try {
      await drawCard(gateCanvas, base)
    } catch {
      aspectGate = true
    }
    // Static crest facts ride along (they pin the design-source wiring).
    results.meta = {
      designSize: `${CREST_DESIGN_WIDTH}x${CREST_DESIGN_HEIGHT}`,
      tierFillBronze: CREST_GEOMETRY.bronze.tierFillHex,
      borderWidthAllTiers: (['bronze', 'silver', 'gold', 'platinum'] as const).every(
        (t) => CREST_GEOMETRY[t].borderStroke.width === 40,
      ),
      aspectGateRejectsSquare: aspectGate,
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
