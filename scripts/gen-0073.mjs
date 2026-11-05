#!/usr/bin/env node
/**
 * Generates migration 0073 — OVR over keys + relevants and hole-preserving
 * key-stat slots — from the LIVE pg_proc bodies dumped into
 * .planning/tmp/live-*.sql (scripts/gen-0038.mjs house pattern).
 *
 * Owner rules (2026-11-05):
 *   1. OVR = 51 + mean(points) * 48/99 over EVERY selected stat of the
 *      (class, build-role) config (the 6 keys + the relevants). Keys stay the
 *      six stats highlighted on the card, but they no longer cap the OVR pool.
 *   2. Missing points are ignored ("média dos disponíveis"): the OVR is
 *      computed from the selected stats that have points, provided at least
 *      one does. The 6-key config gate is still mandatory.
 *   3. Removing a key leaves its slot empty — it NEVER promotes a relevant.
 *      The cohort disappears from Início while the key set is incomplete
 *      (no 6 keys -> no OVR) and returns once 6 keys are selected again.
 *   4. No relevant can be added while the key set is incomplete; relevants
 *      already saved stay saved and can only be modified after 6 keys exist.
 *
 * Run: node scripts/gen-0073.mjs   (output: supabase/migrations/0073_*.sql)
 */
import { readFileSync, writeFileSync } from 'node:fs'

const TMP = '.planning/tmp'
const OUT = 'supabase/migrations/0073_ovr_selected_stats_and_key_slots.sql'

function live(name) {
  return readFileSync(`${TMP}/live-${name}.sql`, 'utf8')
}

function expectCount(name, src, needle, expected) {
  const count = src.split(needle).length - 1
  if (count !== expected) {
    throw new Error(`${name}: expected ${expected} occurrence(s), found ${count}: ${needle.slice(0, 80)}`)
  }
}

/** Replace exactly `expected` occurrences of `from` with `to`. */
function swap(name, src, from, to, expected = 1) {
  expectCount(name, src, from, expected)
  return src.split(from).join(to)
}

/** Replace exactly `expected` matches of `regex` (global) with `to`. */
function swapRe(name, src, regex, to, expected = 1) {
  const global = new RegExp(regex.source, 'g')
  const matches = [...src.matchAll(global)]
  if (matches.length !== expected) {
    throw new Error(`${name}: regex matched ${matches.length} time(s), expected ${expected}`)
  }
  // String replacement so capture references ($1) stay usable.
  return src.replace(global, to)
}

/** The key-set completeness probe (6 rows at selection_order <= 6). */
function keyCount(classExpr, funcExpr) {
  return `(select count(*) from class_key_stats kk
                  where kk.class_name = ${classExpr}
                    and kk.char_function = ${funcExpr}
                    and kk.selection_order <= 6)`
}

const OVR_LINE = 'when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99'
const OVR_LINE_SPACED = 'when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0 / 99'

function ovrGate(classExpr, funcExpr) {
  return `when ${keyCount(classExpr, funcExpr)} = 6
             and count(p) >= 1
              then 51 + avg(p) * 48.0/99`
}

/** Drops the selection_order filter of the OVR subquery only (the one ending in ") kp"). */
function dropOvrOrderFilter(name, src) {
  return swapRe(name, src, /\n[ \t]+and ks\.selection_order <= 6\n([ \t]*)\) kp/g, '\n$1) kp', 1)
}

// --- my_report -------------------------------------------------------------
let my_report = live('my_report')
my_report = swap('my_report', my_report, OVR_LINE, ovrGate('public.cohort_group(v_class)', 'v_function'), 1)
my_report = swap(
  'my_report',
  my_report,
  "'data_sufficient', count(*) = 6 and count(p) = 6",
  `'data_sufficient', ${keyCount('public.cohort_group(v_class)', 'v_function')} = 6
             and count(p) >= 1`,
  1,
)
my_report = dropOvrOrderFilter('my_report', my_report)

