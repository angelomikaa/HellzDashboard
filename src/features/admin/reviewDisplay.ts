// Three-state officer review display (Phase 10.8-04, 0054).
//
// ONE definition site for the green/yellow/orange semantics shared by the
// Validações row chip and the AntiCheatPanel. The SERVER decides the category;
// this module only maps it to pt-BR copy and Tailwind classes.
//
//   consistent   -> green  "Consistente"
//   inconclusive -> yellow "Inconclusivo"
//   buffed       -> orange "Buffado" (the project's error token is orange)
import type { AntiCheatReview, AntiCheatReviewCategory } from '../../lib/api'

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

/**
 * One line naming the references the server actually had when it classified a
 * pending row. Without this, "Inconclusivo" reads like a failed check instead
 * of what it is: no cohort curve (n<5) and/or no validated history to compare
 * against. `cohortSampleSize` comes from a curve deviation (same n used by the
 * server gate).
 */
export function coverageNote(review: AntiCheatReview, cohortSampleSize: number | null): string {
  const cohort = review.cohort_available
    ? 'curva da coorte'
    : `curva da coorte indisponível (n ${cohortSampleSize === null ? '< 5' : `= ${cohortSampleSize}`})`
  const history = review.history_available
    ? `histórico do jogador (${review.history_sample_size} ${
        review.history_sample_size === 1 ? 'envio' : 'envios'
      })`
    : 'sem histórico validado do jogador'

  if (!review.cohort_available && !review.history_available) {
    return `Sem base estatística: ${cohort} e ${history}. O veredito é inconclusivo por falta de referência — não por ausência de anomalia.`
  }
  return `Referências: ${cohort}; ${history}.`
}
