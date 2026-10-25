#!/usr/bin/env node
/**
 * Generate supabase/migrations/0028_keyu_order_repair_rpc_key_filter.sql from
 * the LIVE pg_proc.prosrc dumps (.planning/tmp/live-<fn>.sql) so every rewritten
 * body is byte-faithful to what production runs (08-01 lesson), with exactly
 * one change: every class_key_stats key-set read gains
 * `and ks.selection_order <= 6` (owner rule 2026-10-24: relevants are NEVER
 * keys — not for the OVR count, not for the Painel strip; relevants exist for
 * the foco de melhoria priority set only).
 *
 * The migration also repairs the corrupt selection_order data (0018's backfill
 * copied the column default 0 into every original key row; the set_key_stat_v2
 * appends then landed at 1..k INSIDE the key range) by renumbering each combo's
 * ordered set to contiguous 1..N: backfilled base keys first (alphabetical
 * tie-break — OVR is order-independent and my_card/get_promotion order key
 * lists by label, so no display order changes), later appends after.
 *
 * Read-only on the DB — writes only the migration file.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const FNS = [
  { name: 'my_report', args: '()', expectedFilters: 1 },
  { name: 'my_card', args: '()', expectedFilters: 2 },
  { name: 'class_top5', args: '(p_class text)', expectedFilters: 1 },
  { name: 'get_promotion', args: '()', expectedFilters: 2 },
]

const COMMENTS = {
  my_report:
    "Member rank report (Phase 9): per-stat own value, class average, best (stat_direction-aware), value-proportional points, OVR (51 + mean(6 key-stat points) * 48/99, all-6-or-nothing) and last_validated_at. 0028: the key set is class_key_stats rows with selection_order <= 6 ONLY — relevants (7+) never count as keys (owner rule 2026-10-24); with fewer than 6 ordered rows configured OVR stays null. Key-stat identity NEVER serialised (RNK-02). Exceptions: no_member_claim/forbidden.",
  my_card:
    "Leak-safe member card payload: char_class/char_function from the JWT, OVR (0009 semantics), key_stats filtered to the caller's own build-role config, relevant_stat_keys identity only. 0028: key_stats and the OVR gate read selection_order <= 6 ONLY — relevants (7+) never appear on the Painel strip nor count as keys (owner rule 2026-10-24). Key-stat CONFIG never serialised.",
  class_top5:
    "Staff-only top-5-by-OVR preview for a class. 0028: the OVR gate reads the (class, role) key set as selection_order <= 6 ONLY — relevants (7+) never count as keys (owner rule 2026-10-24).",
  get_promotion:
    "Member-invocable promotion payload: per-class top-5 by OVR with key-stat highlights. 0028: both the OVR gate and the highlights list read selection_order <= 6 ONLY — relevants (7+) never count as keys nor appear on showcase cards (owner rule 2026-10-24).",
}

let out = []
out.push(`-- NeoFoot migration 0028: KEYU ordered-set repair + relevants-are-never-keys filter.
--
-- Found by Phase 10 UAT (owner report 2026-10-24, "the OVR calculation requires
-- at least 3 of the same class and role"): two stacked defects.
--
-- 1. DATA — 0018 added class_key_stats.selection_order with default 0 and its
--    backfill copied that 0 into every original key row (the pre-0018 table had
--    no order at all, 0009 inserted plain (class_name, stat_key)). Every combo
--    landed at all-zeros; set_key_stat_v2 appends then computed
--    max(selection_order) + 1 = 1..k, INSIDE the <=6 key range. Combos where
--    officers later selected extra stats (High Priest/suporte: 10 rows,
--    High Wizard/mdps: 9) broke every count(*) = 6 OVR gate -> OVR null +
--    data_sufficient false despite a full cohort, and my_card returned 10/9
--    key_stats (relevants rendered on the Painel strip).
--    Repair: renumber each combo's ordered set to contiguous 1..N by
--    (selection_order, selected_at, stat_key) — backfilled base keys first
--    (alphabetical tie-break: OVR is order-independent and my_card /
--    get_promotion order key lists by label, so no display order changes),
--    later v2 appends after (they become the relevants they were meant to be).
--
-- 2. RPCs — the owner rule (2026-10-24): relevants must be ignored BOTH for
--    the OVR count AND from the Painel; their usage is in the foco de
--    melhoria priority set. Every class_key_stats key-set read in my_report,
--    my_card, class_top5 and get_promotion now filters selection_order <= 6.
--    Bodies are byte-faithful to the LIVE pg_proc source (dumped pre-apply)
--    with only that filter added.
--
-- Append-only: 0001-0027 are never edited in place.
-- Apply: node scripts/apply-seed.mjs supabase/migrations/0028_keyu_order_repair_rpc_key_filter.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Data repair: contiguous 1..N selection_order per (class, char_function)
-- ---------------------------------------------------------------------------

with ranked as (
  select class_name, char_function, stat_key,
         row_number() over (
           partition by class_name, char_function
           order by selection_order, selected_at, stat_key
         ) as rn
  from class_key_stats
)
update class_key_stats k
set selection_order = r.rn
from ranked r
where k.class_name = r.class_name
  and k.char_function = r.char_function
  and k.stat_key = r.stat_key;

-- Guard: the KEYU invariant must hold exactly after the renumber.
do $$
begin
  if exists (
    select 1 from class_key_stats
    group by class_name, char_function
    having count(*) <> count(distinct selection_order)
        or min(selection_order) <> 1
        or max(selection_order) <> count(*)
  ) then
    raise exception 'class_key_stats renumber failed: orders must be contiguous 1..N per (class, char_function)';
  end if;
end $$;

`)

for (const fn of FNS) {
  const dump = `.planning/tmp/live-${fn.name}.sql`
  if (!existsSync(dump)) throw new Error(`missing live dump ${dump} — run scripts/rpc-ovr-audit.mjs first`)
  let body = readFileSync(dump, 'utf8')
  if (!body.endsWith('\n')) body += '\n'
  let count = 0
  body = body.replace(/^( *)and ks\.char_function = (.+)$/gm, (m, sp) => {
    count += 1
    return `${m}\n${sp}and ks.selection_order <= 6`
  })
  if (count !== fn.expectedFilters) {
    throw new Error(`${fn.name}: expected ${fn.expectedFilters} key-set reads, anchored ${count}`)
  }
  out.push(`-- ---------------------------------------------------------------------------
-- 2.${FNS.indexOf(fn) + 1} ${fn.name}: key-set reads filter to selection_order <= 6
-- ---------------------------------------------------------------------------

create or replace function public.${fn.name}${fn.args}
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
${body}$$;

comment on function public.${fn.name}${fn.args} is
  '${String(COMMENTS[fn.name]).replace(/'/g, "''")}';

revoke execute on function public.${fn.name}${fn.args} from public, anon;
grant  execute on function public.${fn.name}${fn.args} to authenticated;

`)
}

out.push(`-- ---------------------------------------------------------------------------
-- 3. Bookkeeping: record 0028 so a future CLI push never re-runs it (0012 way)
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0028', 'keyu_order_repair_rpc_key_filter', null);

commit;
`)

writeFileSync('supabase/migrations/0028_keyu_order_repair_rpc_key_filter.sql', out.join(''), 'utf8')
console.log('wrote supabase/migrations/0028_keyu_order_repair_rpc_key_filter.sql')
for (const fn of FNS) console.log(`  ${fn.name}: ${fn.expectedFilters} key-set read(s) filtered`)
