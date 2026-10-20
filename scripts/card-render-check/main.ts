// Headless REAL-RENDER check for the card export (07.2-05 gates; round 8,
// the owner's re-seed: the border strokes the PLATE silhouette (three-layer
// background — the crop area stays borderless), semantic KEY slots with the
// label ABOVE the rating, 48px border, ≈148px OVR). Draws all four tier
// cards via the ACTUAL drawCard pipeline (fonts, images, canvas) at the
// 2160×3200 download backing store (2× the 1080×1600 design space), then
// probes the pixels:
//
//  - transparency: the canvas corners sit OUTSIDE the plate silhouette and
//    the PNG has NO background — alpha must be 0 there (round 7 export)
//  - plate: the tier fill paints the shield interior
//  - photo: the class portrait is CLIPPED INTO the crop path (grid probe
//    inside the crop bbox differs from the plate fill) — monogram tier:
//    the ASST-01 tile shows
//  - border (round 8 file semantics): the tier gradient stroke's band rings
//    the PLATE silhouette (left/right verticals + bottom tip) and covers
//    the photo's top edge — and the crop path's bottom closure (~y=937)
//    shows UNBROKEN plate fill (the round-7 "border in the crop" defect is
//    locked out)
//  - text: white OVR + job glyphs over the photo (top-left); palette
//    text-fill glyphs for the name (on the plate) and the six stat columns
//  - fonts: document.fonts.check confirms Orbitron AND Bebas Neue loaded
//    (no serif fallback rendered)
//  - Bebas estimate: the conservative 0.5em/char estimate never
//    UNDER-estimates the real Bebas advances (measureText truth)
//  - readability: the points type stays ≥ 8% of the card width (the
//    round-5 lock on the big rank numbers)
//  - aspect gate: drawCard REJECTS a wrong-aspect (square) backing store
//  - export: canvas.toBlob('image/png') succeeds for every tier (taint +
//    round-7 PNG format)
//  - FILE-VS-APP RENDER DIFF (round 8): the actual card.svg rasterized
//    in-browser (palette + photo + scrim injected into the file's own
//    structure) vs BOTH app surfaces at the same inputs — pixel-identity
//    outside the masked text/mark regions, for every tier
//
// The summary JSON lands in #results; the runner reads the DOM dumped by
// Edge headless and asserts every probe passed.
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  buildCardPlan,
  drawCard,
  estimateBebas,
  type CardExportData,
} from '../../src/features/export/cardExport'
import { CARD_DESIGN_HEIGHT, CARD_DESIGN_WIDTH, CARD_GEOMETRY, TIER_PALETTE } from '../../src/features/export/cardAssets'
import { CardSvg } from '../../src/features/cards/CardSvg'
import cardRaw from '../../src/assets/card.svg?raw'

