#!/usr/bin/env node
/**
 * Generates migration 0038 (Artista — Menestrel + Cigana merged cohort) from
 * the LIVE pg_proc bodies dumped into .planning/tmp/live-*.sql.
 *
 * The house pattern (gen-0028 / gen-0029): never hand-edit an RPC body into a
 * migration — take the live source byte-faithfully and apply the ONE change, so
 * a typo can never silently change a formula.
 *
 * This migration's change is systematic: every place a member's class is used
 * as the COHORT key (the aggregate scope, the key-stat config, the board
 * filter) goes through public.cohort_group(), which returns the merged group
 * name (Artista) for a merged class (Bard, Gypsy) and the class itself for
 * everything else. Payloads keep the member's OWN class everywhere the owner
 * ruled it must stay visible (my_report/my_card char_class, the cards).
 *
 * Run: node scripts/gen-0038.mjs   (output: supabase/migrations/0038_artista_merged_cohort.sql)
 */
import { readFileSync, writeFileSync } from 'node:fs'

const TMP = '.planning/tmp'

function live(name) {
  return readFileSync(`${TMP}/live-${name}.sql`, 'utf8')
}

/** Apply `changes` to `src`, asserting each rule matched exactly `expect` times. */
function swap(name, src, rules) {
  let out = src
  for (const [from, to, expected] of rules) {
    const parts = out.split(from)
    if (parts.length - 1 !== expected) {
      throw new Error(
        `${name}: rule matched ${parts.length - 1} time(s), expected ${expected}: ${JSON.stringify(from)}`,
      )
    }
    out = parts.join(to)
  }
  return out
}

// --- The one cohort-key swap, per RPC (exact live text -> group-aware text) ---

const my_report = swap('my_report', live('my_report'), [
  [
    'where m.char_class = v_class and m.char_function = v_function and m.active',
    'where public.cohort_group(m.char_class) = public.cohort_group(v_class) and m.char_function = v_function and m.active',
    1,
  ],
  ['where ks.class_name = v_class', 'where ks.class_name = public.cohort_group(v_class)', 1],
])

const my_card = swap('my_card', live('my_card'), [
  [
    'where m.char_class = v_class and m.char_function = v_function and m.active',
    'where public.cohort_group(m.char_class) = public.cohort_group(v_class) and m.char_function = v_function and m.active',
    1,
  ],
  ['where ks.class_name = v_class', 'where ks.class_name = public.cohort_group(v_class)', 2],
  ['where rs.class_name = v_class', 'where rs.class_name = public.cohort_group(v_class)', 1],
])

const role_rank = swap('role_rank', live('role_rank'), [
  [
    'select m.id, m.display_name, m.char_class, m.char_function',
    'select m.id, m.display_name, public.cohort_group(m.char_class) as char_class, m.char_function',
    1,
  ],
  [
    'and (p_class is null or m.char_class = p_class)',
    'and (p_class is null or public.cohort_group(m.char_class) = p_class)',
    1,
  ],
])

const staff_requests = swap('staff_requests', live('staff_requests'), [
  [
    'select l.member_id, l.stat_key, l.value, m.char_class, m.char_function',
    'select l.member_id, l.stat_key, l.value, public.cohort_group(m.char_class) as char_class, m.char_function',
    1,
  ],
  [
    'and a.char_class = r.char_class',
    'and a.char_class = public.cohort_group(r.char_class)',
    1,
  ],
  [
    'where ks.class_name = r.char_class',
    'where ks.class_name = public.cohort_group(r.char_class)',
    1,
  ],
])

const class_top5 = swap('class_top5', live('class_top5'), [
  [
    'where m.char_class = p_class and m.active',
    'where public.cohort_group(m.char_class) = p_class and m.active',
    1,
  ],
])