// --- my_card ---------------------------------------------------------------
let my_card = live('my_card')
my_card = swap('my_card', my_card, OVR_LINE, ovrGate('public.cohort_group(v_class)', 'v_function'), 1)
my_card = swap(
  'my_card',
  my_card,
  "'data_sufficient', count(*) = 6 and count(p) = 6",
  `'data_sufficient', ${keyCount('public.cohort_group(v_class)', 'v_function')} = 6
             and count(p) >= 1`,
  1,
)
my_card = dropOvrOrderFilter('my_card', my_card)
// The legacy class_relevant_stats table predates the Phase 9 ordered set and
// is no longer written. The foco strip must read the REAL relevants.
my_card = swap(
  'my_card',
  my_card,
  `          select jsonb_agg(rs.stat_key order by rs.stat_key)
          from class_relevant_stats rs
          where rs.class_name = public.cohort_group(v_class)`,
  `          select jsonb_agg(ks.stat_key order by ks.selection_order, ks.stat_key)
          from class_key_stats ks
          where ks.class_name = public.cohort_group(v_class)
            and ks.char_function = v_function
            and ks.selection_order > 6`,
  1,
)

// --- class_top5 ------------------------------------------------------------
let class_top5 = live('class_top5')
class_top5 = swap(
  'class_top5',
  class_top5,
  OVR_LINE,
  ovrGate('p_class', 'cm.char_function'),
  1,
)
class_top5 = dropOvrOrderFilter('class_top5', class_top5)

// --- role_rank -------------------------------------------------------------
let role_rank = live('role_rank')
role_rank = swap(
  'role_rank',
  role_rank,
  OVR_LINE,
  ovrGate('rm.char_class', 'rm.char_function'),
  1,
)
role_rank = dropOvrOrderFilter('role_rank', role_rank)

// --- get_promotion ---------------------------------------------------------
let get_promotion = live('get_promotion')
get_promotion = swap(
  'get_promotion',
  get_promotion,
  OVR_LINE,
  ovrGate('cm.char_class', 'cm.char_function'),
  1,
)
get_promotion = dropOvrOrderFilter('get_promotion', get_promotion)

// --- get_promotion_public --------------------------------------------------
let get_promotion_public = live('get_promotion_public')
get_promotion_public = swap(
  'get_promotion_public',
  get_promotion_public,
  OVR_LINE,
  ovrGate('cm.char_class', 'cm.char_function'),
  1,
)
get_promotion_public = dropOvrOrderFilter('get_promotion_public', get_promotion_public)

// --- staff_requests --------------------------------------------------------
let staff_requests = live('staff_requests')
staff_requests = swap(
  'staff_requests',
  staff_requests,
  OVR_LINE,
  ovrGate('public.cohort_group(r.char_class)', 'r.char_function'),
  1,
)
staff_requests = swap(
  'staff_requests',
  staff_requests,
  `      -- 0036 unified OVR semantics: exactly-6 key stats read by the
      -- applicant's own class+function with selection_order <= 6, the
      -- applicant holds all 6, each cohort n >= 3, Phase 9 value-proportional
      -- points (SCALE-01). Cohort = ACTIVE members of the SAME class+function;
      -- the applicant's own stats never join it (D-14).`,
  `      -- 0073 OVR semantics: the applicant's own (class, function) config must
      -- hold its 6 keys; every configured stat (keys + relevants) then feeds
      -- the value-proportional mean, ignoring stats without points (at least
      -- one point is required). Cohort = ACTIVE members of the SAME
      -- class+function; the applicant's own stats never join it (D-14).`,
  1,
)
staff_requests = dropOvrOrderFilter('staff_requests', staff_requests)

// --- ovr_projection --------------------------------------------------------
let ovr_projection = live('ovr_projection')
ovr_projection = swap(
  'ovr_projection',
  ovr_projection,
  `  select case when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0 / 99 end`,
  `  select case
    when ${keyCount('public.cohort_group(p_class)', 'p_function')} = 6
     and count(p) >= 1
      then 51 + avg(p) * 48.0 / 99
  end`,
  1,
)
ovr_projection = swap(
  'ovr_projection',
  ovr_projection,
  `      and ks.selection_order <= 6
  ),`,
  `  ),`,
  1,
)

