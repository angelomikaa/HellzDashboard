-- NeoFoot Phase 5 (plan 05-02): the pending-replacement submission lifecycle
-- (D-11/D-12/D-13), shipped as an append-only corrective migration —
-- 0001/0005/0009 are NEVER edited in place (0008 precedent).
--
--   D-11: a new submission marks the player's previous pending row 'discarded'
--         — exactly one pending per player (OCR makes resubmission fast, so
--         duplicate pendings would multiply and pollute the Phase 6 officer
--         validation queue and the rank cohorts before OCR lands on the
--         wizard).
--   D-12: discarded rows leave the rank cohort exactly like rejected ones —
--         my_report and class_top5 never read them. This EXTENDS the Phase 3
--         D-06 semantics (status-only cohort, one definition forever): the
--         cohort filter widens from <> 'rejected' to not in ('rejected',
--         'discarded'). Nothing else about the 0009 rank math changes.
--   D-13 (Phase 6): the officer validation queue UI is untouched here — this
--         migration only makes the status legal and the lifecycle tight.
--
-- INPT-04 preserved: rows are NEVER deleted or overwritten — status is a
-- mark, and submitted_at is untouched, so the full append-only audit trail
-- survives every discard (T-05-06).
--
-- Claim contract (0006 lesson, never violate):
--   auth.jwt()->>'member_role' = 'member'|'officer'|'owner' (guild role)
--   auth.jwt()->>'role'        = 'authenticated' (PostgREST role-switch only)

-- ---------------------------------------------------------------------------
-- 1. Constraint swap: make 'discarded' a legal status. The 0001 check was
--    auto-named by Postgres, so resolve it from the catalog — never hardcode.
-- ---------------------------------------------------------------------------

do $$ declare cn text; begin
  select conname into cn from pg_constraint
  where conrelid = 'submissions'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if cn is null then raise exception 'submissions_status_check_not_found'; end if;
  execute format('alter table submissions drop constraint %I', cn);
end $$;
alter table submissions add constraint submissions_status_check
  check (status in ('pending','validated','rejected','discarded'));

-- ---------------------------------------------------------------------------
-- 2. Column grant (T-05-04): status is the ONLY client-updatable column on
--    submissions. Column-limited — nothing else is touchable through the
--    policy path below (member_id, submitted_at stay server-controlled).
-- ---------------------------------------------------------------------------

grant update (status) on submissions to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS policy: a member may perform exactly ONE transition — own row,
--    pending -> discarded — directly or through the RPC. Not validated, not
--    rejected, not anyone else's row, not back. (T-05-04: validated/rejected
--    and the officers' future queue stay untouched; Phase 6 adds the officer
--    policy.) Matches the 0002/0005 auth.jwt()->>'member_id' extraction.
-- ---------------------------------------------------------------------------

create policy submissions_discard_own_pending on submissions
  for update to authenticated
  using (member_id = (auth.jwt()->>'member_id')::uuid and status = 'pending')
  with check (member_id = (auth.jwt()->>'member_id')::uuid and status = 'discarded');

-- ---------------------------------------------------------------------------
-- 4. create_submission v2 — supersedes 0005's function for the discard step
--    (T-05-05): the member_id is still derived exclusively from the JWT
--    claim; the discard UPDATE is scoped to member_id = v_member and
--    status = 'pending' inside the RPC. Security invoker is kept (0005
--    design), so the new policy gates the discard row by row — the RPC never
--    trusts the caller beyond what RLS already proves.
-- ---------------------------------------------------------------------------

-- Atomic append-only submission (INPT-04). security invoker = default, so the
-- 0002 RLS insert policies (own-rows-only) still apply row by row.
-- 0010 NOTE: supersedes 0005's create_submission for the discard step (D-11
-- one-pending rule) — everything else is the 0005 contract verbatim.
create or replace function create_submission(p_stats jsonb)
returns uuid
language plpgsql
as $$
declare
  v_member uuid;
  v_submission uuid;
begin
  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if jsonb_typeof(p_stats) <> 'array' or jsonb_array_length(p_stats) = 0 then
    raise exception 'empty_stats';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_stats) e
    where not exists (
      select 1 from stat_catalog c where c.stat_key = e->>'stat_key'
    )
  ) then
    raise exception 'unknown_stat_key';
  end if;
  -- D-11 one-pending rule: a new submission discards the player's previous
  -- pending row (status mark only — never a delete, INPT-04). The invoker-RPC
  -- update passes the submissions_discard_own_pending policy row by row.
  update submissions set status = 'discarded'
  where member_id = v_member and status = 'pending';
  insert into submissions (member_id) values (v_member) returning id into v_submission;
  insert into submission_stats (submission_id, stat_key, value)
  select v_submission, e->>'stat_key', (e->>'value')::numeric
  from jsonb_array_elements(p_stats) e;
  return v_submission;
end;
$$;
revoke execute on function create_submission(jsonb) from anon;

-- ---------------------------------------------------------------------------
-- 5. Cohort filters (D-12): my_report and class_top5 v2 — FULL copies of the
--    0009 security-definer shapes (member_role/active gates, tie math,
--    search_path) with exactly ONE line changed in each latest CTE:
--    each latest CTE's status filter widens from the <> 'rejected' form to
--    also exclude 'discarded' (the two changed lines are the ONLY changes).
--    Everything else is behavior-identical — copy, don't paraphrase (0009
--    rank math contract, extended per the header note above).
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
      -- D-06 + D-07: latest value per (member, stat) over non-rejected,
      -- non-discarded submissions (0010/D-12: discarded leaves the cohort
      -- exactly like rejected); per stat, the most recent submission
      -- CONTAINING it.
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
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
  'Member rank report (RNK-02..05): per-stat own value, class average, best, rank-based points (n>=3 only, average-rank ties) and OVR (51 + mean(6 key-stat points) * 48/99, all-6-or-nothing). Identity from the JWT member_id claim only. Key-stat identity is NEVER serialised (RNK-02) — class_key_stats is read internally for OVR only. Cohort excludes rejected AND discarded submissions (0010/D-12 — a discarded pending leaves the cohort exactly like a rejected one). ACCEPTED leak (T-03-10, Pitfall 4): aggregates avg/best can approximate the top player in a small guild, and a determined member could brute-force per-stat points offline — conscious tradeoff; officer validation is the real control.';

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
    -- 0010/D-12: discarded leaves the cohort exactly like rejected.
    select distinct on (sub.member_id, ss.stat_key)
           sub.member_id, ss.stat_key, ss.value
    from submission_stats ss
    join submissions sub on sub.id = ss.submission_id
    where sub.status not in ('rejected','discarded')
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
  'Staff-only top-5-by-OVR preview for a class (D-05). Same OVR semantics as my_report (per-member function cohort, exactly-6 key stats, n>=3, floor-51 rescale). Cohort excludes rejected AND discarded submissions (0010/D-12). Members with insufficient data get ovr null (sorted last). Internal gate: member_role in (officer,owner) AND caller active. Phase 6 promotion page will reuse this RPC.';
