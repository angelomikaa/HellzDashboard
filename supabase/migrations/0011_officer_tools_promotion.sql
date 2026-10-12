-- NeoFoot Phase 6 (plan 06-01): officer trust tools + the promotion payload,
-- shipped as an append-only corrective migration — 0001–0010 are NEVER edited
-- in place (0008 precedent).
--
--   AUTH-05: officer_queue() — staff-only read of EVERY pending submission
--            (all 57 values); set_submission_status() — validate/reject.
--   AUTH-03: set_member_role() — owner-only role grants/revocations (D-10:
--            effective at next login; no path grants 'owner').
--   AUTH-04: set_member_active() — role-differentiated deactivation/reactiv-
--            ation in ONE definer RPC (permissive RLS policies OR together
--            and cannot express these target rules — RESEARCH Area 3).
--   SHWC-02: get_promotion() — member-invocable top-5-by-OVR cards with
--            top-6-by-points highlight stats (RNK-02 closed-list payload).
--   D-07:    my_report/class_top5 superseded v3 — active members only in
--            every rank cohort (compute-on-read: rejected/inactive rows
--            leave the cohort instantly).
--   D-09:    class creation flips owner-only (folded 03-04 owner directive —
--            structural change must never be officer-reachable).
--
-- D-06 SUPERSESSION NOTE: 03-CONTEXT D-06 / 0009:14-15 declared the cohort
-- status-only and "member active-ness is NOT part of the cohort"; 06-CONTEXT
-- D-07 AMENDS this — active members only in every cohort (my_report cohort
-- CTE, class_top5 class_members CTE, get_promotion). Do not "fix" this back.
--
-- Claim contract (0006 lesson, never violate):
--   auth.jwt()->>'member_role' = 'member'|'officer'|'owner' (guild role)
--   auth.jwt()->>'role'        = 'authenticated' (PostgREST role-switch only)

-- ---------------------------------------------------------------------------
-- 1. is_active_owner() helper — owner-only policy/rpc primitive. Modeled on
--    is_active_staff_member() (0008:29-42) but deliberately NOT reusing it:
--    that helper matches officers too, and role grants + class creation are
--    OWNER-only surfaces (D-08/D-09).
-- ---------------------------------------------------------------------------

create or replace function public.is_active_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.id::text = auth.jwt()->>'member_id'
      and m.active
      and auth.jwt()->>'member_role' = 'owner'
  );
$$;

comment on function public.is_active_owner() is
  'Caller is an active owner (guild member_role claim = owner AND live active row). Owner-only primitive for AUTH-03 role grants and the D-09 owner-only class-creation policy — NOT is_active_staff_member(), which matches officers too.';

-- The helper is an internal policy/rpc primitive, not a client API: anon/public
-- get no execute; authenticated needs it because policies run as the caller.
revoke execute on function public.is_active_owner() from public, anon;
grant execute on function public.is_active_owner() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. officer_queue() — the ONLY staff read surface for pending submissions
--    (AUTH-05 / T-06-01). No staff SELECT policy is added to submissions or
--    submission_stats: the definer RPC is the narrow read. Returns ALL
--    pending rows newest-first with the full 57-stat payload per submission.
-- ---------------------------------------------------------------------------

create or replace function public.officer_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Staff gate verbatim (0009:62-68): officer/owner claim AND live active row.
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'submission_id', s.id,
        'submitted_at', s.submitted_at,
        'display_name', m.display_name,
        'discord_handle', m.discord_handle,
        'char_class', m.char_class,
        'char_function', m.char_function,
        'stats', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'stat_key', sc.stat_key,
              'label', sc.label,
              'group_name', sc.group_name,
              'value_type', sc.value_type,
              'value', ss.value
            )
            order by sc.group_name, sc.label
          ), '[]'::jsonb)
          from submission_stats ss
          join stat_catalog sc on sc.stat_key = ss.stat_key
          where ss.submission_id = s.id
        )
      )
      order by s.submitted_at desc
    )
    from submissions s
    join members m on m.id = s.member_id
    where s.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