// --- set_key_stat_v2 (full rewrite: hole-preserving slots) -----------------
const set_key_stat_v2 = `create or replace function public.set_key_stat_v2(p_class text, p_function text, p_stat_key text, p_enabled boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n_keys int;
  v_old_order int;
  v_slot int;
begin
  -- Internal gate FIRST (officer/owner claim AND caller's live active flag).
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if not exists (select 1 from classes where class_name = p_class) then
    raise exception 'unknown_class';
  end if;

  if p_function not in ('dps', 'mdps', 'suporte') then
    raise exception 'unknown_function';
  end if;

  -- Serialize toggles per (class, function) so concurrent officers cannot
  -- violate the slot invariants (CR-01 atomicity lesson).
  perform pg_advisory_xact_lock(hashtext('cks:' || p_class || ':' || p_function));

  -- unknown stat_key: the class_key_stats FK to stat_catalog raises naturally.

  select count(*) into v_n_keys
  from class_key_stats
  where class_name = p_class and char_function = p_function and selection_order <= 6;

  if p_enabled then
    -- 0073 rule: keys fill slots 1..6; only once all 6 exist does a new
    -- selection become a relevant (slot >= 7). No block at 7.
    if not exists (
      select 1 from class_key_stats
      where class_name = p_class and char_function = p_function and stat_key = p_stat_key
    ) then
      if v_n_keys < 6 then
        -- First free key slot (robust even against legacy gaps).
        select min(s.slot) into v_slot
        from generate_series(1, 6) as s(slot)
        where not exists (
          select 1 from class_key_stats k
          where k.class_name = p_class and k.char_function = p_function
            and k.selection_order = s.slot
        );

        insert into class_key_stats (class_name, char_function, stat_key, selection_order, selected_at)
        values (p_class, p_function, p_stat_key, v_slot, now());
      else
        insert into class_key_stats (class_name, char_function, stat_key, selection_order, selected_at)
        select p_class, p_function, p_stat_key,
               coalesce(max(selection_order), 6) + 1,
               now()
        from class_key_stats
        where class_name = p_class and char_function = p_function;
      end if;
    end if;
  else
    select selection_order into v_old_order
    from class_key_stats
    where class_name = p_class and char_function = p_function and stat_key = p_stat_key;

    if v_old_order is not null then
      -- 0073 rule: relevants are frozen while the key set is incomplete —
      -- they may only be modified after the 6 keys are selected again.
      if v_old_order > 6 and v_n_keys <> 6 then
        raise exception 'key_set_incomplete';
      end if;

      delete from class_key_stats
      where class_name = p_class and char_function = p_function and stat_key = p_stat_key;

      -- 0073 rule: removing a key leaves its slot EMPTY — never promote a
      -- relevant. Keys are compacted 1..n (relative order preserved); a
      -- relevant removed while the set is complete re-compacts 7..n.
      if v_old_order <= 6 then
        update class_key_stats k
        set selection_order = r.rn
        from (
          select stat_key,
                 row_number() over (order by selection_order, stat_key) as rn
          from class_key_stats
          where class_name = p_class and char_function = p_function
            and selection_order <= 6
        ) r
        where k.class_name = p_class
          and k.char_function = p_function
          and k.stat_key = r.stat_key;

        select count(*) into v_n_keys
        from class_key_stats
        where class_name = p_class and char_function = p_function and selection_order <= 6;
      else
        update class_key_stats k
        set selection_order = 6 + r.rn
        from (
          select stat_key,
                 row_number() over (order by selection_order, stat_key) as rn
          from class_key_stats
          where class_name = p_class and char_function = p_function
            and selection_order > 6
        ) r
        where k.class_name = p_class
          and k.char_function = p_function
          and k.stat_key = r.stat_key;
      end if;
    end if;
  end if;

  return (
    select count(*) from class_key_stats
    where class_name = p_class and char_function = p_function and selection_order <= 6
  );
end;
$function$`

/** Wrap a live definition (or a generated one) with its grants. */
function withGrants(body, grants) {
  return `${body.replace(/\s+$/, '')};\n\n${grants.trim()}\n`
}

const authGrants = `revoke all on function public.%NAME%(%ARGS%) from public;
grant execute on function public.%NAME%(%ARGS%) to authenticated;`

