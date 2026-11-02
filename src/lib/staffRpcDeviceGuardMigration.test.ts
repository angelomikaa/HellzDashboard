// Contract locks for migration 0064: the four staff RPCs must keep their REAL
// bodies with the 0024 device guard and a pinned search_path.
//
// Why: 0024 shipped stub bodies, so a repo replay turned the four RPCs into
// no-ops; live verification on 2026-11-02 also showed the guard had never been
// applied. The "latest definition wins" assertions below fail the day a future
// supersession reintroduces a stub or drops the guard.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const FILE = 'supabase/migrations/0064_staff_rpc_bodies_and_device_guard.sql'
const sql = readFileSync(FILE, 'utf8')

const FUNCTIONS = [
  'set_member_role',
  'set_member_active',
  'reset_member_pin',
  'add_member',
] as const

const MIGRATIONS = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => {
    const na = Number.parseInt(a.slice(0, 4), 10)
    const nb = Number.parseInt(b.slice(0, 4), 10)
    return na === nb ? a.localeCompare(b) : na - nb
  })

/** The highest-numbered migration that re-creates the given function. */
function latestDefinition(name: string): { file: string; body: string } | null {
  const needle = `create or replace function public.${name}(`
  for (let i = MIGRATIONS.length - 1; i >= 0; i -= 1) {
    const file = MIGRATIONS[i]
    const body = readFileSync(`supabase/migrations/${file}`, 'utf8')
    if (body.toLowerCase().includes(needle)) return { file, body }
  }
  return null
}

/** The executable text of one function, without the migration's comments. */
function functionBlock(src: string, name: string): string | null {
  const needle = `create or replace function public.${name}(`
  const start = src.toLowerCase().indexOf(needle)
  if (start < 0) return null
  const ends = [src.indexOf('\n$$', start), src.indexOf('\n$function$', start)]
    .filter((i) => i > start)
    .sort((a, b) => a - b)
  const end = ends[0] ?? src.length
  return src.slice(start, end)
}

describe('migration 0064 — staff RPC bodies + device guard', () => {
  it('defines all four staff RPCs with search_path pinned', () => {
    for (const name of FUNCTIONS) {
      const block = functionBlock(sql, name)
      expect(block, name).not.toBeNull()
      expect(block?.toLowerCase(), name).toContain("set search_path to 'public'")
    }
  })

  it('prepends the 0024 device guard to every body', () => {
    for (const name of FUNCTIONS) {
      const block = functionBlock(sql, name)
      expect(block, name).not.toBeNull()
      // Exactly one guard per body — the header comment must not count.
      expect(block?.match(/perform public\.assert_device_bound\(\);/g)?.length, name).toBe(1)
      // The guard must be the FIRST statement of the begin block.
      const beginAt = block?.indexOf('\nbegin\n') ?? -1
      const guardAt = block?.indexOf('perform public.assert_device_bound();') ?? -1
      expect(beginAt, name).toBeGreaterThan(-1)
      expect(guardAt, name).toBeGreaterThan(beginAt)
      // Nothing executable between begin and the guard except comments.
      const between = (block ?? '')
        .slice(beginAt + '\nbegin\n'.length, guardAt)
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '' && !line.trim().startsWith('--'))
      expect(between, name).toEqual([])
    }
  })

  it('carries real bodies, not the 0024 stubs', () => {
    for (const name of FUNCTIONS) {
      const block = functionBlock(sql, name)
      expect(block, name).not.toBeNull()
      expect(block, name).not.toContain('live body preserved verbatim')
    }
    expect(sql).toContain('public.is_active_owner()')
    expect(sql).toContain('public.step_up_tokens')
    expect(sql).toContain("raise exception 'already_member';")
    expect(sql).toContain("delete from pin_login_attempts")
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain(
      "values ('0064', 'staff_rpc_bodies_and_device_guard', null)",
    )
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })

  it('the LATEST repo definition of each RPC is real, guarded and search_path-safe', () => {
    for (const name of FUNCTIONS) {
      const latest = latestDefinition(name)
      expect(latest, name).not.toBeNull()
      expect(latest?.file, name).toBe('0064_staff_rpc_bodies_and_device_guard.sql')
      const block = latest === null ? null : functionBlock(latest.body, name)
      expect(block, name).not.toBeNull()
      expect(block, name).toContain('perform public.assert_device_bound();')
      expect(block?.toLowerCase(), name).toContain("set search_path to 'public'")
      expect(block, name).not.toContain('live body preserved verbatim')
    }
  })
})