comment on function public.officer_queue() is
  'Staff-only validation queue (AUTH-05): ALL pending submissions newest-first, each with submitter identity and the full 57-stat payload (stat_key/label/group_name/value_type/value, ordered group_name+label for the Geral/Quasi/Especial grouping). Read-only — validation flips happen via set_submission_status. Empty queue returns [] (never null). Internal gate: member_role in (officer,owner) AND caller active. No staff SELECT policy exists on submissions/submission_stats — this RPC is the only officer read surface (T-06-01).';

-- ---------------------------------------------------------------------------
-- 3. set_submission_status() — officer validate/reject (AUTH-05 / T-06-02).
--    Status mark ONLY (append-only contract, 0010 header): member_id and
--    submitted_at are never touched, rows are never deleted. UPDATE is
--    scoped to status = 'pending' and 0 affected rows raise 'not_pending'
--    (Pitfall 9 — a two-officer race must not silently no-op; PostgREST
--    answers zero-row UPDATEs with 204, not an error — 05-02 lesson).
--    Officer validating their own pending row is ALLOWED (small guild,
--    recoverable by resubmission — 06-RESEARCH Open Question 2, locked).
-- ---------------------------------------------------------------------------

create or replace function public.set_submission_status(p_submission uuid, p_status text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Staff gate verbatim (0009:62-68).
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if p_status not in ('validated', 'rejected') then
    raise exception 'invalid_status';
  end if;

  update submissions set status = p_status
  where id = p_submission and status = 'pending';

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'not_pending';
  end if;

  return v_count;
end;
$$;

comment on function public.set_submission_status(uuid, text) is
  'Officer validate/reject (AUTH-05). p_status is whitelisted to validated/rejected (else invalid_status); the UPDATE is scoped to status=pending and 0 rows raise not_pending (two-officer race can never silently no-op). Status mark ONLY — append-only preserved (member_id/submitted_at untouched, no deletes). Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 4. set_member_role() — OWNER-only role grant/revoke (AUTH-03 / T-06-03).
--    No path grants 'owner' (owner identity is seeded); owner rows are
--    immutable targets (D-08). The role column is ungranted for client
--    UPDATE (0005), so this RPC is the only write path. D-10: the change
--    takes effect at NEXT LOGIN — verify-pin mints member_role from
--    members.role at login (no Edge Function change). A demoted officer's
--    outstanding 7-day JWT keeps staff claims until then (T-06-09, accept):
--    deactivation via set_member_active is the immediate kill-switch.
-- ---------------------------------------------------------------------------

create or replace function public.set_member_role(p_member uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Owner-only caller gate (D-08): guild member_role claim = owner AND the
  -- caller's live active row (via the is_active_owner() definer primitive).
  if coalesce(auth.jwt()->>'member_role', '') <> 'owner'
     or not public.is_active_owner() then
    raise exception 'forbidden';
  end if;

  -- Officers may be granted/revoked; 'owner' is never grantable (seeded only).
  if p_role not in ('member', 'officer') then
    raise exception 'invalid_role';
  end if;

  -- Owner rows can never be demoted (D-08): the target must be an ordinary
  -- member/officer row; a missing row is equally forbidden.
  if not exists (
    select 1 from members m
    where m.id = p_member and m.role in ('member', 'officer')
  ) then
    raise exception 'forbidden';
  end if;

  update members set role = p_role where id = p_member;
end;
$$;

comment on function public.set_member_role(uuid, text) is
  'OWNER-only role grant/revoke (AUTH-03). p_role restricted to member/officer — no path grants owner (seeded identity); owner rows are immutable targets (D-08). Role column is ungranted for client UPDATE (0005) so this definer RPC is the only write path. D-10: effective at NEXT login (verify-pin mints member_role from members.role); deactivation is the immediate kill-switch for stale staff tokens.';

-- ---------------------------------------------------------------------------
-- 5. set_member_active() — role-differentiated removal/reactivation
--    (AUTH-04 / T-06-04). Imperative TARGET rules in ONE definer RPC —
--    permissive RLS policies OR together and cannot express this (RESEARCH
--    Area 3). No new policies ON members are created (42P17, 0007->0008):
--    the definer bypasses RLS by design. Rules:
--      (a) self-deactivation blocked (lockout guard);
--      (b) missing target row -> forbidden;
--      (c) owner rows untouchable (D-08);
--      (d) officers touch only ordinary member rows; the owner also touches
--          officer rows.
--    Same RPC reactivates (p_active = true) under identical target rules.
--    Deactivation revokes minted tokens INSTANTLY via the 0004/0008 active
--    checks in every RLS policy and RPC gate; rows are never deleted
--    (append-only).
-- ---------------------------------------------------------------------------

create or replace function public.set_member_active(p_member uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
begin
  -- Staff gate verbatim (0009:62-68).
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  -- (a) Self-deactivation lockout guard: never let a staff member flip
  -- their own active flag (a deactivated self would lock everyone out of
  -- reactivating them through the UI).
  if p_member::text = auth.jwt()->>'member_id' then
    raise exception 'forbidden';
  end if;

  -- (b) Target must exist (missing row -> forbidden, never a silent no-op).
  select m.role into v_target_role
  from members m
  where m.id = p_member;
  if v_target_role is null then
    raise exception 'forbidden';
  end if;

  -- (c) Owner rows are untouchable (D-08).
  if v_target_role = 'owner' then
    raise exception 'forbidden';
  end if;

  -- (d) Officers touch only ordinary member rows; the owner also touches
  -- officer rows (role-differentiated removal, AUTH-04).
  if coalesce(auth.jwt()->>'member_role', '') = 'officer'
     and v_target_role <> 'member' then
    raise exception 'forbidden';
  end if;

  update members set active = p_active where id = p_member;
end;
$$;

comment on function public.set_member_active(uuid, boolean) is
  'Role-differentiated removal/reactivation (AUTH-04) in ONE definer RPC — permissive RLS policies OR together and cannot express the target rules. Self-deactivation blocked; missing rows forbidden; owner rows untouchable (D-08); officers touch only member rows, the owner also officer rows. Deactivation revokes minted tokens instantly via the 0004/0008 active checks; rows are never deleted (append-only). Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 6. get_promotion() — member-invocable promotion payload (SHWC-02 / D-01).
--    MEMBER gate (0010:135-141 shape — any active member with a member_id
--    claim; NOT the staff gate). Body copies the class_top5 CTE shape from
--    0010 (latest / class_members + D-07 active filter / cohort / cmp /
--    OVR lateral) and adds per-stat points for ALL 57 stats so the top-6
--    highlight selection is provably key-stat-uncorrelated.
-- ---------------------------------------------------------------------------

create or replace function public.get_promotion()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid;
begin
  -- Member gate (0010:135-141 shape): identity from the JWT only.
  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;

  return (
    with latest as (
      -- 0010:265-273 verbatim: latest value per (member, stat) over
      -- non-rejected, non-discarded submissions.
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    class_members as (
      -- 0010:274-281 shape + D-07: active members only in every cohort
      -- (the D-06 supersession — see the migration header).
      select m.id, m.display_name, m.char_function, m.char_class
      from members m
      where m.char_class is not null and m.active
    ),
    cohort as (
      -- 0010:282-286 shape.
      select l.member_id, l.stat_key, l.value, cm.char_function
      from latest l
      join class_members cm on cm.id = l.member_id
    ),
    cmp as (
      -- 0010:287-297 shape: per (member, stat), n = members of the SAME
      -- function holding the stat; below/ties include the member.
      select a.member_id, a.stat_key,
             count(*) as n,
             count(*) filter (where b.value < a.value) as below,
             count(*) filter (where b.value = a.value) as ties
      from cohort a
      join cohort b on b.stat_key = a.stat_key and b.char_function = a.char_function
      group by a.member_id, a.stat_key
    ),
    ovr_rows as (
      -- 0010:308-326 OVR lateral verbatim (exactly-6 key stats, member holds
      -- all 6, each with n >= 3, floor-51 rescale) across ALL classes.
      select cm.char_class, cm.id, cm.display_name, cm.char_function, o.ovr
      from class_members cm
      cross join lateral (
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
          where ks.class_name = cm.char_class
        ) kp
      ) o
    ),
    top5 as (
      -- 0010:305/327-329 semantics: ovr desc nulls last, display_name.
      -- Classes with no OVR-capable member produce no rows (D-13: omitted
      -- SERVER-SIDE — the client adds no empty sections).
      select char_class, id, display_name, char_function, ovr,
             row_number() over (
               partition by char_class
               order by ovr desc nulls last, display_name
             ) as rn
      from ovr_rows
      where ovr is not null
    ),
    hl as (
      -- Highlights per card: ALL 57 stats scored by the identical points
      -- formula (0010:319-321), top-6 by points. Identical formula for every
      -- stat => the selection cannot leak the key set (RNK-02). Points null
      -- when the stat's cohort has n < 3 — fewer than 6 highlights only when
      -- fewer stats have data. Tier banding stays CLIENT-side (tierForOvr):
      -- the RPC returns the ovr value only.
      select t.id, hl.h as highlights
      from top5 t
      cross join lateral (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'stat_key', sc.stat_key,
            'label', sc.label,
            'value_type', sc.value_type,
            'value', lt.value,
            'points', sp.points
          )
          order by sp.points desc, sc.label
        ), '[]'::jsonb) as h
        from (
          select c.member_id, c.stat_key,
                 (c.below + (c.ties - 1)::numeric / 2) / (c.n - 1) * 99 as points
          from cmp c
          where c.member_id = t.id and c.n >= 3
          order by points desc
          limit 6
        ) sp
        join latest lt on lt.member_id = sp.member_id and lt.stat_key = sp.stat_key
        join stat_catalog sc on sc.stat_key = sp.stat_key
      ) hl
    )
    select coalesce(jsonb_agg(
      jsonb_build_object('class_name', cards.char_class, 'cards', cards.cards)
      order by cards.char_class
    ), '[]'::jsonb)
    from (
      select t.char_class,
             jsonb_agg(
               jsonb_build_object(
                 'display_name', t.display_name,
                 'char_function', t.char_function,
                 'ovr', t.ovr,
                 'highlights', hl.highlights
               )
               order by t.ovr desc, t.display_name
             ) as cards
      from top5 t
      join hl on hl.id = t.id
      where t.rn <= 5
      group by t.char_class
    ) cards
  );
