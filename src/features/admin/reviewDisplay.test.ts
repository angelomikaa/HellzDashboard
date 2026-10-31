import { describe, expect, it } from 'vitest'
import { REVIEW_DISPLAY, reviewDisplay } from './reviewDisplay'

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