// The showCASE sections are keyed by the group: class_members' carried class
// becomes the group, and every downstream partition/aggregate/payload follows.
const get_promotion = swap('get_promotion', live('get_promotion'), [
  [
    'select m.id, m.display_name, m.char_function, m.char_class',
    'select m.id, m.display_name, m.char_function, public.cohort_group(m.char_class) as char_class',
    1,
  ],
])

const get_promotion_public = swap('get_promotion_public', live('get_promotion_public'), [
  [
    'select m.id, m.display_name, m.char_function, m.char_class',
    'select m.id, m.display_name, m.char_function, public.cohort_group(m.char_class) as char_class',
    1,
  ],
])

/** Wrap a live body in the house create-or-replace preamble (exact signature). */
function createOrReplace(name, args, body, comment) {
  // COMMENT ON FUNCTION takes the argument TYPES only — a DEFAULT clause is
  // legal in create-or-replace but not in a comment target (Postgres 42601).
  const commentArgs = args.replace(/\s+DEFAULT\s+[^,)]+/g, '')
  return `
create or replace function public.${name}(${args})
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
${body.replace(/\s+$/, '')}
$$;

comment on function public.${name}(${commentArgs}) is ${comment};

revoke all on function public.${name}(${commentArgs}) from public;
grant execute on function public.${name}(${commentArgs}) to authenticated;
`
}

const FUNCTIONS = [
  createOrReplace(
    'my_report',
    '',
    my_report,
    "'Member rank report (0038): identical to 0028/0036 bodies except every cohort scope and key-stat config read goes through public.cohort_group() — a merged class (Bard) ranks with its group (Artista). The payload still carries the member''s own class (owner 2026-10-29: the card keeps printing Menestrel). Key-stat identity NEVER serialised (RNK-02).'",
  ),
  createOrReplace(
    'my_card',
    '',
    my_card,
    "'Member Painel card (0038): same cohort_group() swap as my_report — the merged cohort''s aggregates and the ONE shared key/relevant config drive the card, while char_class stays the member''s own class. Key-stat CONFIG never serialised.'",
  ),
  createOrReplace(
    'role_rank',
    'p_function text, p_class text DEFAULT NULL::text',
    role_rank,
    "'Staff ranking board (0038): role_members carries cohort_group(char_class), so a board filtered to the Artista group ranks Menestrel and Cigana together and rows print the group. Board filter matches p_class through the group. Staff gate and value-proportional math untouched.'",
  ),
  createOrReplace(
    'staff_requests',
    '',
    staff_requests,
    "'Staff requests board with per-applicant OVR (0038): the cohort is the applicant''s merged group, so a Menestrel applicant is scored against the Artista cohort and its single shared key config. The request''s own class still rides the payload.'",
  ),
  createOrReplace(
    'class_top5',
    'p_class text',
    class_top5,
    "'Class top 5 (0038): class_members filters through cohort_group(p_class), so the Artista group is one board. Key config already reads p_class (the group).'",
  ),
  createOrReplace(
    'get_promotion',
    '',
    get_promotion,
    "'Members-only Início showCase (0038): class_members carries cohort_group(char_class), so each meta GROUP claims one section — Artista instead of Menestrel + Cigana as two. Non-viable cohorts still gated by class_cohorts.meta.'",
  ),
  createOrReplace(
    'get_promotion_public',
    '',
    get_promotion_public,
    "'Public landing showCase (0038): same group swap as get_promotion — anon-callable, meta groups only, one section per group. Key-stat CONFIG and the merge table are never serialised.'",
  ),
]