end;
$$;

comment on function public.get_promotion() is
  'Member-invocable promotion payload (SHWC-02): per class, top-5-by-OVR cards with top-6-by-points highlight stats. Key-stat identity is NEVER serialised (RNK-02) — class_key_stats is read internally for OVR only. Points use an identical formula for ALL 57 stats, so top-6-by-points selection cannot leak the key set. Active members only in every cohort (06-CONTEXT D-07).';

-- ---------------------------------------------------------------------------
-- 7. Cohort supersession v3 (D-07): my_report and class_top5 — FULL copies
--    of the 0010 v2 bodies (0010:122-240 and 0010:242-338) with EXACTLY one
--    behavioral change each: `and m.active` added to my_report's cohort CTE
--    join on members (NOT to latest) and to class_top5's class_members CTE.
--    Everything else is behavior-identical — copy, don't paraphrase (0009
--    rank math contract; smoke-rank must stay 27/27 green).
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
      -- 0011/D-07 AMENDMENT: active members only in every cohort — the
      -- 03-CONTEXT D-06 status-only definition is superseded (do not "fix"
      -- back; see the 0011 header).
      select l.member_id, l.stat_key, l.value
      from latest l
      join members m on m.id = l.member_id
      where m.char_class = v_class and m.char_function = v_function and m.active
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
  'Member rank report (RNK-02..05): per-stat own value, class average, best, rank-based points (n>=3 only, average-rank ties) and OVR (51 + mean(6 key-stat points) * 48/99, all-6-or-nothing). Identity from the JWT member_id claim only. Key-stat identity is NEVER serialised (RNK-02) — class_key_stats is read internally for OVR only. Cohort excludes rejected AND discarded submissions (0010/D-12) and is ACTIVE MEMBERS ONLY (0011/D-07 supersession of the 03-CONTEXT D-06 status-only definition). ACCEPTED leak (T-03-10, Pitfall 4): aggregates avg/best can approximate the top player in a small guild, and a determined member could brute-force per-stat points offline — conscious tradeoff; officer validation is the real control.';

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
    -- 0011/D-07 AMENDMENT (supersedes the 0010 comment below): active
    -- members only in every cohort — the 03-CONTEXT D-06 status-only
    -- definition is superseded by 06-CONTEXT D-07 (do not "fix" back; see
    -- the 0011 header).
    select m.id, m.display_name, m.char_function
    from members m
    where m.char_class = p_class and m.active
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
  'Staff-only top-5-by-OVR preview for a class (D-05). Same OVR semantics as my_report (per-member function cohort, exactly-6 key stats, n>=3, floor-51 rescale). Cohort excludes rejected AND discarded submissions (0010/D-12) and is ACTIVE MEMBERS ONLY (0011/D-07 supersession of the 03-CONTEXT D-06 status-only definition). Members with insufficient data get ovr null (sorted last). Internal gate: member_role in (officer,owner) AND caller active. Phase 6 promotion page reuses this CTE shape in get_promotion().';

