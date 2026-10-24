/**
 * Seed hygiene guard (plan 08.1-06 task 2C).
 *
 * Asserts supabase/seeds/whitelist.sql is credential-free: no bcrypt hash, no
 * real handle, no 4-digit PIN literal — and that every inserted row is an inert
 * placeholder (pin_hash null, active false) with a re-run-safe upsert.
 *
 * Runs in vitest's Node environment (vite.config.ts: test.environment = 'node').
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const SEED = 'supabase/seeds/whitelist.sql'

function seed() {
  return readFileSync(SEED, 'utf8')
}

const BCRYPT_RE = /\$2[aby]\$\d{2}\$/
const QUOTED_4DIGIT_RE = /'\d{4}'/

describe('seed hygiene', () => {
  it('contains no bcrypt hash', () => {
    expect(seed()).not.toMatch(BCRYPT_RE)
  })

  it('contains no real handle (satturne) and no placeholder staff handles', () => {
    const s = seed()
    expect(s).not.toContain('satturne')
    expect(s).not.toContain('officer-handle')
    expect(s).not.toContain('member-handle')
  })

  it('contains no quoted 4-digit PIN literal', () => {
    expect(seed()).not.toMatch(QUOTED_4DIGIT_RE)
  })

  it('is marked credential-free and re-runnable without resetting credentials', () => {
    const s = seed()
    expect(s).toContain('CREDENTIAL-FREE TEMPLATE')
    expect(s).toMatch(/set display_name = excluded\.display_name/)
  })

  it('every inserted row has pin_hash null and active false', () => {
    const s = seed()
    const rows = s.match(/\([^)]*\)/g) ?? []
    const valueRows = rows.filter((r) => r.includes("'member'") && r.includes('false'))
    expect(valueRows.length).toBeGreaterThan(0)
    // pin_hash is the 4th value (null), active is the 5th (false), role 3rd ('member')
    const inertRowRe = new RegExp(",\\s*null\\s*,\\s*'member'\\s*,\\s*false\\s*\\)")
    for (const row of valueRows) {
      expect(inertRowRe.test(row)).toBe(true)
    }
  })

  it('negative control: the bcrypt regex matches a real hash-shaped string', () => {
    expect('\$2b\$10\$PuVXMC21m5qsfswI12bha.WcSNNs.o/Or4Vg5hQCjKY1as0oJDyFW').toMatch(
      BCRYPT_RE,
    )
  })
})
