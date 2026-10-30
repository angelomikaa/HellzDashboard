// ClassCrest — the D-16/D-17 class-imagery component (plan 07.2-05, ASST-01).
// Renders the self-hosted class icon (public/assets/classes/class-icon-<slug>.webp,
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
// 2026-10-23 ROOCDB swap (owner decision): icons are the per-job Trans-2ª
// game emblems (one per class — Rebellion included; previously the 7 shared
// base-role icons), and portraitSrcFor exposes the per-job full-body class
// art as the card photo placeholder (previously the three card surfaces
// had to reuse the small icon via crestSrcFor).
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
  placeholder_gender?: 'male' | 'female'
  files: Record<string, RooFileSource>
}

// The JSON import's inferred type is a per-entry literal union (keys differ
// across entries) — widen it to the manifest contract via unknown.
const CLASSES = manifest.classes as unknown as RooClassEntry[]

/** Same slug rule the fetcher/manifest use: lowercase, spaces -> hyphens. */
export function classSlug(charClass: string): string {
  return charClass.toLowerCase().replace(/ /g, '-')
}

function hasSource(file: RooFileSource | undefined): boolean {
  return file !== undefined && (typeof file.url === 'string' || typeof file.local === 'string')
}

/** class → '/assets/classes/class-icon-<slug>.webp' for every class whose
 *  manifest icon entry carries a source (url or local). A file that the
 *  fetcher could not place (D-16 designed-missing) has no source and gets NO
 *  entry here — those classes go straight to the monogram. */
const ICON_SRC: ReadonlyMap<string, string> = new Map(
  CLASSES.flatMap((entry) => {
    const file = entry.files[`class-icon-${entry.slug}.webp`]
    return hasSource(file)
      ? [[entry.class_name, `/assets/classes/class-icon-${entry.slug}.webp`] as const]
      : []
  }),
)

/** Same-origin icon URL for a class, resolved by the SAME manifest lookup
 *  ClassCrest renders with (null → no icon; callers draw their monogram). The
 *  lineup JPG export reads this so its canvas uses exactly the asset the grid
 *  shows. Never returns an http(s) URL (T-072-13). */
export function iconSrcFor(charClass: string | null): string | null {
  if (charClass === null) return null
  return ICON_SRC.get(charClass) ?? null
}

/** The card photo placeholder (2026-10-23 owner decision): the per-job
 *  full-body class art, gender picked by the manifest's placeholder_gender
 *  (female for every dual-gender class; Bard=male Menestrel art,
 *  Gypsy=female Cigana art — the jobs themselves are gender-locked).
 *  Same manifest-driven existence rule as ICON_SRC; null → the card falls
 *  back to its own ASST-01 monogram tile (never the small icon, which would
 *  look broken stretched over the photo area). */
const PORTRAIT_SRC: ReadonlyMap<string, string> = new Map(
  CLASSES.flatMap((entry) => {
    if (entry.placeholder_gender === undefined) return []
    const fileName = `class-${entry.placeholder_gender === 'male' ? 'm' : 'f'}-${entry.slug}.webp`
    return hasSource(entry.files[fileName])
      ? [[entry.class_name, `/assets/classes/${fileName}`] as const]
      : []
  }),
)

/** Same-origin portrait URL for the card photo area (PromotionCard / Painel
 *  own-card / CardPhotoUpload preview), resolved by the SAME manifest lookup
 *  ClassCrest uses — null means the export draws the D-16 monogram tile
 *  instead. Never returns an http(s) URL (T-072-13). */
export function portraitSrcFor(charClass: string): string | null {
  return PORTRAIT_SRC.get(charClass) ?? null
}

const TILE_SIZES = {
  sm: 'h-8 w-8 rounded-md text-sm',
  md: 'h-12 w-12 rounded-lg text-lg',
} as const

const IMG_SIZES = {
  sm: 'h-8 w-8 rounded-md',
  md: 'h-12 w-12 rounded-lg',
} as const

// 07.2-06 (D-17 staff surfaces): staff rows carry `char_class: string | null`
// (a member can be whitelisted before a character exists) — null renders the
// neutral monogram tile with an em-dash, never a broken image.
export function ClassCrest({
  charClass,
  size = 'md',
}: {
  charClass: string | null
  size?: 'sm' | 'md'
}) {
  const [failed, setFailed] = useState(false)
  // A card/row can be reused for a different class (list recycling) — reset
  // the belt-and-braces error flag whenever the class changes.
  useEffect(() => setFailed(false), [charClass])

  const iconSrc = charClass === null ? undefined : ICON_SRC.get(charClass)
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
      {charClass === null ? '—' : charClass.charAt(0).toUpperCase()}
    </div>
  )
}