const base: CardExportData = {
  name: 'Maria Silva',
  charClass: 'Assassin Cross',
  charFunction: 'dps',
  ovr: 87,
  stats: [
    { label_short: 'MATK', value: '1.234', points: 96 },
    { label_short: 'MDEF', value: '42,5%', points: 71 },
    { label_short: 'HP', value: '98.765', points: 55 },
    { label_short: 'ASPD', value: '183%', points: 30 },
    { label_short: 'MDMG.R', value: '2.345', points: 12 },
    { label_short: 'PVP.R', value: '67,8%', points: 88 },
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

const toHex = (d: Uint8ClampedArray): string =>
  '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')

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

  // Transparency (round 7): the canvas corners sit OUTSIDE the plate
  // silhouette and the PNG has NO background — alpha MUST be 0 there.
  const cornerAlpha = (x: number, y: number): number => ctx.getImageData(x, y, 1, 1).data[3]
  const transparentOutside =
    cornerAlpha(4, 4) === 0 &&
    cornerAlpha(canvas.width - 5, 4) === 0 &&
    cornerAlpha(4, canvas.height - 5) === 0 &&
    cornerAlpha(canvas.width - 5, canvas.height - 5) === 0

  // Plate: the tier fill paints the shield interior (probe points well
  // inside the silhouette, clear of text/lines: between name and stats,
  // and in the plate tip below the stats).
  const platePainted =
    near(px(540, 1140), plateFill, 8) && near(px(300, 1400), plateFill, 8)

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

  // Border (round 8, THE FILE'S THREE-LAYER SEMANTICS): the gradient stroke
  // runs ON THE PLATE SILHOUETTE — the border rings the WHOLE shield; the
  // crop area itself stays BORDERLESS. Probes at FOUR points along the
  // plate outline (visible band = inner ≈24px, clip cuts the outer half):
  //   · left band  (x≈86,  y=600): inner half of the left vertical — ≈stop0
  //   · right band (x≈993, y=600): inner half of the right vertical — ≈stop1
  //   · bottom tip (x=540, y=1505): inner band above the shield's bottom
  //     vertex (~1517.6) — mid-gradient over the plate fill
  //   · top arc (x=540, y=95): the inner band OVER THE PHOTO's top edge —
  //     the border paints after the photo (three-layer order)
  // …and the REGRESSION LOCK for the owner's round-8 ruling ("the border is
  // in the crop, which would be incorrect"): at the crop path's bottom
  // closure (x=540, y≈937..961) the plate fill shows UNBROKEN — the old
  // round-7 implementation stroked the CROP path and painted the gradient
  // exactly there.
  const stop0 = palette.borderStops[0].color
  const stop1 = palette.borderStops[palette.borderStops.length - 1].color
  const midHex = (a: string, b: string): string => {
    const [r1, g1, b1] = hexToRgb(a)
    const [r2, g2, b2] = hexToRgb(b)
    const mid = (u: number, v: number) => Math.round((u + v) / 2)
    return `#${[mid(r1, r2), mid(g1, g2), mid(b1, b2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  }
  const expectedMid = midHex(stop0, stop1)
  const leftPx = px(86, 600)
  const rightPx = px(993, 600)
  const bottomPx = px(540, 1505)
  const cropLinePx = px(540, 950)
  const overPhotoPx = px(540, 95)
  const borderGradient =
    (near(leftPx, stop0, 70) || near(leftPx, stop1, 70)) &&
    (near(rightPx, stop1, 70) || near(rightPx, stop0, 70)) &&
    near(bottomPx, expectedMid, 70) &&
    !near(bottomPx, plateFill, 12) &&
    near(cropLinePx, plateFill, 12) // the crop closure is NOT stroked (round 8)
  // The over-photo pixel: gradient-colored, and NOT the monogram tile / a
  // photo pixel (any sampled photo pixel would differ from the gradient —
  // both facts together prove the border covers the photo's top edge).
  const borderOverPhoto = near(overPhotoPx, expectedMid, 70) && !near(overPhotoPx, plateFill, 12)

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
  // (labels ≈1141.3 / points ≈1261.7 / values ≈1317.8 — round-8 geometry,
  // all centered on the column centers; the label row sits ABOVE the rating
  // row per the owner's re-seed).
  let statText = 0
  for (let y = 1080; y < 1345; y += 4) {
    for (let x = 100; x < 990; x += 5) {
      if (near(px(x, y), palette.textFill, 60)) statText++
    }
  }

  // Bebas estimate guard (round 7): the conservative 0.5em/char estimate
  // must NEVER under-estimate the real Bebas advances (measureText truth —
  // if a real advance exceeds the estimate, widen the estimate constant).
  const bebasSamples: Array<[string, number]> = [
    ['PDMG.R', 48],
    ['PVP.R', 48],
    ['MATK', 48],
    ['99', 128],
    ['10800', 48],
  ]
  const bebasReal = bebasSamples.map(([text, size]) => {
    ctx.font = `400 ${size}px "Bebas Neue"`
    const real = ctx.measureText(text).width
    const est = estimateBebas(text, 400, size)
    return { text, size, real: Number(real.toFixed(2)), estimate: est, ok: est >= real }
  })

  // Export check: toBlob must succeed as PNG (same-origin discipline +
  // the round-7 format contract).
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))

  return {
    transparentOutside,
    platePainted,
    photo,
    borderGradient,
    borderOverPhoto,
    borderProbe: {
      left: toHex(leftPx),
      right: toHex(rightPx),
      bottom: toHex(bottomPx),
      cropLine: toHex(cropLinePx),
      overPhoto: toHex(overPhotoPx),
      expectL: stop0,
      expectR: stop1,
      expectMid: expectedMid,
      plate: plateFill,
    },
    ovrTextPixels: ovrText,
    nameTextPixels: nameText,
    statTextPixels: statText,
    pointsSizeRatio: plan.stats[0].pointsSize / CARD_DESIGN_WIDTH,
    bebasEstimateGuard: bebasReal,
    blobOk: blob !== null && blob.type === 'image/png' && blob.size > 20000,
  }
}

// ---------------------------------------------------------------------------
// FILE-VS-APP RENDER DIFF (round 8, the owner's fidelity demand: "the svg
// has a 3-layer background ... But the current design on the app looks like
// the border is in the crop, which would be incorrect" — and "read card.svg
// again ... read all layers carefully" → THE FILE IS THE SPEC, proven by a
// pixel diff, not guesses).
//
// The harness rasterizes the ACTUAL src/assets/card.svg in the browser with
// a tier palette + a test photo + the shared scrim injected into the file's
// OWN structure (plate → photo → border-over → texts, untouched), then
// rasterizes the app's two surfaces with the SAME inputs at the same size:
//   1. the on-page CardSvg component (mounted via React, serialized)
//   2. the canvas export (drawCard)
// and asserts pixel IDENTITY (per-channel tolerance + a small differing-
// pixel ratio) over everything the design governs. TEXT + the Hellz mark
// regions are MASKED: the file's placeholder strings are rasterized with
// the <img> fallback font (SVG-in-img cannot load webfonts) while the app
// fits real loaded fonts — typography is the round-6 audit's job (real
// metric slot bounds), LAYER GEOMETRY is this diff's job. A wrong border
// path (crop instead of plate), a wrong clip, a wrong paint order, a stale
// stroke width, or a full-canvas background would light up thousands of
// unmasked pixels.
// ---------------------------------------------------------------------------

interface MaskRect { x: number; y: number; w: number; h: number }

/** Deterministic test photo (data URL — same-origin-safe inside SVG-in-img,
 *  where external URLs never load): a SMOOTH low-frequency gradient — both
 *  resampling kernels (canvas high-quality vs SVG image) agree on smooth
 *  gradients to within the tolerance, so the diff measures GEOMETRY (clip,
 *  cover-fit bounds, layer order), not browser-internal filtering. Far from
 *  every palette fill/border color. */
function makeTestPhoto(): string {
  const c = document.createElement('canvas')
  c.width = 480
  c.height = 360
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 480, 360)
  g.addColorStop(0, '#2255aa')
  g.addColorStop(0.55, '#7a4477')
  g.addColorStop(1, '#dd8822')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 480, 360)
  return c.toDataURL('image/png')
}

// TEXT STRIPPING: Chrome's SVG-as-image mode refuses fonts entirely (even
// data-URI @font-face) — every <text> rasterizes in an unpredictable
// fallback whose ink no mask can chase. The render-diff's contract is the
// owner's complaint domain — the THREE-LAYER BACKGROUND (plate / photo /
// border) — so both SVG renders are compared with all <text> elements
// stripped (text geometry is guarded by the round-6 real-metric audit and
// the parser locks; a missing/extra slot fails those loudly). The canvas
// export keeps its text (document context = REAL fonts) under the text
// masks below.
function stripText(svg: string): string {
  return svg.replace(/<text\b[^>]*>[\s\S]*?<\/text>/g, '')
}

/** The card.svg SPEC, rendered with injected tier palette + photo/scrim (or
 *  the monogram tile+letter) — everything else is the file VERBATIM: same
 *  style block structure, same layer order (plate → photo → border-over →
 *  texts), same paths, same stroke width, same clip. */
function referenceCardSvg(
  palette: TierPalette,
  plan: CardPlan,
  photo: { kind: 'image'; dataUrl: string } | { kind: 'monogram'; letter: string },
): string {
  let svg = cardRaw
  // Tier palette → the file's placeholder colors. ORDER MATTERS: the text
  // fill goes first (cls-4..8 #e6e6e6), THEN the plate (#cf1a87) — silver's
  // plateFill IS #e6e6e6 and would otherwise be recolored by the text pass.
  svg = svg.replaceAll('fill:#e6e6e6', `fill:${palette.textFill}`)
  svg = svg.replace('.cls-1{fill:#cf1a87}', `.cls-1{fill:${palette.plateFill}}`)
  // Border stops: REBUILD the whole stop list from the palette — tiers no
  // longer share the file's stop count (platinum now mirrors the UI's
  // five-stop Impecável rainbow).
  const gradStops = palette.borderStops
    .map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`)
    .join('')
  svg = svg.replace(
    /(<linearGradient\b[^>]*id="Blue_to_Magenta"[^>]*>)[\s\S]*?(<\/linearGradient>)/,
    `$1${gradStops}$2`,
  )
  // Extra defs: the photo clip (the crop path — the file has no image clip
  // of its own) + the shared scrim gradient.
  const defs =
    `<clipPath id="rf-photo-clip"><path d="${plan.card.cropPath}"/></clipPath>` +
    `<linearGradient id="rf-scrim" gradientUnits="userSpaceOnUse" x1="0" y1="${plan.scrim.y1}" x2="0" y2="${plan.scrim.y2}">` +
    `<stop offset="0" stop-color="#000000" stop-opacity="${plan.scrim.alpha}"/>` +
    `<stop offset="1" stop-color="#000000" stop-opacity="0"/></linearGradient>`
  svg = svg.replace('</defs>', `${defs}</defs>`)
  // The photo layer: clipped to the crop path, painted right after the
  // base-plate (BEFORE border-over — the file's three-layer order), scrim
  // inside the same clip. The crop area stays BORDERLESS (cls-2 fill:none
  // is the file's own word).
  const b = plan.photoBBox
  const inner =
    photo.kind === 'image'
      ? `<image href="${photo.dataUrl}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" preserveAspectRatio="xMidYMid slice"/>`
      : `<path d="${plan.card.cropPath}" fill="${plan.colors.monogramTile}"/>` +
        `<text x="${b.x + b.w / 2}" y="${b.y + b.h * 0.45}" text-anchor="middle" dominant-baseline="central" ` +
        `font-family="Orbitron, sans-serif" font-weight="700" font-size="${b.h * 0.2}" fill="${plan.colors.monogramText}">${photo.letter}</text>`
  const photoLayer = `<g clip-path="url(#rf-photo-clip)">${inner}` +
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${plan.scrim.y2 - plan.scrim.y1}" fill="url(#rf-scrim)"/></g>`
  const plateEnd = svg.search(/<path id="base-plate"[^>]*\/>/)
  if (plateEnd < 0) throw new Error('render-diff: base-plate path not found in card.svg')
  const insertAt = svg.indexOf('/>', plateEnd) + 2
  svg = svg.slice(0, insertAt) + photoLayer + svg.slice(insertAt)
  return svg
}

/** Rasterize an SVG string at exactly w×h through the browser's own SVG
 *  engine (Blob → Image → canvas → ImageData). */
async function rasterizeSvg(svgString: string, w: number, h: number): Promise<ImageData> {
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('render-diff: SVG rasterization failed'))
      img.src = url
    })
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Per-pixel diff OUTSIDE the masked regions: returns the differing-pixel
 *  ratio (per-channel + alpha tolerance) + the diffs' bounding box (the
 *  diagnosis hook — a structural divergence lights up a solid region). */
