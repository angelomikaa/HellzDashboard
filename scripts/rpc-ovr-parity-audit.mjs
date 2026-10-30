#!/usr/bin/env node
/**
 * NeoFoot read-only OVR parity audit (plan 10.1-02 task 1, UNIF-04) —
 * reproduces the 2026-10-27 investigation against the LIVE project via the
 * Management API Run Query endpoint and reports cross-surface OVR divergence.
 *
 * What it checks (no writes anywhere, no secrets in output):
 *
 *   A. LIVE BODY CENSUS (pg_proc) — the six OVR-producing bodies must carry
 *      the unified math: every OVR gate filters `selection_order <= 6`, the
 *      value-proportional `least(greatest(round(...)))` shape is present, and
 *      ZERO pre-Phase-9 rank-formula markers (`below`/`ties` counting,
 *      `cb.value <`, `ct.value =`) remain. staff_requests additionally must
 *      carry `ks.char_function = r.char_function` (the 0018-era omission
 *      that nulled every applicant OVR). get_promotion/get_promotion_public
 *      are the untouched yardstick (D-10.1-04): their ovr_rows segment is
 *      checked in place (their byte-stable dead cmp CTE is tolerated).
 *      Catches a future partial rewrite (the 0018 failure mode) at the
 *      body level the day it ships.
 *   B. class_key_stats COMBO CENSUS — key_rows / keys (selection_order <= 6)
 *      / relevants (7+) per (class, function); combos with fewer than 6
 *      ordered keys can never produce an OVR (key_set_incomplete).
 *   C. PARITY TABLE — per active member with a character, the OVR each live
 *      body shape computes, independently reproduced from each body's own
 *      cohort/agg/key-read shape (pg_proc-equivalent math):
 *        rank_ovr    role_rank basis   (0036: agg (class,stat) over the
 *                                      member's function board, ag.n >= 3)
 *        card_ovr    my_card basis     (0036: agg (stat) over class+function,
 *                                      coalesce(n,0) >= 3)
 *        report_ovr  my_report basis   (0036: identical shape to my_card)
 *        promo_ovr   get_promotion basis (0029 ovr_rows: agg (class,function,
 *                                      stat), ag.n >= 3) — the canonical
 *                                      reference column
 *        top5_ovr    class_top5 basis  (0036: agg (stat) over the WHOLE class)
 *                                      — INFORMATIONAL ONLY, never gated:
 *                                      its 0028 body is class-wide by
 *                                      design and legitimately diverges the
 *                                      day a class holds two functions with
 *                                      data.
 *        rank_keyed_ovr — diagnostic only: the pre-Phase-9 rank-percentile
 *                                      formula (0024) WITH the missing
 *                                      selection_order <= 6 filter added —
 *                                      what a filter-only fix would have
 *                                      shown (the "before" column).
 *      PASS = for every member the four gated bases are null-consistent AND
 *      exactly equal where non-null (delta 0), and no member the cards can
 *      rate goes null on the Ranking basis (the High Priest defect).
 *   D. STAFF_REQUESTS APPLICANTS — the 0036 applicant-OVR math reproduced per
 *      pending request; a request holding all 6 configured key stats with a
 *      real cohort must rate non-null (the 0014 body could never).
 *
 * Exit 0 = zero divergence; exit 1 = any body marker failure, any cross-basis
 * delta, or any key-filter null regression.
 *
 * Env (session or .env):
 *   SUPABASE_ACCESS_TOKEN / SUPABASE_ACESS_TOKEN  owner management token
 *   SUPABASE_PROJECT_REF (or derived from SUPABASE_URL / VITE_SUPABASE_URL)
 *
 * Modeled on scripts/rpc-ovr-audit.mjs (same mgmtQuery, same env gate).
 */
import { readFileSync } from 'node:fs'

function loadEnvFile() {
  try {
    const raw = readFileSync('.env', 'utf8')
    const env = {}
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2]
    }
    return env
  } catch {
    return {}
  }
}

const envFile = loadEnvFile()
// .env carries the canonical spelling SUPABASE_ACCESS_TOKEN; the historical
// ACESS typo (rpc-ovr-audit.mjs) is kept as a fallback so both work.
const MGMT_TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN || envFile.SUPABASE_ACCESS_TOKEN || envFile.SUPABASE_ACESS_TOKEN
const SUPABASE_URL = process.env.SUPABASE_URL || envFile.VITE_SUPABASE_URL
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF || (SUPABASE_URL ? new URL(SUPABASE_URL).hostname.split('.')[0] : null)

