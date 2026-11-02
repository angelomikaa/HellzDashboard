// lineup-render-check — renders the REAL Escalação JPG pipeline headlessly and
// posts the PNG back to the collector, so the visual result can be inspected
// and diffed instead of guessed at. Uses the same buildLineupExportPlan +
// renderLineupCanvas the app downloads with.
import type { BattlefieldLineup, LineupParty, LineupRosterMember } from '../../src/lib/api'
import { buildLineupExportPlan, renderLineupCanvas } from '../../src/features/lineup/lineupExport'

const CLASSES = [
  'High Priest',
  'Bard',
  'Gypsy',
  'Biochemist',
  'Mastersmith',
  'Summoner',
  'High Wizard',
  'Professor',
  'Sniper',
  'Rebellion',
  'Paladin',
  'Lord Knight',
  'Assassin Cross',
  'Stalker',
  'Champion',
]

const NAMES = [
  'SoldierHellzOGrande',
  'Tifa',
  'SoldierHellz',
  'Caladoh',
  'Aryah',
  'Kiom',
  'Same',
  'Helz2010',
  'XAVENTAL',
  'Satturne',
  'Ahrya',
  'Vexna',
  'Ryuji',
  'Nyx',
  'Bruna',
  'Kael',
  'Miko',
  'Zephyr',
  'Isis',
  'Draco',
]

function buildLineup(): BattlefieldLineup {
  let seat = 0
  const parties: LineupParty[] = Array.from({ length: 8 }, (_, p) => {
    const partyIndex = p + 1
    const slots = Array.from({ length: 5 }, (_, s) => {
      const slotIndex = s + 1
      // Party 3 stays empty so both slot states are visible in the render.
      if (partyIndex === 3) {
        return {
          slot_index: slotIndex,
          member_id: null,
          display_name: null,
          char_class: null,
          char_function: null,
        }
      }
      const charClass = CLASSES[seat % CLASSES.length]
      const name = NAMES[seat % NAMES.length]
      seat += 1
      return {
        slot_index: slotIndex,
        member_id: `m-${partyIndex}-${slotIndex}`,
        display_name: name,
        char_class: charClass,
        char_function: 'dps' as const,
      }
    })
    return {
      party_index: partyIndex,
      role_label: p === 0 ? 'MOBS CIMA/BAIXO' : p === 1 ? 'MOBS DIREITA/ESQUERDA' : null,
      filled: slots.filter((s) => s.member_id !== null).length,
      slots,
    }
  })
  return { battlefield: 'vigrid_field', raid_index: 1, parties }
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function pixelAt(ctx: CanvasRenderingContext2D, x: number, y: number): [number, number, number] {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data
  return [d[0], d[1], d[2]]
}

/** Channel-wise distance, so "is this the accent colour?" is one comparison. */
function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

async function run() {
  const results = document.getElementById('results') as HTMLPreElement
  try {
    const lineup = buildLineup()
    const plan = buildLineupExportPlan(lineup)
    const canvas = document.createElement('canvas')
    canvas.width = plan.width
    canvas.height = plan.height
    await renderLineupCanvas(canvas, plan)
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('no 2d context')

    // --- Regression probes: the JPG must keep the WEB card's visual language.
    const probes: Record<string, boolean> = {}
    const detail: Record<string, unknown> = {}

    // G1 slot 1 is a seated leader; G3 is the empty party.
    const seated = plan.columns[0].slots[0]
    const vacant = plan.columns[2].slots[0]
    const accentRgb = hexToRgb(seated.accent)

    // 1. Class bar: the left edge of a seated card is the class accent.
    const barPx = pixelAt(ctx, seated.rect.x + 2, seated.rect.y + seated.rect.h / 2)
    probes.classBar = distance(barPx, accentRgb) < 40

    // 2. Class fill: a seated card is tinted, the vacant card is the plain
    //    page colour — and the tint actually FOLLOWS the class accent (a gold
    //    card is warm, a purple card is cool; they can never render alike).
    //    Probed at the top-right corner, which no name/class glyph occupies.
    const farOf = (slot: { rect: { x: number; y: number; w: number; h: number } }) =>
      pixelAt(ctx, slot.rect.x + Math.round(slot.rect.w * 0.5), slot.rect.y + 6)
    const goldSlot = plan.columns[0].slots[2] // Cigana — gold accent (not leader)
    const purpleSlot = plan.columns[3].slots[2] // Algoz — purple accent (not leader)
    const goldFar = farOf(goldSlot)
    const purpleFar = farOf(purpleSlot)
    const vacantFar = farOf(vacant)
    probes.classFill =
      distance(goldFar, vacantFar) > 20 &&
      distance(goldFar, purpleFar) > 10 &&
      goldFar[0] > goldFar[2] &&
      purpleFar[2] > purpleFar[0]
    detail.pixels = { goldFar, purpleFar, vacantFar }

    // 3. Rounded corners: the slot corner shows the party card, not the slot.
    const cornerPx = pixelAt(ctx, seated.rect.x + 1, seated.rect.y + 1)
    const cardPx = pixelAt(ctx, seated.rect.x + seated.rect.w / 2, seated.rect.y - 6)
    probes.roundedSlot = distance(cornerPx, [30, 30, 30]) < 26 && distance(cornerPx, cardPx) < 26

    // 4. Leader chip: amber pixels exist in the top-right corner region.
    let amber = false
    for (let x = seated.rect.x + seated.rect.w - 130; x < seated.rect.x + seated.rect.w - 12; x += 3) {
      for (let y = seated.rect.y + 8; y < seated.rect.y + 32; y += 3) {
        if (distance(pixelAt(ctx, x, y), hexToRgb('#E9B44C')) < 30) amber = true
      }
    }
    probes.leaderChip = amber

    // 5. Vacant slot is dashed, not filled: its interior stays the page colour.
    const vacantMid = pixelAt(ctx, vacant.rect.x + vacant.rect.w / 2, vacant.rect.y + 4)
    probes.vacantUnfilled = distance(vacantMid, [20, 20, 20]) < 14

    const dataUrl = canvas.toDataURL('image/png')
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    const failed = Object.entries(probes).filter(([, ok]) => !ok).map(([k]) => k)
    const summary = {
      ok: blob !== null && failed.length === 0,
      width: plan.width,
      height: plan.height,
      columns: plan.columns.length,
      slots: plan.columns.reduce((n, c) => n + c.slots.length, 0),
      probes,
      detail,
      failed,
    }
    results.textContent = JSON.stringify(summary, null, 2)
    // Post the summary BEFORE the (large) PNG: headless Edge can exit as soon
    // as the virtual-time budget ends, and a 1 MB upload can be cut off.
    await fetch('/__results', { method: 'POST', body: JSON.stringify(summary) })
    await fetch('/__png', { method: 'POST', body: dataUrl })
  } catch (err) {
    results.textContent = `ERROR: ${String(err)}`
    await fetch('/__results', { method: 'POST', body: JSON.stringify({ ok: false, error: String(err) }) })
  }
}

void run()
