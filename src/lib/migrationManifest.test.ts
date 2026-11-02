// Offline locks for supabase/migrations/manifest.json.
//
// The manifest is the canonical apply order and the list of retired files. A
// new migration without a manifest entry (or a retired file back in the order)
// must fail CI before anyone runs a fresh apply or `supabase db push`.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const MANIFEST = 'supabase/migrations/manifest.json'
const DIR = 'supabase/migrations'
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
  apply_order: string[]
  retired: Record<string, string>
}
const disk = readdirSync(DIR).filter((name) => name.endsWith('.sql'))
const retired = Object.keys(manifest.retired)
const active = manifest.apply_order
const versionOf = (name: string) => name.slice(0, 4)

describe('migration manifest', () => {
  it('covers every file on disk exactly once', () => {
    const listed = [...active, ...retired]
    expect(listed.length).toBe(new Set(listed).size)
    expect(new Set(listed)).toEqual(new Set(disk))
  })

  it('never applies a retired migration', () => {
    for (const name of retired) expect(active).not.toContain(name)
  })

  it('is numeric and monotonic', () => {
    let previous = 0
    for (const name of active) {
      const version = Number.parseInt(versionOf(name), 10)
      expect(Number.isFinite(version), name).toBe(true)
      expect(version, name).toBeGreaterThanOrEqual(previous)
      previous = version
    }
  })

  it('retires the known stubs and superseded migrations', () => {
    expect(retired).toContain('0024_device_binding_enforcement.sql')
    expect(retired).toContain('0032_claim_authorization.sql')
    expect(retired).toContain('0033_one_go_registration.sql')
    expect(retired).toContain('0045_promotion_public_stat_gate.sql')
    // The real replacements must stay active.
    expect(active).toContain('0063_public_promotion_stat_gate.sql')
    expect(active).toContain('0064_staff_rpc_bodies_and_device_guard.sql')
  })

  it('keeps both active duplicate-prefix files pinned', () => {
    expect(active).toContain('0023_my_card_role_filter.sql')
    expect(active).toContain('0023_sentinel_identity_guard.sql')
    expect(active).toContain('0024_role_rank_role_filter.sql')
    expect(retired).toContain('0024_device_binding_enforcement.sql')
  })
})