if (!MGMT_TOKEN || !PROJECT_REF) {
  console.error('[audit] missing management token/project ref (SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF)')
  process.exit(1)
}

async function mgmtQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`mgmt query failed: HTTP ${res.status} ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

const num = (v) => (v === null || v === undefined ? null : Number(v))
// Display rounds to 2dp for readability; all PASS/FAIL comparisons use full precision.
const fmt = (v) => (v === null || v === undefined ? 'null' : String(Math.round(Number(v) * 100) / 100))

// ---------------------------------------------------------------------------
// A. Live body census (pg_proc markers)
// ---------------------------------------------------------------------------

// Rank-formula leftovers: the pre-Phase-9 counting vocabulary. Any occurrence
// in a live body means that body still computes (or carries dead text of) the
// rank-percentile formula. `below`/`ties` are the cmp CTE column aliases.
const RANK_LEFTOVERS = ['cb.value <', 'ct.value =', 'below', 'ties']

// Per-body marker contract. must: every marker must appear in live prosrc.
// mustNot: no marker may appear. get_promotion(_public) carry 0029's dead cmp
// (byte-stable yardstick) so they are SEGMENT-checked: only the ovr_rows
// lateral (between 'ovr_rows as (' and 'top5 as (') must be value-proportional.
const BODY_CONTRACT = {
  role_rank: { must: ['selection_order <= 6', 'least(greatest(round('] },
  my_card: { must: ['selection_order <= 6', 'least(greatest(round('] },
  my_report: { must: ['selection_order <= 6', 'least(greatest(', 'round('] },
  class_top5: { must: ['selection_order <= 6', 'least(greatest(', 'round('] },
  staff_requests: { must: ['selection_order <= 6', 'least(greatest(round(', 'ks.char_function = r.char_function'] },
  get_promotion: { segment: true },
  get_promotion_public: { segment: true },
}

console.log('[audit] A. live body census (pg_proc) — unified-math markers')
const procRows = await mgmtQuery(
  `select proname, prosrc from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('role_rank','my_card','my_report','class_top5','staff_requests',
                       'get_promotion','get_promotion_public')
     order by proname;`,
)
const procs = {}
for (const row of procRows ?? []) procs[row.proname] = String(row.prosrc ?? '')

const bodyFailures = []
for (const [name, contract] of Object.entries(BODY_CONTRACT)) {
  const src = procs[name]
  if (src === undefined) {
    console.log(`  ${name.padEnd(22)} MISSING FROM public schema`)
    bodyFailures.push(`${name}: function not found in public schema`)
    continue
  }
  if (contract.segment) {
    // The segment ENDS at the showcase cap CTE. 0037 (Phase 10.2) renamed it
    // top5 -> top3 (top 3 per cohort), so accept either name; the START marker
    // is unchanged. The intent is the same: only the OVR lateral is gated.
    const start = src.indexOf('ovr_rows as (')
    const top3 = start >= 0 ? src.indexOf('top3 as (', start) : -1
    const top5 = start >= 0 ? src.indexOf('top5 as (', start) : -1
    const end = top3 >= 0 ? top3 : top5
    if (start < 0 || end < 0) {
      console.log(`  ${name.padEnd(22)} NO ovr_rows/top3 SEGMENT — not the showcase shape`)
      bodyFailures.push(`${name}: ovr_rows segment not found (showcase cap CTE gone)`)
      continue
    }
    const seg = src.slice(start, end)
    const segOk = seg.includes('least(greatest(') && seg.includes('selection_order <= 6') && !seg.includes('below')
    console.log(`  ${name.padEnd(22)} ovr_rows segment ${segOk ? 'value-proportional + selection_order<=6' : 'DOES NOT CARRY the unified OVR shape'}`)
    if (!segOk) bodyFailures.push(`${name}: ovr_rows segment is not the value-proportional selection_order<=6 shape`)
    continue
  }
  const missing = contract.must.filter((m) => !src.includes(m))
  const leftovers = RANK_LEFTOVERS.filter((m) => src.includes(m))
  const ok = missing.length === 0 && leftovers.length === 0
  console.log(
    `  ${name.padEnd(22)} ${ok ? 'unified (selection_order<=6 + value-proportional, zero rank leftovers)' : `FAIL missing=[${missing.join(' | ')}] rankLeftovers=[${leftovers.join(' | ')}]`}`,
  )
  if (!ok) bodyFailures.push(`${name}: missing=[${missing.join(', ')}] rankLeftovers=[${leftovers.join(', ')}]`)
}

// ---------------------------------------------------------------------------
// B. class_key_stats combo census
// ---------------------------------------------------------------------------

console.log('\n[audit] B. class_key_stats combo census (key_rows / keys<=6 / relevants 7+)')
const census = await mgmtQuery(
  `select class_name, char_function,
          count(*) as key_rows,
          count(*) filter (where selection_order <= 6) as keys_le6,
          count(*) filter (where selection_order > 6) as relevants_gt6
     from class_key_stats
    group by class_name, char_function
    order by class_name, char_function;`,
)
const incompleteCombos = []
for (const row of census ?? []) {
  const incomplete = Number(row.keys_le6) !== 6
  if (incomplete) incompleteCombos.push(`${row.class_name}/${row.char_function} (${row.keys_le6} keys)`)
  console.log(
    `  ${(row.class_name + '/' + row.char_function).padEnd(28)} key_rows=${row.key_rows} keys<=6=${row.keys_le6} relevants7+=${row.relevants_gt6}${incomplete ? '  < key_set_incomplete: OVR impossible' : ''}`,
  )
}

// ---------------------------------------------------------------------------
// C. Parity table — the four gated bases reproduced from each body's shape
// ---------------------------------------------------------------------------

const LATEST_CTE = `
  latest as (
    select distinct on (sub.member_id, ss.stat_key)
           sub.member_id, ss.stat_key, ss.value
    from submission_stats ss
    join submissions sub on sub.id = ss.submission_id
    where sub.status not in ('rejected','discarded')
    order by sub.member_id, ss.stat_key, sub.submitted_at desc
  )`

const parityRows = await mgmtQuery(
  `with ${LATEST_CTE},
  audited as (
    select m.id, m.display_name, m.char_class, m.char_function
    from members m
    where m.active and m.char_class is not null
  ),
  cohort as (
    select l.member_id, l.stat_key, l.value, a.char_class, a.char_function
    from latest l
    join audited a on a.id = l.member_id
  )
  select
    a.id as member_id, a.display_name, a.char_class, a.char_function,

    -- [1] role_rank basis (0036 body): agg (char_class, stat_key) over the
    --     member's own function board, gate ag.n >= 3, keys class+function+<=6
    (select case when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99 end
     from (
       select case when ag.n >= 3 and o.value is not null then
                least(greatest(round(
                  case c.stat_direction
                    when 'lower' then o.value / nullif(ag.min_v, 0)
                    else o.value / nullif(ag.max_v, 0)
                  end * 99, 2), 0), 99)
              end as p
       from class_key_stats ks
       join stat_catalog c on c.stat_key = ks.stat_key
       left join latest o on o.stat_key = ks.stat_key and o.member_id = a.id
       left join (
         select char_class, stat_key, count(*) as n, max(value) as max_v, min(value) as min_v
         from cohort k
         where k.char_class = a.char_class and k.char_function = a.char_function
         group by char_class, stat_key
       ) ag on ag.stat_key = ks.stat_key and ag.char_class = a.char_class
       where ks.class_name = a.char_class
         and ks.char_function = a.char_function
         and ks.selection_order <= 6
     ) kp) as rank_ovr,

    -- [2] key-filtered rank-basis (0024 formula + selection_order <= 6) —
    --     diagnostic "before" column only, never gated
    (select case when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99 end
     from (
       select case when c.n >= 3 then
                (c.below + (c.ties - 1)::numeric / 2) / (c.n - 1) * 99
              end as p
       from class_key_stats ks
       join lateral (
         select count(*) as n,
                count(*) filter (where k.value < ov.value) as below,
                count(*) filter (where k.value = ov.value) as ties
         from cohort k
         join latest ov on ov.member_id = a.id and ov.stat_key = ks.stat_key
         where k.stat_key = ks.stat_key
           and k.char_class = a.char_class
           and k.char_function = a.char_function
       ) c on true
       where ks.class_name = a.char_class
         and ks.char_function = a.char_function
         and ks.selection_order <= 6
     ) kp) as rank_keyed_ovr,

    -- [3] my_card basis (0036 body): agg (stat_key) over class+function,
    --     gate coalesce(n,0) >= 3, keys class+function+<=6
    (select case when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99 end
     from (
       select case when coalesce(ag.n, 0) >= 3 and o.value is not null then
                least(greatest(round(
                  case c.stat_direction
                    when 'lower' then o.value / nullif(ag.min_v, 0)
                    else o.value / nullif(ag.max_v, 0)
                  end * 99, 2), 0), 99)
              end as p
       from class_key_stats ks
       join stat_catalog c on c.stat_key = ks.stat_key
       left join latest o on o.stat_key = ks.stat_key and o.member_id = a.id
       left join (
         select stat_key, count(*) as n, max(value) as max_v, min(value) as min_v
         from cohort k
         where k.char_class = a.char_class and k.char_function = a.char_function
         group by stat_key
       ) ag on ag.stat_key = ks.stat_key
       where ks.class_name = a.char_class
         and ks.char_function = a.char_function
         and ks.selection_order <= 6
     ) kp) as card_ovr,

    -- [4] my_report basis (0036 body): identical shape to my_card (independent
    --     recompute — proves the sibling bodies agree)
    (select case when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99 end
     from (
       select case when coalesce(ag.n, 0) >= 3 and o.value is not null then
                least(greatest(
                  round(
                    case c.stat_direction
                      when 'lower' then o.value / nullif(ag.min_v, 0)
                      else o.value / nullif(ag.max_v, 0)
                    end * 99, 2),
                  0), 99)
              end as p
       from class_key_stats ks
       join stat_catalog c on c.stat_key = ks.stat_key
       left join latest o on o.stat_key = ks.stat_key and o.member_id = a.id
       left join (
         select stat_key, count(*) as n, max(value) as max_v, min(value) as min_v
         from cohort k
         where k.char_class = a.char_class and k.char_function = a.char_function
         group by stat_key
       ) ag on ag.stat_key = ks.stat_key
       where ks.class_name = a.char_class
         and ks.char_function = a.char_function
         and ks.selection_order <= 6
     ) kp) as report_ovr,

    -- [5] get_promotion basis (0029 ovr_rows): agg (class, function, stat),
    --     gate ag.n >= 3 — the canonical reference column
    (select case when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99 end
     from (
       select case when ag.n >= 3 and o.value is not null then
                least(greatest(
                  round(
                    case c.stat_direction
                      when 'lower' then o.value / nullif(ag.min_v, 0)
                      else o.value / nullif(ag.max_v, 0)
                    end * 99, 2),
                  0), 99)
              end as p
       from class_key_stats ks
       join stat_catalog c on c.stat_key = ks.stat_key
       left join latest o on o.stat_key = ks.stat_key and o.member_id = a.id
       left join (
         select char_class, char_function, stat_key,
                count(*) as n, max(value) as max_v, min(value) as min_v
         from cohort k
         where k.char_class = a.char_class and k.char_function = a.char_function
         group by char_class, char_function, stat_key
       ) ag on ag.stat_key = ks.stat_key
           and ag.char_class = a.char_class
           and ag.char_function = a.char_function
       where ks.class_name = a.char_class
         and ks.char_function = a.char_function
         and ks.selection_order <= 6
     ) kp) as promo_ovr,

    -- [6] class_top5 basis (0036 body): agg (stat_key) over the WHOLE class —
    --     informational only (0028 class-wide cohort is by design)
    (select case when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99 end
     from (
       select case when ag.n >= 3 and o.value is not null then
                least(greatest(
                  round(
                    case c.stat_direction
                      when 'lower' then o.value / nullif(ag.min_v, 0)
                      else o.value / nullif(ag.max_v, 0)
                    end * 99, 2),
                  0), 99)
              end as p
       from class_key_stats ks
       join stat_catalog c on c.stat_key = ks.stat_key
       left join latest o on o.stat_key = ks.stat_key and o.member_id = a.id
       left join (
         select stat_key, count(*) as n, max(value) as max_v, min(value) as min_v
         from cohort k
         where k.char_class = a.char_class
         group by stat_key
       ) ag on ag.stat_key = ks.stat_key
       where ks.class_name = a.char_class
         and ks.char_function = a.char_function
         and ks.selection_order <= 6
     ) kp) as top5_ovr,

    -- diagnostics
    (select count(*) from class_key_stats ks
      where ks.class_name = a.char_class
        and ks.char_function = a.char_function
        and ks.selection_order <= 6) as keys_configured,
    (select count(*) from latest l where l.member_id = a.id) as stat_rows
  from audited a
  order by a.char_class, a.char_function, a.display_name;`,
)

const parityFailures = []
const members = (parityRows ?? []).map((r) => ({
  member_id: r.member_id,
  display_name: r.display_name,
  char_class: r.char_class,
  char_function: r.char_function,
  rank_ovr: num(r.rank_ovr),
  rank_keyed_ovr: num(r.rank_keyed_ovr),
  card_ovr: num(r.card_ovr),
  report_ovr: num(r.report_ovr),
  promo_ovr: num(r.promo_ovr),
  top5_ovr: num(r.top5_ovr),
  keys_configured: Number(r.keys_configured),
  stat_rows: Number(r.stat_rows),
}))

console.log(`\n[audit] C. parity table (${members.length} active members with a character)`)
console.log(
  '  display_name            class/function               rank    rank0024+f card    report   promo   delta   status',
)
for (const m of members) {
  const bases = {
    rank: m.rank_ovr,
    card: m.card_ovr,
    report: m.report_ovr,
    promo: m.promo_ovr,
  }
  const vals = Object.values(bases)
  const nonNull = vals.filter((v) => v !== null)
  let status
  let delta = null
  if (m.promo_ovr === null) {
    status = nonNull.length === 0 ? 'OK_NULL' : 'REVERSE_DIVERGENCE'
    if (nonNull.length > 0) {
      parityFailures.push(
        `${m.display_name} (${m.char_class}/${m.char_function}): promo basis null but a gated basis rates non-null`,
      )
    }
  } else if (nonNull.length !== 4) {
    status = 'NULL_REGRESSION'
    const nullBases = Object.entries(bases)
      .filter(([, v]) => v === null)
      .map(([k]) => k)
    parityFailures.push(
      `${m.display_name} (${m.char_class}/${m.char_function}): cards rate ${m.promo_ovr} but basis(es) [${nullBases.join(', ')}] went null (key-filter regression)`,
    )
  } else if (nonNull.every((v) => v === nonNull[0])) {
    status = 'OK'
    delta = 0
  } else {
    status = 'DIVERGED'
    delta = Number((m.rank_ovr - m.promo_ovr).toFixed(4))
    parityFailures.push(
      `${m.display_name} (${m.char_class}/${m.char_function}): rank=${m.rank_ovr} card=${m.card_ovr} report=${m.report_ovr} promo=${m.promo_ovr} (delta ${delta})`,
    )
  }
  const combo = `${m.char_class}/${m.char_function}`
  console.log(
    `  ${String(m.display_name).padEnd(24)} ${combo.padEnd(28)} ${fmt(m.rank_ovr).padStart(6)} ${fmt(m.rank_keyed_ovr).padStart(11)} ${fmt(m.card_ovr).padStart(6)} ${fmt(m.report_ovr).padStart(7)} ${fmt(m.promo_ovr).padStart(7)} ${fmt(delta).padStart(7)}   ${status}`,
  )
}

const ovrCapable = members.filter((m) => m.promo_ovr !== null)
const hpMembers = ovrCapable.filter((m) => m.char_class === 'High Priest' && m.char_function === 'suporte')
const hpRanked = hpMembers.filter((m) => m.rank_ovr !== null)
console.log(
  `\n  OVR-capable members: ${ovrCapable.length}/${members.length}; Ranking-basis OVR present for ${hpRanked.length}/${hpMembers.length} High Priest/suporte members (the null defect must be gone)`,
)

// ---------------------------------------------------------------------------
// D. staff_requests applicant OVRs (0036 math, per pending request)
// ---------------------------------------------------------------------------

console.log('\n[audit] D. staff_requests applicant OVRs (pending queue)')
const applicantRows = await mgmtQuery(
  `with ${LATEST_CTE},
  cohort_agg as (
    select char_class, char_function, stat_key,
           count(*) as n, max(value) as max_v, min(value) as min_v
    from (
      select l.member_id, l.stat_key, l.value, m.char_class, m.char_function
      from latest l
      join members m on m.id = l.member_id
      where m.active and m.char_class is not null
    ) c
    group by char_class, char_function, stat_key
  )
  select r.id as request_id, r.nickname, r.char_class, r.char_function,
    (select count(*) from class_key_stats ks
      where ks.class_name = r.char_class
        and ks.char_function = r.char_function
        and ks.selection_order <= 6) as keys_configured,
    (select count(*) from membership_request_stats rq
      join class_key_stats ks
        on ks.class_name = r.char_class
       and ks.char_function = r.char_function
       and ks.selection_order <= 6
       and ks.stat_key = rq.stat_key
      where rq.request_id = r.id) as key_stats_held,
    (select min(ag.n) from class_key_stats ks
      left join cohort_agg ag
        on ag.stat_key = ks.stat_key
       and ag.char_class = r.char_class
       and ag.char_function = r.char_function
      where ks.class_name = r.char_class
        and ks.char_function = r.char_function
        and ks.selection_order <= 6) as cohort_n_min,
    (select case when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99 end
     from (
       select case when coalesce(ag.n, 0) >= 3 and rq.value is not null then
                least(greatest(round(
                  case sc.stat_direction
                    when 'lower' then rq.value / nullif(ag.min_v, 0)
                    else rq.value / nullif(ag.max_v, 0)
                  end * 99, 2), 0), 99)
              end as p
       from class_key_stats ks
       join stat_catalog sc on sc.stat_key = ks.stat_key
       left join membership_request_stats rq
         on rq.request_id = r.id and rq.stat_key = ks.stat_key
       left join cohort_agg ag
         on ag.stat_key = ks.stat_key
        and ag.char_class = r.char_class
        and ag.char_function = r.char_function
       where ks.class_name = r.char_class
         and ks.char_function = r.char_function
         and ks.selection_order <= 6
     ) kp) as applicant_ovr
  from membership_requests r
  where r.status = 'pending'
  order by r.created_at desc;`,
)

const applicantFailures = []
if ((applicantRows ?? []).length === 0) {
  console.log('  0 pending requests (queue empty — no applicant OVR to verify; body state gated in section A)')
} else {
  for (const r of applicantRows ?? []) {
    const ovr = num(r.applicant_ovr)
    console.log(
      `  ${String(r.nickname).padEnd(24)} ${String(r.char_class + '/' + r.char_function).padEnd(28)} keys=${r.keys_configured} held=${r.key_stats_held} cohort_n_min=${fmt(num(r.cohort_n_min))} ovr=${fmt(ovr)}`,
    )
    // The 0014 defect shape: request holds all 6 configured key stats over a
    // real cohort (n>=3) but the OVR still went null (the count(*) = 18 gate).
    // A starved cohort (n<3) rates null legitimately — never flagged.
    if (Number(r.keys_configured) === 6 && Number(r.key_stats_held) === 6 && Number(r.cohort_n_min) >= 3 && ovr === null) {
      applicantFailures.push(
        `${r.nickname} (${r.char_class}/${r.char_function}): holds all 6 key stats over a real cohort but applicant OVR is null`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

if (incompleteCombos.length > 0) {
  console.log(
    `\n[audit] note: ${incompleteCombos.length} combo(s) have fewer than 6 ordered keys configured (OVR impossible for their members — admin config matter, not a rating fork): ${incompleteCombos.join('; ')}`,
  )
}

const totalFailures = [...bodyFailures, ...parityFailures, ...applicantFailures]
console.log('\n[audit] verdict')
if (totalFailures.length === 0) {
  console.log(
    `PARITY AUDIT PASSED — ${members.length} members, ${ovrCapable.length} OVR-capable, 0 cross-surface divergences, 0 key-filter null regressions, ${hpRanked.length}/${hpMembers.length} High Priest/suporte ranked`,
  )
} else {
  console.log(`PARITY AUDIT FAILED (${totalFailures.length}):`)
  for (const f of totalFailures) console.log(`  - ${f}`)
  process.exit(1)
}
