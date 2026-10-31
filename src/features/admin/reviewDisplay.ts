// Three-state officer review display (Phase 10.8-04, 0054).
//
// ONE definition site for the green/yellow/orange semantics shared by the
// Validações row chip and the AntiCheatPanel. The SERVER decides the category;
// this module only maps it to pt-BR copy and Tailwind classes.
//
//   consistent   -> green  "Consistente"
//   inconclusive -> yellow "Inconclusivo"
//   buffed       -> orange "Buffado" (the project's error token is orange)
import type { AntiCheatReviewCategory } from '../../lib/api'

export interface ReviewDisplay {
  label: string
  chip: string
  panel: string
  badge: string
  text: string
}

export const REVIEW_DISPLAY: Record<AntiCheatReviewCategory, ReviewDisplay> = {
  consistent: {
    label: 'Consistente',
    chip: 'border-success/50 bg-success/10 text-success',
    panel: 'border-success/40 bg-success/5',
    badge: 'border-success/50 bg-success/10 text-success',
    text: 'text-success',
  },
  inconclusive: {
    label: 'Inconclusivo',
    chip: 'border-tier-gold/60 bg-tier-gold/10 text-tier-gold',
    panel: 'border-tier-gold/50 bg-tier-gold/5',
    badge: 'border-tier-gold/60 bg-tier-gold/10 text-tier-gold',
    text: 'text-tier-gold',
  },
  buffed: {
    label: 'Buffado',
    chip: 'border-error/60 bg-error/10 text-error',
    panel: 'border-error/60 bg-error/10',
    badge: 'border-error/60 bg-error/10 text-error',
    text: 'text-error',
  },
}

export function reviewDisplay(
  category: AntiCheatReviewCategory | null | undefined,
): ReviewDisplay | null {
  if (category === null || category === undefined) return null
  return REVIEW_DISPLAY[category] ?? null
}
