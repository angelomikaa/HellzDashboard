// Render-layer TIER DISPLAY maps (owner decision at the 07.1-02 visual gate):
// the top band — internally still 'platinum' in presentation.ts — is DISPLAYED
// as "Impecável" with a premium static rainbow treatment, unmistakably
// distinct from silver/gold/bronze (D-02 revision).
//
// presentation.ts (band logic + literal class maps) is deliberately UNTOUCHED
// (VIS-07 zero-behavior-change; presentation.test.ts stays green untouched) —
// this module only overrides what the render layer shows. Bands (35/60/85
// points, 65/75/85 OVR) are unchanged: only the top band's name + colors.
// All strings are literal class names (Tailwind v4 JIT requirement).
import { TIER_BG, TIER_BORDER, TIER_TEXT, type Tier } from './presentation'

export const TIER_DISPLAY_LABELS: Record<Tier, string> = {
  bronze: 'Bronze',
  silver: 'Prata',
  gold: 'Ouro',
  platinum: 'Impecável',
}

/** Card/badge borders — top tier gets the rainbow gradient border. */
export const TIER_BORDER_DISPLAY: Record<Tier, string> = {
  ...TIER_BORDER,
  platinum: 'tier-impecavel-border',
}

/** Hero-number text WITH its static glow baked in: metallic tiers glow in
 *  their own color via glow-text-current; Impecável glows white-rainbow via
 *  its self-contained utility (never stacked with glow-text-current). */
export const TIER_TEXT_GLOW: Record<Tier, string> = {
  bronze: `glow-text-current ${TIER_TEXT.bronze}`,
  silver: `glow-text-current ${TIER_TEXT.silver}`,
  gold: `glow-text-current ${TIER_TEXT.gold}`,
  platinum: 'tier-impecavel-text',
}

/** Small-text display (badges, focus strip): color only — no glow on small
 *  sizes. Impecável renders white (16.7:1 on surface, AAA). */
export const TIER_TEXT_DISPLAY: Record<Tier, string> = {
  ...TIER_TEXT,
  platinum: 'text-white',
}

/** Legend dot fills — top tier gets the rainbow gradient dot. */
export const TIER_DOT_DISPLAY: Record<Tier, string> = {
  ...TIER_BG,
  platinum: 'tier-impecavel-dot',
}

// 07.2 D-06: relevant-tier chip vocabulary — a SEPARATE concern from the
// Tier union above (relevant is NEVER a card tier; RELV-01: the relevant
// marking lives on the Stats-Chave governance surface and guides the foco
// strip — it never appears on member cards). Literal strings only
// (Tailwind v4 JIT); the token names match the @theme additions in
// src/index.css so the classes generate.
/** Relevant chip: the YELLOW marking (D-06 — deliberate exception to the
 *  07.1 D-01 single-accent rule; dedicated --color-relevant family, never
 *  the retired #E3B341 UI accent). */
export const RELEVANT_CHIP = 'border-relevant text-relevant-bright'
/** Key chip: the accent-RED marking (D-06 — key = red on Stats-Chave). */
export const KEY_CHIP = 'border-accent text-accent-bright'
