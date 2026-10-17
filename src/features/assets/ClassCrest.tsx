// ClassCrest — the D-16/D-17 class-imagery component (plan 07.2-05, ASST-01).
// Renders the self-hosted class icon (public/assets/classes/class-icon-<slug>.png,
// committed per D-15) when the manifest says it exists, ELSE the D-16 neutral
// fallback: a tasteful monogram tile (class initial, display font, surface
// styling, tier-neutral line border). NEVER a broken image:
//  1. a module-level lookup from the committed manifest decides img-vs-monogram
//     before any <img> is created (the fetcher records 404s as designed-missing
//     and this map mirrors it), and
//  2. an onError fallback is the belt-and-braces for the rare case where the
//     manifest was optimistic but the committed file is absent.
// Same-origin only (canvas-taint rule, T-072-13): the src is always a root-
// relative '/assets/classes/...' path — never an http(s) URL.
//
// Pure presentational + decorative (aria-hidden): every consumer already
// labels the surrounding content (section header text, card name, etc.).
import { useEffect, useState } from 'react'
import manifest from '../../assets/roo-manifest.json'

interface RooFileSource {
  url?: string
  local?: string
  expected_missing?: boolean
  reason?: string
}

interface RooClassEntry {
  class_name: string
  slug: string
  files: Record<string, RooFileSource>
}

// The JSON import's inferred type is a per-entry literal union (keys differ
// across entries) — widen it to the manifest contract via unknown.
const CLASSES = manifest.classes as unknown as RooClassEntry[]

/** Same slug rule the fetcher/manifest use: lowercase, spaces -> hyphens. */
export function classSlug(charClass: string): string {
  return charClass.toLowerCase().replace(/ /g, '-')
}

/** class → '/assets/classes/class-icon-<slug>.png' for every class whose
 *  manifest icon entry carries a source (url or local). A file that the
 *  fetcher could not place (D-16 designed-missing) has no source and gets NO
 *  entry here — those classes go straight to the monogram. */
const ICON_SRC: ReadonlyMap<string, string> = new Map(
  CLASSES.flatMap((entry) => {
    const file = entry.files[`class-icon-${entry.slug}.png`]
    const hasSource = file !== undefined && (typeof file.url === 'string' || typeof file.local === 'string')
    return hasSource
      ? [[entry.class_name, `/assets/classes/class-icon-${entry.slug}.png`] as const]
      : []
  }),
)

/** Same-origin crest URL for canvas export (cardExport crestSrc), resolved by
 *  the SAME manifest lookup ClassCrest renders — null means the export draws
 *  the D-16 monogram tile instead. Never returns an http(s) URL (T-072-13). */
export function crestSrcFor(charClass: string): string | null {
  return ICON_SRC.get(charClass) ?? null
}

const TILE_SIZES = {
  sm: 'h-8 w-8 rounded-md text-sm',
  md: 'h-12 w-12 rounded-lg text-lg',
} as const

const IMG_SIZES = {
  sm: 'h-8 w-8 rounded-md',
  md: 'h-12 w-12 rounded-lg',
} as const

export function ClassCrest({ charClass, size = 'md' }: { charClass: string; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false)
  // A card/row can be reused for a different class (list recycling) — reset
  // the belt-and-braces error flag whenever the class changes.
  useEffect(() => setFailed(false), [charClass])

  const iconSrc = ICON_SRC.get(charClass)
  if (iconSrc !== undefined && !failed) {
    return (
      <img
        src={iconSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
        onError={() => setFailed(true)}
        className={`border border-line bg-surface object-contain ${IMG_SIZES[size]}`}
      />
    )
  }

  // D-16 monogram fallback: tier-neutral surface tile, display-font initial.
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center border border-line bg-surface font-display font-semibold text-muted ${TILE_SIZES[size]}`}
    >
      {charClass.charAt(0).toUpperCase()}
    </div>
  )
}