function grants(name, args) {
  return authGrants.replaceAll('%NAME%', name).replaceAll('%ARGS%', args)
}

/** pg_get_functiondef emits uppercase CREATE; the repo's greps and generators
 * expect the house lowercase form. */
function lowerCreate(body) {
  return body.replace(/^CREATE OR REPLACE FUNCTION /, 'create or replace function ')
}

const migration = `-- NeoFoot migration 0073: OVR over keys + relevants, hole-preserving key slots
-- (owner decisions 2026-11-05).
--
-- 1. OVR base: every SELECTED stat of the (class, build-role) config now feeds
--    the value-proportional mean — the 6 keys AND the relevants. The keys are
--    still the six stats highlighted on the card, but they no longer cap the
--    OVR pool. The 6-key config remains the mandatory gate: with fewer than 6
--    keys the OVR is null (so Início drops the cohort) until the key set is
--    complete again.
-- 2. Missing points are ignored: the mean runs over the configured stats that
--    have points, provided at least one does (owner: "média dos disponíveis").
--    The old all-6-or-nothing points rule is gone.
-- 3. set_key_stat_v2 no longer promotes the oldest relevant when a key is
--    removed. The slot stays empty (keys compact 1..n); a relevant can only be
--    added once the 6 keys exist and an existing relevant can only be removed
--    when the key set is complete ("key_set_incomplete" otherwise).
-- 4. my_card's relevant_stat_keys now reads the real relevants (ordered set
--    rows at selection_order > 6) instead of the retired class_relevant_stats
--    table, so the Painel foco strip follows the live config.
--
-- Append-only: 0001–0072 are never edited in place; create or replace only,
-- exact signatures, no function is dropped. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0073_ovr_selected_stats_and_key_slots.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Normalize the ordered set: keys compact 1..n, relevants re-based at 7..
--    (defensive against legacy gaps; the new RPC also fills the first free
--    key slot, so a gap can never collide again).
-- ---------------------------------------------------------------------------

with ranked as (
  select class_name, char_function, stat_key,
         row_number() over (
           partition by class_name, char_function
           order by selection_order, stat_key
         ) as rn
  from public.class_key_stats
  where selection_order <= 6
)
update public.class_key_stats k
set selection_order = r.rn
from ranked r
where k.class_name = r.class_name
  and k.char_function = r.char_function
  and k.stat_key = r.stat_key
  and k.selection_order <> r.rn;

with ranked as (
  select class_name, char_function, stat_key,
         6 + row_number() over (
           partition by class_name, char_function
           order by selection_order, stat_key
         ) as rn
  from public.class_key_stats
  where selection_order > 6
)
update public.class_key_stats k
set selection_order = r.rn
from ranked r
where k.class_name = r.class_name
  and k.char_function = r.char_function
  and k.stat_key = r.stat_key
  and k.selection_order <> r.rn;

-- ---------------------------------------------------------------------------
-- 2. set_key_stat_v2 (0073 semantics).
-- ---------------------------------------------------------------------------

${withGrants(set_key_stat_v2, grants('set_key_stat_v2', 'p_class text, p_function text, p_stat_key text, p_enabled boolean'))}

comment on function public.set_key_stat_v2(text, text, text, boolean) is
  'Staff-only key/relevant configuration per (class, build-role) (0073 owner rules 2026-11-05). p_enabled=true fills the first free key slot while fewer than 6 keys exist, then appends a relevant once the 6-key set is complete; p_enabled=false removes a key WITHOUT promoting any relevant (the slot stays empty), and refuses to touch a relevant while the key set is incomplete (key_set_incomplete). Keys are compacted 1..n after every removal; relevants live at selection_order > 6. Returns the class''s current key count. Advisory lock: hashtext(''cks:''||p_class||'':''||p_function). Errors: forbidden/unknown_class/unknown_function/key_set_incomplete.';

-- ---------------------------------------------------------------------------
-- 3. Rank RPCs: OVR reads every selected stat (keys + relevants) and averages
--    the available points; the 6-key config gate stays.
-- ---------------------------------------------------------------------------

${withGrants(lowerCreate(my_report), grants('my_report', ''))}

comment on function public.my_report() is
  'Member rank report (0073): per-stat own value, class average, best (stat_direction-aware), value-proportional points, OVR over EVERY configured stat of the caller''s (class, build-role) config — keys + relevants — ignoring stats without points and requiring at least one point plus the full 6-key set (owner 2026-11-05), and last_validated_at. Key/relevant identity is NEVER serialised here (RNK-02). Exceptions: no_member_claim/forbidden.';

${withGrants(lowerCreate(my_card), grants('my_card', ''))}

comment on function public.my_card() is
  'Member Painel card (0073): char_class/char_function from the JWT, OVR over every configured stat (keys + relevants, available points only, 6-key gate), key_stats = the six card highlights (closed field list), relevant_stat_keys = the live relevants (selection_order > 6). Key/relevant CONFIG is never serialised.';

${withGrants(lowerCreate(class_top5), grants('class_top5', 'p_class text'))}

comment on function public.class_top5(p_class text) is
  'Staff-only top-5-by-OVR preview for a class (0073): same OVR semantics as my_report — every configured stat (keys + relevants) with available points, 6-key gate, n>=3 per-stat gate, floor-51 rescale. Members with insufficient data get ovr null (sorted last). Internal gate: member_role in (officer,owner) AND caller active.';

${withGrants(lowerCreate(role_rank), grants('role_rank', 'p_function text, p_class text'))}

comment on function public.role_rank(p_function text, p_class text) is
  'Staff ranking board (0073): one row per active member of the requested build role, each OVR computed inside the member''s own (class, function) cohort with the 0073 base — keys + relevants, available points only, 6-key gate. Merged groups (Artista) stay first-class. Server-ordered ovr desc nulls last, display_name. Internal gate: member_role in (officer,owner) AND caller active.';

${withGrants(lowerCreate(get_promotion), grants('get_promotion', ''))}

comment on function public.get_promotion() is
  'Members-only Início showcase (0073): one section per meta (class, function) cohort with the TOP 3 by OVR. Highlights remain the six KEY stats (closed field list); OVR itself now averages every configured stat (keys + relevants) with available points. A cohort with fewer than 6 keys has no OVR and drops out of Início until the key set is complete again. Key-stat CONFIG and cohort flags are never serialised.';

${withGrants(lowerCreate(get_promotion_public), `revoke all on function public.get_promotion_public() from public;
grant execute on function public.get_promotion_public() to anon, authenticated;`)}

comment on function public.get_promotion_public() is
  'Public landing Início showcase (0073): identical body to get_promotion with the member gate removed — anon-callable, active members only, top 3 by OVR per meta (class, function) cohort. The 0063 raw-value gate is preserved (value withheld unless the caller is an active member). Highlights remain the six KEY stats; OVR averages every configured stat with available points. Key-stat CONFIG and cohort flags are never serialised.';

${withGrants(lowerCreate(staff_requests), grants('staff_requests', ''))}

comment on function public.staff_requests() is
  'Staff requests board with per-applicant OVR (0073): the applicant''s own (class, function) config must hold 6 keys; every configured stat (keys + relevants) then feeds the value-proportional mean, ignoring stats without points (at least one required). Cohort = active members of the same class/function; the applicant never joins it.';

${withGrants(lowerCreate(ovr_projection), `revoke execute on function public.ovr_projection(uuid, text, text, jsonb, uuid) from public, anon, authenticated;`)}

comment on function public.ovr_projection(uuid, text, text, jsonb, uuid) is
  'Internal review-only OVR projection (0073): the value-proportional formula over EVERY configured stat of the member''s (class, build-role) — keys + relevants — with available points only and the 6-key gate. p_stats optionally overrides the member''s own values; p_exclude_submission removes exactly one row ("OVR before"). No client EXECUTE — called only by the SECURITY DEFINER officer_queue().';

-- ---------------------------------------------------------------------------
-- 4. Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0073', 'ovr_selected_stats_and_key_slots', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
`

const finalSql = migration

writeFileSync(OUT, finalSql)
console.log(`wrote ${OUT} (${finalSql.length} bytes, ${finalSql.split('\n').length} lines)`)
