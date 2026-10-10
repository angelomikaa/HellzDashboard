-- NeoFoot Phase 3 (plan 03-03): the rank engine — key-stat write RPC, member
-- report RPC, staff top-5 preview RPC. All SECURITY DEFINER with internal
-- role+active checks, compute-on-read (no stored ranks, no triggers).
--
-- NOTE: the plan drafted this as "0008_rank_engine.sql", but 0008 was taken
-- by 03-02's 42P17 recursion fix (0008_staff_active_check_fix.sql) — the CLI
-- rejects duplicate version numbers, so this file is 0009_rank_engine.sql
-- (same content; orchestrator pre-authorized the renumber, 0005 precedent).
--
-- Rank math contract (src/lib/rankMath.ts, plan 03-01 — the SQL must agree to
-- the decimal; live-verified by scripts/smoke-rank.mjs):
--   points = ((countBelow + countTiesOthers/2) / (n-1)) * 99, n >= 3, ties = average-rank
--   OVR    = 51 + mean(exactly 6 key-stat points) * 48.0/99  (linear rescale, floor 51)
--   cohort = latest value per (member, stat) over submissions with status <> 'rejected'
--            (D-06: status-only; member active-ness is NOT part of the cohort)
--
-- Claim contract (0006 lesson, never violate):
--   auth.jwt()->>'member_role' = 'member'|'officer'|'owner' (guild role)
--   auth.jwt()->>'role'        = 'authenticated' (PostgREST role-switch only)

-- ---------------------------------------------------------------------------
-- 1. Staff read policy on class_key_stats (first-ever read path; RNK-01).
--    Members stay denied: deny-all RLS is preserved — this policy only
--    matches active staff (D-03 + D-14). The exists-subquery targets members
--    (NOT the guarded table), and every members policy resolves without
--    subquerying members (0008 rebuilt the staff ones on the SECURITY
--    DEFINER helper), so there is no 42P17 recursion (03-02 live lesson).
-- ---------------------------------------------------------------------------

grant select on class_key_stats to authenticated;  -- idempotent; RLS still filters rows

drop policy if exists staff_select_key_stats on class_key_stats;
create policy staff_select_key_stats on class_key_stats
  for select to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active));

-- ---------------------------------------------------------------------------
-- 2. Index for latest-per-(member,stat) resolution (D-07: most recent
--    submission CONTAINING the stat — covers legacy rows missing Special).
-- ---------------------------------------------------------------------------

create index idx_submissions_member_time on submissions(member_id, submitted_at desc);

-- ---------------------------------------------------------------------------
-- 3. set_key_stat — staff-only key-stat toggle with race-proof block-at-7.
--    (RNK-01, D-02, D-03; T-03-08 elevated-privilege + T-03-12 race.)
-- ---------------------------------------------------------------------------

create or replace function public.set_key_stat(p_class text, p_stat_key text, p_enabled boolean)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Internal gate FIRST (D-03 + D-14): officer/owner claim AND the caller's
  -- live active flag — deactivation revokes access immediately, not at token
  -- expiry. SECURITY DEFINER runs as the owner, so this subquery bypasses RLS
  -- (no policy recursion is possible inside the function).
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
  -- unknown stat_key: the class_key_stats FK to stat_catalog raises naturally.

  -- CR-01 atomicity lesson (T-03-12): serialize toggles per class so two
  -- concurrent officers cannot both pass the count<6 check and produce a 7th row.
  perform pg_advisory_xact_lock(hashtext('cks:' || p_class));

  if p_enabled then
    -- D-02: block at 7 — a 7th key stat is rejected until one is removed.
    -- Classes may legitimately hold fewer than 6 mid-configuration.
    if (select count(*) from class_key_stats where class_name = p_class) >= 6 then
      raise exception 'key_stat_limit';
    end if;
    insert into class_key_stats (class_name, stat_key)
    values (p_class, p_stat_key)
    on conflict (class_name, stat_key) do nothing;
  else
    delete from class_key_stats
    where class_name = p_class and stat_key = p_stat_key;
  end if;

  return (select count(*) from class_key_stats where class_name = p_class);
end;
$$;

