// Contract locks for migration 0073 (owner 2026-11-05): OVR now averages every
// configured stat (keys + relevants), keys only highlight the card, a key
// removal leaves its slot empty (no relevant promotion), and relevants are
// frozen while the 6-key set is incomplete.
//
// Why this file exists: the OVR formula lives inline in EIGHT RPCs and the
// key/relevant rules in one SECURITY DEFINER function. A future supersession
// that silently restores the old `count(*) = 6 and count(p) = 6` gate or the
// automatic promotion would re-break the owner's rule with no client change.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const FILE_NAME = '0073_ovr_selected_stats_and_key_slots.sql'
const FILE = `supabase/migrations/${FILE_NAME}`
const sql = readFileSync(FILE, 'utf8')
const manifest = JSON.parse(
  readFileSync('supabase/migrations/manifest.json', 'utf8'),
) as { apply_order: string[] }

const MIGRATIONS = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => {
    const na = Number.parseInt(a.slice(0, 4), 10)
    const nb = Number.parseInt(b.slice(0, 4), 10)
    return na === nb ? a.localeCompare(b) : na - nb
  })

/** The highest-numbered migration that re-creates the given function. */
function latestDefinition(name: string): { file: string; body: string } | null {
  for (let i = MIGRATIONS.length - 1; i >= 0; i -= 1) {
    const file = MIGRATIONS[i]
    const body = readFileSync(`supabase/migrations/${file}`, 'utf8')
    if (body.includes(`create or replace function public.${name}(`)) {
      return { file, body }
    }
  }
  return null
}

describe('migration 0073 — OVR over keys + relevants', () => {
  it('is the latest definition of every OVR RPC', () => {
    for (const fn of [
      'my_report',
      'my_card',
      'class_top5',
      'role_rank',
      'get_promotion',
      'get_promotion_public',
      'staff_requests',
      'ovr_projection',
      'set_key_stat_v2',
    ]) {
      const latest = latestDefinition(fn)
      expect(latest, fn).not.toBeNull()
      expect(latest?.file, fn).toBe(FILE_NAME)
    }
  })

  it('removes the old all-6-points gate and requires the 6-key config + one point', () => {
    expect(sql).not.toContain('count(*) = 6 and count(p) = 6')
    expect(sql).toContain('count(p) >= 1')
    expect(sql).toContain('and kk.selection_order <= 6) = 6')
  })

  it('OVR pools every configured stat (no selection_order filter in the OVR subqueries)', () => {
    // The OVR subqueries end in ") kp"; the key-only blocks end in ") hl" /
    // "())," — a surviving `selection_order <= 6` before ") kp" would mean the
    // OVR is still key-only.
    expect(sql).not.toMatch(/selection_order <= 6\n\s*\) kp/)
  })

  it('keeps the card highlights as the six keys', () => {
    expect(sql).toContain("'key_stats', (")
    expect(sql).toContain('and ks.selection_order <= 6')
    expect(sql).toContain('and ks.selection_order > 6')
  })

  it('set_key_stat_v2 fills key slots, never promotes, and freezes relevants', () => {
    expect(sql).toContain('from generate_series(1, 6) as s(slot)')
    expect(sql).toContain("raise exception 'key_set_incomplete'")
    expect(sql).toContain('delete from class_key_stats')
    // The 0018 promotion block must be gone.
    expect(sql).not.toContain('Promote the oldest relevant')
    expect(sql).not.toContain('set selection_order = v_old_order')
  })

  it('keeps the grants, bookkeeping row and PostgREST reload', () => {
    expect(sql).toContain(
      'revoke execute on function public.ovr_projection(uuid, text, text, jsonb, uuid) from public, anon, authenticated',
    )
    expect(sql).toContain(
      'grant execute on function public.get_promotion_public() to anon, authenticated',
    )
    expect(sql).toContain(
      "values ('0073', 'ovr_selected_stats_and_key_slots', null)",
    )
    expect(sql).toContain("notify pgrst, 'reload schema'")
    expect(manifest.apply_order).toContain(FILE_NAME)
  })
})