function diffImageData(
  a: ImageData,
  b: ImageData,
  masks: MaskRect[],
  tol: number,
): { ratio: number; bbox: MaskRect | null } {
  if (a.width !== b.width || a.height !== b.height) return { ratio: 1, bbox: { x: 0, y: 0, w: a.width, h: a.height } }
  const masked = (x: number, y: number): boolean =>
    masks.some((m) => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h)
  let diff = 0
  let total = 0
  let minX = a.width
  let minY = a.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if (masked(x, y)) continue
      total++
      const i = (y * a.width + x) * 4
      if (
        Math.abs(a.data[i] - b.data[i]) > tol ||
        Math.abs(a.data[i + 1] - b.data[i + 1]) > tol ||
        Math.abs(a.data[i + 2] - b.data[i + 2]) > tol ||
        Math.abs(a.data[i + 3] - b.data[i + 3]) > tol
      ) {
        diff++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return {
    ratio: total === 0 ? 1 : diff / total,
    bbox: maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  }
}

/** Text/mark mask boxes in DESIGN space (1080×1600): every slot the app
 *  fills with fitted real-font type (the file renders placeholders in the
 *  img fallback font) + the Hellz mark (app-only brand anchor) + the
 *  monogram letter (fallback-font mismatch). Generous but nowhere near the
 *  border band or the plate edges. */
function textMasks(plan: CardPlan, monogram: boolean): MaskRect[] {
  const masks: MaskRect[] = [
    // OVR number + job name (left-anchored, over the photo; canvas adds a
    // text shadow → generous box).
    { x: plan.ovr.x - 40, y: plan.ovr.y - plan.ovr.size - 40, w: 520, h: plan.ovr.size + 80 },
    { x: plan.ovr.jobX - 40, y: plan.ovr.jobY - plan.ovr.jobSize - 20, w: 520, h: plan.ovr.jobSize + 60 },
    // Player name (plate-centered baseline).
    { x: 140, y: plan.name.y - 100, w: 800, h: 130 },
    // Hellz mark (canvas-only paint, centered at (540, 1408) size 54).
    { x: 495, y: 1363, w: 90, h: 90 },
  ]
  for (const cell of plan.stats) {
    // One box per column covering label (y≈1141) / points (y≈1261, 148px) /
    // value (y≈1317) inks.
    masks.push({ x: cell.centerX - 90, y: cell.labelY - 70, w: 180, h: cell.valueY - cell.labelY + 95 })
  }
  if (monogram) {
    const b = plan.photoBBox
    masks.push({ x: b.x + b.w / 2 - 130, y: b.y + b.h * 0.45 - 90, w: 260, h: 180 })
  }
  return masks
}

const scaleMasks = (masks: MaskRect[], s: number): MaskRect[] =>
  masks.map((m) => ({ x: m.x * s, y: m.y * s, w: m.w * s, h: m.h * s }))

/** Serialize the MOUNTED app CardSvg (React → DOM → standalone SVG string
 *  with the required xmlns). */
async function mountedCardSvgString(data: CardExportData): Promise<string> {
  const host = document.createElement('div')
  host.style.width = '1080px'
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(createElement(CardSvg, { data }))
  await new Promise<void>((resolve) => setTimeout(resolve, 150))
  const svg = host.querySelector('svg')
  if (!svg) {
    root.unmount()
    host.remove()
    throw new Error('render-diff: CardSvg did not mount')
  }
  let str = new XMLSerializer().serializeToString(svg)
  if (!str.includes('xmlns=')) {
    str = str.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  root.unmount()
  host.remove()
  return str
}

async function diffFileVsApp(): Promise<Record<string, unknown>> {
  await Promise.all([
    document.fonts.load('400 48px Bebas Neue'),
    document.fonts.load('400 148px Bebas Neue'),
    document.fonts.load('700 48px Orbitron'),
  ])
  await document.fonts.ready
  const photoDataUrl = makeTestPhoto()
  const out: Record<string, unknown> = {}
  // The app data = the FILE's own placeholders (visual column order by the
  // rating anchors: MATK / MDMG.R alternating) — slot parity between the
  // file and the app composition.
  const data: CardExportData = {
    name: 'PLAYERNAME',
    charClass: 'JOB CLASS',
    charFunction: 'dps',
    ovr: 99,
    stats: [
      { label_short: 'MATK', value: '10000', points: 99 },
      { label_short: 'MDMG.R', value: '208.77', points: 99 },
      { label_short: 'MATK', value: '10000', points: 99 },
      { label_short: 'MDMG.R', value: '208.77', points: 99 },
      { label_short: 'MATK', value: '10000', points: 99 },
      { label_short: 'MDMG.R', value: '208.77', points: 99 },
    ],
    photoSrc: photoDataUrl,
    monogramLetter: 'A',
  }
  for (const c of CASES) {
    const caseData: CardExportData = { ...data, ovr: c.ovr }
    // The photo case uses the test-photo data URL for BOTH the reference and
    // the app (identical inputs); the monogram case (photo null in CASES)
    // compares the tile fallback (letters stripped with all text).
    const monogram = c.photo === null
    const plan = buildCardPlan(caseData, CARD_DESIGN_WIDTH)
    const palette = TIER_PALETTE[plan.tier]

    // 1. On-page CardSvg vs the file — TEXT-STRIPPED, NO masks: the ENTIRE
    // three-layer background (plate / photo / border-over) compares
    // pixel-for-pixel at the file's own 1080×1600 design space.
    const appSvgData: CardExportData = { ...caseData, photoSrc: monogram ? null : photoDataUrl }
    const appSvg = await rasterizeSvg(
      stripText(await mountedCardSvgString(appSvgData)),
      CARD_DESIGN_WIDTH,
      CARD_DESIGN_HEIGHT,
    )
    const refImg = await rasterizeSvg(
      stripText(
        referenceCardSvg(
          palette,
          plan,
          monogram ? { kind: 'monogram', letter: 'A' } : { kind: 'image', dataUrl: photoDataUrl },
        ),
      ),
      CARD_DESIGN_WIDTH,
      CARD_DESIGN_HEIGHT,
    )
    const svgDiff = diffImageData(refImg, appSvg, [], 16)

    // 2. Canvas export (drawCard) vs the file — the canvas paints REAL
    // fonts (document context), so text rides under the text masks; the
    // background compares unmasked. Same inputs, 1080×1600 backing store
    // (27:40 aspect gate satisfied).
    const canvas = document.createElement('canvas')
    canvas.width = CARD_DESIGN_WIDTH
    canvas.height = CARD_DESIGN_HEIGHT
    await drawCard(canvas, appSvgData)
    const canvasData = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const canvasDiff = diffImageData(refImg, canvasData, textMasks(plan, monogram), 16)

    out[c.tier] = {
      svgDiffRatio: Number(svgDiff.ratio.toFixed(5)),
      svgDiffOk: svgDiff.ratio <= 0.002,
      svgDiffBBox: svgDiff.bbox,
      canvasDiffRatio: Number(canvasDiff.ratio.toFixed(5)),
      canvasDiffOk: canvasDiff.ratio <= 0.008,
      canvasDiffBBox: canvasDiff.bbox,
    }
    void fetch(`/__progress?diff=${c.tier}`, { method: 'POST', body: 'ok' }).catch(() => {})
  }
  return out
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
//  - central alignment (round 7): every stat column's three lines render
//    CENTERED on the column center (bbox center ≈ centerX, ±6px).
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
  /** Non-null = LEFT-anchored slot (OVR number / job): glyphs start at x
   *  and end ≤ x + maxW. null = CENTERED slot (name, round-7 stat columns):
   *  the glyph box is centered on the column center with plate containment
   *  instead of a left anchor. */
  x: number | null
  /** For centered stat slots: the column center the glyph box must be
   *  centered on (round 7 central alignment — the owner's rule). */
  centerX?: number
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
      { text: c.label, maxW: c.labelMaxW, x: null, centerX: c.centerX },
      { text: c.points, maxW: c.pointsMaxW, x: null, centerX: c.centerX },
      { text: c.value, maxW: c.valueMaxW, x: null, centerX: c.centerX },
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
        // Centered slot (name / round-7 stat columns): glyphs must stay in
        // the silhouette's inner span (plate interior 60..1020), and — for
        // the stat columns — the box must be CENTERED on the column center.
        if (bb.x < 60 || bb.x + bb.width > 1020) {
          violations.push(`slot ${i} "${exp.text}" bbox ${bb.x.toFixed(1)}..${(bb.x + bb.width).toFixed(1)} leaves the plate span 60..1020`)
        }
        if (exp.centerX !== undefined) {
          const center = bb.x + bb.width / 2
          if (Math.abs(center - exp.centerX) > 6) {
            violations.push(
              `slot ${i} "${exp.text}" centered at ${center.toFixed(1)} ≠ column center ${exp.centerX.toFixed(1)}`,
            )
          }
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
    document.fonts.load('400 48px Bebas Neue'),
    document.fonts.load('400 128px Bebas Neue'),
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
    // Fonts: Orbitron AND Bebas Neue must ACTUALLY be loaded (no serif
    // fallback in the glyph probes above).
    const fontsLoaded =
      document.fonts.check('900 100px Orbitron') &&
      document.fonts.check('700 100px Orbitron') &&
      document.fonts.check('600 100px Orbitron') &&
      document.fonts.check('400 128px Bebas Neue')
    // The on-page SVG surface: real-metric slot-fit + scale-tracking audit.
    try {
      results.onPage = await auditOnPage()
    } catch (err) {
      results.onPage = { fatal: err instanceof Error ? err.message : String(err) }
    }
    // The FILE-VS-APP render diff (round 8): the app's two surfaces against
    // the owner's actual card.svg, pixel-identical outside the masked text/
    // mark regions — the permanent anti-drift guard.
    try {
      results.renderDiff = await diffFileVsApp()
    } catch (err) {
      results.renderDiff = { fatal: err instanceof Error ? err.message : String(err) }
    }
    // Static design facts ride along (they pin the design-source wiring).
    results.meta = {
      designSize: `${CARD_DESIGN_WIDTH}x${CARD_DESIGN_HEIGHT}`,
      sourceFile: 'src/assets/card.svg (single source of truth, round 8 — plate-silhouette border 48, semantic KEY slots, label-above-rating, transparent PNG)',
      slotCount: CARD_GEOMETRY.slots.stats.length,
      ovrEffectiveSize: CARD_GEOMETRY.slots.ovr.size,
      plateFillsDistinct: new Set(Object.values(TIER_PALETTE).map((p) => p.plateFill)).size === 4,
      borderWidthAllTiers: CARD_GEOMETRY.borderStroke.width === 48,
      borderStrokesPlate: CARD_GEOMETRY.borderStroke.strokePath === CARD_GEOMETRY.platePath,
      borderClippedToPlate: CARD_GEOMETRY.borderStroke.clipPath === CARD_GEOMETRY.platePath,
      labelAboveRating: CARD_GEOMETRY.slots.stats.every((s) => s.label.y < s.points.y && s.points.y < s.value.y),
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