const migration = `-- NeoFoot migration 0038: Artista — Menestrel + Cigana merged cohort (owner 2026-10-29).
--
-- Owner: "menestrel and cigana are the same class for the purpose of stats, so
-- they also must be merged, in a status of exception, all other tabs keep
-- working as they are, except for the 'menestrel + Cigana' tab. And we must call
-- the merged tab the 'Artista' tab." Scope answers: ALL surfaces, ONE shared
-- 6-key config, each member keeps their own class on the card/registry.
--
-- The rank engine keys every cohort by (members.char_class, members.char_function)
-- and every config by (class_key_stats.class_name, char_function), so this makes
-- ONE group of two classes and leaves every other cohort untouched:
--   1. public.class_cohort_merges (class_name -> group_name) — the persisted split;
--      a class belongs to at most one group and a class NOT in the table is its own
--      group (that is what keeps this an exception, never a global rule).
--   2. public.cohort_group(p_class) — the ONE helper every RPC scopes by.
--   3. classes gains the VIRTUAL class 'Artista' (satisfies the class_relevant_stats
--      FK — class_key_stats has no classes FK, verified via information_schema —
--      and appears ONCE in /classes so every class filter lists it once);
--      members.char_class keeps Bard/Gypsy — a member can never be an Artista.
--   4. config + cohort re-key: Artista carries the ONE shared config (copied from
--      Bard, the merge's canonical representative) and the class_cohorts rows of
--      Bard/Gypsy collapse onto the group; the 39-row split becomes 36 rows.
--   5. the seven cohort RPCs are create-or-replace from the LIVE pg_proc bodies
--      (scripts/gen-0038.mjs), with ONE systematic change: cohort scopes, board
--      filters and key-stat config reads go through cohort_group(); payloads that
--      must show the member's own class still do.
--
-- Append-only: 0001-0037 are never edited in place; create or replace only, exact
-- signatures, no function is dropped. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0038_artista_merged_cohort.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. The persisted merge: class -> stats group.
-- ---------------------------------------------------------------------------

insert into public.classes (class_name) values ('Artista')
on conflict (class_name) do nothing;

create table if not exists public.class_cohort_merges (
  class_name text primary key references public.classes(class_name) on delete cascade,
  group_name text not null
);

comment on table public.class_cohort_merges is
  'Persisted class-merge map (owner decision 2026-10-29): class_name ranks INSIDE group_name instead of on its own. Seeded Bard/Gypsy -> Artista (same job line for stats). A class with no row is its own group, so every other cohort is untouched. RLS deny-all for members (staff-select policy), exactly like class_cohorts; never serialised in any RPC payload.';

alter table public.class_cohort_merges enable row level security;

grant select on public.class_cohort_merges to authenticated;
revoke insert, update, delete on public.class_cohort_merges from anon, authenticated;
revoke select on public.class_cohort_merges from anon;

drop policy if exists staff_select_cohort_merges on public.class_cohort_merges;
create policy staff_select_cohort_merges on public.class_cohort_merges
  for select to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active));

-- Owner list 2026-10-29: the Dancer/Bard job line is one class for stats.
insert into public.class_cohort_merges (class_name, group_name)
values ('Bard', 'Artista'), ('Gypsy', 'Artista')
on conflict (class_name) do update set group_name = excluded.group_name;

-- ---------------------------------------------------------------------------
-- 2. cohort_group(p_class) — the ONE identity the rank engine scopes by.
--    Immutable + parallel safe: the RPCs qualify it as public.cohort_group(),
--    so a search_path surprise can never reach another function of this name.
-- ---------------------------------------------------------------------------

create or replace function public.cohort_group(p_class text)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(
    (select m.group_name from public.class_cohort_merges m where m.class_name = p_class),
    p_class
  );
$$;

comment on function public.cohort_group(text) is
  'The stats group a class ranks inside: the merged group name (Artista) for a merged class (Bard, Gypsy), otherwise the class itself. SECURITY INVOKER by design and fail-closed — a member calling it directly sees no rows (class_cohort_merges is staff-select under RLS) so cohort_group falls back to the plain class, while the SECURITY DEFINER RPCs run as the table owner, bypass RLS and DO see the merge. Reading a merged group is therefore never a member-readable fact.';

-- ---------------------------------------------------------------------------
-- 3. Re-key config: ONE shared config per (Artista, function), copied from
--    Bard (the representative the owner registered first). Idempotent: after
--    the first run there are no Bard/Gypsy rows to copy, so a re-run can never
--    clobber an officer's later edits to the Artista config.
-- ---------------------------------------------------------------------------

insert into public.class_key_stats (class_name, char_function, stat_key, selection_order, selected_at)
select 'Artista', k.char_function, k.stat_key, k.selection_order, coalesce(k.selected_at, now())
from public.class_key_stats k
where k.class_name = 'Bard'
on conflict (class_name, char_function, stat_key) do update
  set selection_order = excluded.selection_order,
      selected_at = excluded.selected_at;

-- Relevants are CLASS-level (class_relevant_stats carries no char_function —
-- information_schema verified), so the copy is a straight class rename.
insert into public.class_relevant_stats (class_name, stat_key)
select distinct 'Artista', r.stat_key
from public.class_relevant_stats r
where r.class_name = 'Bard'
on conflict (class_name, stat_key) do nothing;

delete from public.class_key_stats where class_name in ('Bard', 'Gypsy');
delete from public.class_relevant_stats where class_name in ('Bard', 'Gypsy');

-- ---------------------------------------------------------------------------
-- 4. Re-key the persisted viability split: the Bard/Gypsy rows collapse onto
--    the group (meta = TRUE when EITHER source row was meta — the union, never
--    the intersection: a merge must not silently un-meta a playable build).
-- ---------------------------------------------------------------------------

insert into public.class_cohorts (class_name, char_function, meta)
select 'Artista', c.char_function, bool_or(c.meta)
from public.class_cohorts c
where c.class_name in ('Bard', 'Gypsy')
group by c.char_function
on conflict (class_name, char_function) do update
  set meta = excluded.meta,
      updated_at = now();

delete from public.class_cohorts where class_name in ('Bard', 'Gypsy');

-- Seed invariants after the re-key: every class exists, the split matches the
-- owner's counts (23 - 2 meta + 1 group = 22 meta; 16 - 4 dark + 2 = 14 dark),
-- and Artista really is ONE cohort covering both classes with a full key set.
do $$
declare
  v_meta int;
  v_dark int;
begin
  if exists (
    select 1 from public.class_cohorts cc
    where not exists (select 1 from public.classes c where c.class_name = cc.class_name)
  ) then
    raise exception 'class_cohorts references an unknown class';
  end if;

  select count(*) filter (where meta), count(*) filter (where not meta)
    into v_meta, v_dark
  from public.class_cohorts;

  if v_meta <> 22 or v_dark <> 14 then
    raise exception 'class_cohorts seed mismatch: % meta / % non-viable (expected 22 / 14 after the Artista merge)',
      v_meta, v_dark;
  end if;

  if not exists (
    select 1 from public.class_cohorts
    where class_name = 'Artista' and char_function = 'suporte' and meta
  ) then
    raise exception 'Artista/suporte must be the merged meta cohort';
  end if;

  if exists (
    select 1 from public.class_cohort_merges m
    where not exists (
      select 1 from public.class_key_stats ks
      where ks.class_name = m.group_name
      group by ks.class_name, ks.char_function
      having count(*) = 6
    )
  ) then
    raise exception 'a merged group must own a full 6-key config';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The seven cohort RPCs — byte-faithful live bodies, cohort_group() swap.
-- ---------------------------------------------------------------------------
${FUNCTIONS.join('')}

-- ---------------------------------------------------------------------------
-- 6. Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0038', 'artista_merged_cohort', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
`

writeFileSync(
  'supabase/migrations/0038_artista_merged_cohort.sql',
  migration,
  'utf8',
)
console.log(`[gen-0038] wrote supabase/migrations/0038_artista_merged_cohort.sql (${migration.split('\n').length} lines)`)
console.log('[gen-0038] cohort_group swap verified in all seven RPC bodies')
