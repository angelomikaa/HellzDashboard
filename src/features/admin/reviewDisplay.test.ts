import { describe, expect, it } from 'vitest'
import type { AntiCheatReview } from '../../lib/api'
import { REVIEW_DISPLAY, coverageNote, reviewDisplay } from './reviewDisplay'

describe('reviewDisplay', () => {
  it('maps the three categories to the owner copy', () => {
    expect(REVIEW_DISPLAY.consistent.label).toBe('Consistente')
    expect(REVIEW_DISPLAY.inconclusive.label).toBe('Inconclusivo')
    expect(REVIEW_DISPLAY.buffed.label).toBe('Buffado')
  })

  it('uses green, yellow and orange tokens', () => {
    expect(REVIEW_DISPLAY.consistent.chip).toContain('text-success')
    expect(REVIEW_DISPLAY.inconclusive.chip).toContain('text-tier-gold')
    expect(REVIEW_DISPLAY.buffed.chip).toContain('text-error')
  })

  it('returns null for an absent or unknown category', () => {
    expect(reviewDisplay(undefined)).toBeNull()
    expect(reviewDisplay(null)).toBeNull()
    expect(reviewDisplay('nope' as never)).toBeNull()
  })
})

describe('coverageNote', () => {
  const base: AntiCheatReview = {
    category: 'inconclusive',
    cohort_available: false,
    history_available: false,
    history_sample_size: 0,
    reasons: [],
  }

  it('says there is no statistical baseline instead of implying a clean check', () => {
    const note = coverageNote(base, 4)
    expect(note).toContain('Sem base estatística')
    expect(note).toContain('n = 4')
    expect(note).toContain('sem histórico validado')
    expect(note).toContain('não por ausência de anomalia')
  })

  it('uses < 5 when the cohort sample is unknown', () => {
    expect(coverageNote(base, null)).toContain('n < 5')
  })

  it('names the history when it is the only reference', () => {
    const note = coverageNote(
      { ...base, history_available: true, history_sample_size: 3 },
      4,
    )
    expect(note).toContain('Referências:')
    expect(note).toContain('curva da coorte indisponível (n = 4)')
    expect(note).toContain('histórico do jogador (3 envios)')
  })

  it('names the missing history when the cohort is available', () => {
    const note = coverageNote({ ...base, cohort_available: true }, null)
    expect(note).toContain('Referências: curva da coorte')
    expect(note).toContain('sem histórico validado do jogador')
  })

  it('uses the singular for one prior submission', () => {
    const note = coverageNote(
      { ...base, cohort_available: true, history_available: true, history_sample_size: 1 },
      null,
    )
    expect(note).toContain('histórico do jogador (1 envio)')
  })
})