-- ---------------------------------------------------------------------------
-- 8. Owner-only class creation (D-09 / T-06-08 — folded 03-04 owner
--    directive): structural change must never be officer-reachable. The
--    policy name is reused (0008:66-70 drop+recreate pattern); the policy is
--    ON classes, so referencing the is_active_owner() definer helper is safe
--    (42P17 only strikes policies ON members that subquery members).
-- ---------------------------------------------------------------------------

drop policy if exists staff_insert_classes on classes;
create policy staff_insert_classes on classes
  for insert to authenticated
  with check (auth.jwt()->>'member_role' = 'owner'
    and public.is_active_owner());

-- ---------------------------------------------------------------------------
-- 9. EXECUTE hygiene (WR-02 lesson) for every NEW function — Postgres grants
--    function EXECUTE to PUBLIC at creation: revoke from public/anon, grant
--    to authenticated. The v3 supersessions (my_report/class_top5) keep
--    their existing 0009 grants. PostgREST calls functions as authenticated;
--    membership is enforced INSIDE each function.
-- ---------------------------------------------------------------------------

revoke execute on function public.officer_queue() from public, anon;
grant  execute on function public.officer_queue() to authenticated;

revoke execute on function public.set_submission_status(uuid, text) from public, anon;
grant  execute on function public.set_submission_status(uuid, text) to authenticated;

revoke execute on function public.set_member_role(uuid, text) from public, anon;
grant  execute on function public.set_member_role(uuid, text) to authenticated;

revoke execute on function public.set_member_active(uuid, boolean) from public, anon;
grant  execute on function public.set_member_active(uuid, boolean) to authenticated;

revoke execute on function public.get_promotion() from public, anon;
grant  execute on function public.get_promotion() to authenticated;