comment on function public.set_key_stat(text, text, boolean) is
  'Staff-only key-stat toggle (RNK-01, D-02/D-03/D-14). p_enabled=true adds (blocks at a 7th with key_stat_limit, advisory-lock race-proof); p_enabled=false removes. Returns the class''s current key-stat count. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 4. my_report — THE member contract Phase 4 renders (RNK-02..RNK-05).
--    SECURITY DEFINER: reads every member's submissions + class_key_stats
--    internally. ABSOLUTE RULE (RNK-02 / T-03-09): key-stat identity NEVER
--    appears in the returned JSON — no key_stats field, no per-stat is_key
--    flag; key stats only influence OVR internally.
-- ---------------------------------------------------------------------------

create or replace function public.my_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid;
  v_class text;
  v_function text;
begin
  -- Identity from the JWT only (T-03-11): no client-supplied player id.
  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;

  select m.char_class, m.char_function into v_class, v_function
  from members m
  where m.id = v_member;

  return (
    with latest as (
      -- D-06 + D-07: latest value per (member, stat) over non-rejected
      -- submissions; per stat, the most recent submission CONTAINING it.
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status <> 'rejected'
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    cohort as (
      -- D-06: same class AND same function; members with null char_class are
      -- excluded from every cohort (a null-class caller gets own values but
      -- null aggregates/points/OVR — explicit unclassed handling).
      select l.member_id, l.stat_key, l.value
      from latest l
      join members m on m.id = l.member_id
      where m.char_class = v_class and m.char_function = v_function
    ),
    agg as (
      select stat_key, count(*) as n, avg(value) as avg_v, max(value) as max_v
      from cohort
      group by stat_key
    )
    select jsonb_build_object(
      'char_class', v_class,
      'char_function', v_function,
      'stats', (
        -- All 57 catalog entries (D-13: values are NOT omitted when data is
        -- insufficient — only points are). Points = 03-01 formula; ties
        -- include the caller's own entry, hence (ties - 1) as others-based.
        select jsonb_agg(
          jsonb_build_object(
            'stat_key', c.stat_key,
            'label', c.label,
            'group_name', c.group_name,
            'value_type', c.value_type,
            'own_value', o.value,
            'class_average', a.avg_v,
            'best', a.max_v,
            'points', case
              when coalesce(a.n, 0) >= 3 and o.value is not null then
                round(
                  (
                    (select count(*) from cohort cb
                      where cb.stat_key = c.stat_key and cb.value < o.value)
                    + ((select count(*) from cohort ct
                          where ct.stat_key = c.stat_key and ct.value = o.value) - 1)::numeric / 2
                  ) / (a.n - 1) * 99, 2)
            end,
            'data_sufficient', coalesce(a.n, 0) >= 3
          )
          order by c.group_name, c.label
        )
        from stat_catalog c
        left join latest o on o.stat_key = c.stat_key and o.member_id = v_member
        left join agg a on a.stat_key = c.stat_key
      ),
      'ovr', (
        -- D-09/D-10/D-11/D-12: OVR only when the class has exactly 6 key
        -- stats, the caller has all 6, and each has n >= 3. Unrounded output;
        -- per-stat points stay unrounded here too (03-01 spec semantics).
        select jsonb_build_object(
          'value', case
            when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
          end,
          'data_sufficient', count(*) = 6 and count(p) = 6
        )
        from (
          select case
            when coalesce(a.n, 0) >= 3 and o.value is not null then
              (
                (select count(*) from cohort cb
                  where cb.stat_key = ks.stat_key and cb.value < o.value)
                + ((select count(*) from cohort ct
                      where ct.stat_key = ks.stat_key and ct.value = o.value) - 1)::numeric / 2
              ) / (a.n - 1) * 99
          end as p
          from class_key_stats ks
          left join latest o on o.stat_key = ks.stat_key and o.member_id = v_member
          left join agg a on a.stat_key = ks.stat_key
          where ks.class_name = v_class
        ) kp
      )
    )
  );
end;
$$;

comment on function public.my_report() is
  'Member rank report (RNK-02..05): per-stat own value, class average, best, rank-based points (n>=3 only, average-rank ties) and OVR (51 + mean(6 key-stat points) * 48/99, all-6-or-nothing). Identity from the JWT member_id claim only. Key-stat identity is NEVER serialised (RNK-02) — class_key_stats is read internally for OVR only. ACCEPTED leak (T-03-10, Pitfall 4): aggregates avg/best can approximate the top player in a small guild, and a determined member could brute-force per-stat points offline — conscious tradeoff; officer validation is the real control.';

-- ---------------------------------------------------------------------------
-- 5. class_top5 — staff-only OVR preview (D-05; Phase 6 promotion page will
--    reuse it). Computes each class member's OVR with the SAME semantics as
--    my_report (per-member char_function cohort within the class). Preview
--    reflects the CURRENT config: toggles apply instantly (compute-on-read);
--    officers sanity-check by viewing it after changes.
-- ---------------------------------------------------------------------------

create or replace function public.class_top5(p_class text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  -- Staff-only (D-05 — never member-invocable) with the D-14 active check.
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

  with latest as (
    select distinct on (sub.member_id, ss.stat_key)
           sub.member_id, ss.stat_key, ss.value
    from submission_stats ss
    join submissions sub on sub.id = ss.submission_id
    where sub.status <> 'rejected'
    order by sub.member_id, ss.stat_key, sub.submitted_at desc
  ),
  class_members as (
    -- D-06: rank math ignores active-ness, so the ranked list and the value
    -- cohorts include every class member (status-only cohort definition,
    -- one definition forever). Phase 6 may filter the displayed list.
    select m.id, m.display_name, m.char_function
    from members m
    where m.char_class = p_class
  ),
  cohort as (
    select l.member_id, l.stat_key, l.value, cm.char_function
    from latest l
    join class_members cm on cm.id = l.member_id
  ),
  cmp as (
    -- Per (member, stat): n = members of the SAME function holding the stat;
    -- below/ties vs the member's own latest value (ties include the member).
    select a.member_id, a.stat_key,
           count(*) as n,
           count(*) filter (where b.value < a.value) as below,
           count(*) filter (where b.value = a.value) as ties
    from cohort a
    join cohort b on b.stat_key = a.stat_key and b.char_function = a.char_function
    group by a.member_id, a.stat_key
  )
  select coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'display_name', t.display_name,
        'char_function', t.char_function,
        'ovr', t.ovr
      )
      order by t.ovr desc nulls last, t.display_name
    )
    from (
      select cm.display_name, cm.char_function, o.ovr
      from class_members cm
      cross join lateral (
        -- Same OVR semantics as my_report: exactly-6 key stats (D-02: an
        -- incomplete config yields count(*) < 6 -> ovr null), member holds
        -- all 6, each with n >= 3.
        select case
          when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
        end as ovr
        from (
          select case
            when c.n >= 3 then
              (c.below + (c.ties - 1)::numeric / 2) / (c.n - 1) * 99
          end as p
          from class_key_stats ks
          join cmp c on c.member_id = cm.id and c.stat_key = ks.stat_key
          where ks.class_name = p_class
        ) kp
      ) o
      order by o.ovr desc nulls last, cm.display_name
      limit 5
    ) t
  ), '[]'::jsonb)
  into v_rows;

  return v_rows;
end;
$$;

comment on function public.class_top5(text) is
  'Staff-only top-5-by-OVR preview for a class (D-05). Same OVR semantics as my_report (per-member function cohort, exactly-6 key stats, n>=3, floor-51 rescale). Members with insufficient data get ovr null (sorted last). Internal gate: member_role in (officer,owner) AND caller active. Phase 6 promotion page will reuse this RPC.';

-- ---------------------------------------------------------------------------
-- 6. EXECUTE hygiene (WR-02 lesson): Postgres grants function EXECUTE to
--    PUBLIC at creation — revoke from public/anon, grant to authenticated.
--    PostgREST calls functions as authenticated; membership is enforced
--    INSIDE each function (and by RLS for the staff policy above).
-- ---------------------------------------------------------------------------

revoke execute on function set_key_stat(text, text, boolean) from public, anon;
grant  execute on function set_key_stat(text, text, boolean) to authenticated;

revoke execute on function my_report() from public, anon;
grant  execute on function my_report() to authenticated;

revoke execute on function class_top5(text) from public, anon;
grant  execute on function class_top5(text) to authenticated;
