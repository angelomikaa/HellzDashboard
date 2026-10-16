-- NeoFoot Phase 07.2 (plan 07.2-01): server foundation — relevant stat tier,
-- leak-safe member card payload, staff officials rank RPC, promotion highlight
-- supersession, and the 3-letter catalog label column. Append-only: 0001–0012
-- are NEVER edited in place (0008 precedent); superseded functions ship as
-- full byte-faithful `create or replace` copies plus the minimal change
-- (0011 lesson — copy, don't paraphrase).
--
-- 07.2 decisions implemented here (07.2-CONTEXT.md):
--   D-03: leak-safe reveal boundary — members see WHICH stats are key
--         (sanctioned reveal), key-stat CONFIG (weights/toggles/management
--         data) is never serialised into any member-reachable payload.
--   D-04: relevant tier storage (class_relevant_stats), governed via RPCs.
--   D-05: key/relevant mutual exclusivity + gating, SERVER-ENFORCED:
--         (1) key XOR relevant XOR neither — never both;
--         (2) relevant selections only after the class's key set is complete;
--         (3) removing a key never demotes existing relevant rows (a vacancy
--             blocks NEW relevant selections until the key set is 6 again);
--         (4) promoting a relevant stat into a key slot removes it from
--             relevant ("a relevant stat becomes key when selected").
--   D-11: stat_catalog.label_short — owner-reviewable 3-letter pt-BR labels.
--   D-13: get_promotion highlights become the class's key stats (same 6 for
--         every card of that class) with a closed field list.
--   D-18/D-20: role_rank() — staff-only officials rank view, role-primary
--         boards, per-stat value + points + class average, server-ordered.
--   D-23: card reads consume whatever key config exists at runtime
--         (class-level today; the class_name key survives Phase 9 re-keying).
--
-- RNK-02 RE-BASELINE: key identity on my_card()/get_promotion highlights is
-- the SANCTIONED reveal per 07.2 D-03/D-13; config data is still never
-- serialised. my_report() is deliberately NOT modified — every existing
-- leak probe stays green untouched; the sanctioned reveal lives in the NEW
-- my_card contract only.
--
-- Claim contract (0006 lesson, never violate):
--   auth.jwt()->>'member_role' = 'member'|'officer'|'owner' (guild role)
--   auth.jwt()->>'role'        = 'authenticated' (PostgREST role-switch only)

-- ---------------------------------------------------------------------------
-- 1. label_short (D-11): 3-letter pt-BR abbreviation per catalog stat.
--    Rules: uppercase ASCII letters only, max 3 chars, unique across all 57
--    (enforced by constraint), mnemonic over mechanical.
-- ---------------------------------------------------------------------------

alter table stat_catalog add column label_short text not null default '';

update stat_catalog set label_short = 'HP'  where stat_key = 'hp';
update stat_catalog set label_short = 'SP'  where stat_key = 'sp';
update stat_catalog set label_short = 'PAT' where stat_key = 'patk';
update stat_catalog set label_short = 'PDE' where stat_key = 'pdef';
update stat_catalog set label_short = 'MAT' where stat_key = 'matk';
update stat_catalog set label_short = 'MDE' where stat_key = 'mdef';
update stat_catalog set label_short = 'RPA' where stat_key = 'refine_patk';
update stat_catalog set label_short = 'RPD' where stat_key = 'refine_pdef';
update stat_catalog set label_short = 'RMA' where stat_key = 'refine_matk';
update stat_catalog set label_short = 'RMD' where stat_key = 'refine_mdef';
update stat_catalog set label_short = 'RHP' where stat_key = 'hp_recover';
update stat_catalog set label_short = 'RSP' where stat_key = 'sp_recover';
update stat_catalog set label_short = 'HIT' where stat_key = 'hit';
update stat_catalog set label_short = 'FLE' where stat_key = 'flee';
update stat_catalog set label_short = 'PCB' where stat_key = 'combat_power';
update stat_catalog set label_short = 'ASP' where stat_key = 'aspd';
update stat_catalog set label_short = 'MSP' where stat_key = 'mspd';
update stat_catalog set label_short = 'CTV' where stat_key = 'variable_ct';
update stat_catalog set label_short = 'CVP' where stat_key = 'variable_ct_pct';
update stat_catalog set label_short = 'CTF' where stat_key = 'fixed_ct';
update stat_catalog set label_short = 'CFP' where stat_key = 'fixed_ct_pct';
update stat_catalog set label_short = 'CUR' where stat_key = 'healing_done';
update stat_catalog set label_short = 'CRE' where stat_key = 'healing_taken';
update stat_catalog set label_short = 'CRT' where stat_key = 'crit';
update stat_catalog set label_short = 'RCR' where stat_key = 'crit_res';
update stat_catalog set label_short = 'DCR' where stat_key = 'crit_dmg';
update stat_catalog set label_short = 'RDC' where stat_key = 'crit_dmg_res';
update stat_catalog set label_short = 'PDM' where stat_key = 'pdmg';
update stat_catalog set label_short = 'PDR' where stat_key = 'pdmg_r';
update stat_catalog set label_short = 'MDM' where stat_key = 'mdmg';
update stat_catalog set label_short = 'MDR' where stat_key = 'mdmg_r';
update stat_catalog set label_short = 'IGP' where stat_key = 'ignore_pdef';
update stat_catalog set label_short = 'IPD' where stat_key = 'ignore_pdef_pct';
update stat_catalog set label_short = 'IGM' where stat_key = 'ignore_mdef';
update stat_catalog set label_short = 'IMD' where stat_key = 'ignore_mdef_pct';
update stat_catalog set label_short = 'BPD' where stat_key = 'pdmg_bonus';
update stat_catalog set label_short = 'BMD' where stat_key = 'mdmg_bonus';
update stat_catalog set label_short = 'RPE' where stat_key = 'pve_dmg_reduction';
update stat_catalog set label_short = 'BPE' where stat_key = 'pve_dmg_bonus';
update stat_catalog set label_short = 'RPP' where stat_key = 'pvp_dmg_reduction';
update stat_catalog set label_short = 'BPV' where stat_key = 'pvp_dmg_bonus';
update stat_catalog set label_short = 'SPM' where stat_key = 'max_sp_pct';
update stat_catalog set label_short = 'EPA' where stat_key = 'equip_patk_pct';
update stat_catalog set label_short = 'EMA' where stat_key = 'equip_matk_pct';
update stat_catalog set label_short = 'EPD' where stat_key = 'equip_pdef_pct';
update stat_catalog set label_short = 'EMD' where stat_key = 'equip_mdef_pct';
update stat_catalog set label_short = 'CDG' where stat_key = 'global_cd_pct';
update stat_catalog set label_short = 'DVP' where stat_key = 'dmg_vs_small';
update stat_catalog set label_short = 'DVM' where stat_key = 'dmg_vs_medium';
update stat_catalog set label_short = 'DVG' where stat_key = 'dmg_vs_large';
update stat_catalog set label_short = 'DVB' where stat_key = 'dmg_vs_brute';
update stat_catalog set label_short = 'DVH' where stat_key = 'dmg_vs_demi_human';
update stat_catalog set label_short = 'RVP' where stat_key = 'dmg_reduction_vs_small';
update stat_catalog set label_short = 'RVM' where stat_key = 'dmg_reduction_vs_medium';
update stat_catalog set label_short = 'RVG' where stat_key = 'dmg_reduction_vs_large';
update stat_catalog set label_short = 'RVB' where stat_key = 'dmg_reduction_vs_brute';
update stat_catalog set label_short = 'RVH' where stat_key = 'dmg_reduction_vs_demi_human';

alter table stat_catalog
  add constraint stat_catalog_label_short_unique unique (label_short);

-- OWNER REVIEW PENDING (D-11): mapping is a DRAFT until the 07.2-01 checkpoint approves it.

-- ---------------------------------------------------------------------------
-- 2. class_relevant_stats (RELV-01 / D-04): the secondary relevant tier.
--    Mirrors the class_key_stats shape (same class_name key so Phase 9's
--    re-keying migrates both tables identically, D-23). Separate side table —
--    class_key_stats is load-bearing for OVR in 0009/0011 RPCs and dozens of
--    probes; this is additive-only. No DML policies: writes happen ONLY via
--    the gated RPCs (set_relevant_stat / set_key_stat supersession).
-- ---------------------------------------------------------------------------

create table class_relevant_stats (
  class_name text not null references classes(class_name) on delete cascade,
  stat_key   text not null references stat_catalog(stat_key) on delete cascade,
  primary key (class_name, stat_key)
);

alter table class_relevant_stats enable row level security;

-- Staff-only select policy, copying staff_select_key_stats verbatim
-- (0009:32-37): the exists-subquery targets members (NOT the guarded table),
-- so there is no 42P17 recursion (03-02 live lesson). Members get [].
drop policy if exists staff_select_relevant_stats on class_relevant_stats;
create policy staff_select_relevant_stats on class_relevant_stats
  for select to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active));

grant select on class_relevant_stats to authenticated;

-- ---------------------------------------------------------------------------
-- 3. set_relevant_stat — staff-only relevant-tier toggle (RELV-01 / D-05).
--    Exceptions: forbidden | unknown_class | already_key | key_set_incomplete.
-- ---------------------------------------------------------------------------

create or replace function public.set_relevant_stat(p_class text, p_stat_key text, p_enabled boolean)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Staff gate verbatim (0009:62-68): officer/owner claim AND the caller's
  -- live active flag — deactivation revokes access immediately.
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
  -- unknown stat_key: the class_relevant_stats FK to stat_catalog raises naturally.

  -- SAME advisory-lock key as set_key_stat (0009:77): key and relevant
  -- toggles for one class serialize against each other, so two concurrent
  -- officers can never violate D-05 (0009 CR-01 race lesson).
  perform pg_advisory_xact_lock(hashtext('cks:' || p_class));

  if p_enabled then
    -- D-05 rule 1: key XOR relevant — a stat can never be both.
    if exists (
      select 1 from class_key_stats
      where class_name = p_class and stat_key = p_stat_key
    ) then
      raise exception 'already_key';
    end if;
    -- D-05 rule 2: relevant selections only after the key set is complete.
    if (select count(*) from class_key_stats where class_name = p_class) <> 6 then
      raise exception 'key_set_incomplete';
    end if;
    insert into class_relevant_stats (class_name, stat_key)
    values (p_class, p_stat_key)
    on conflict (class_name, stat_key) do nothing;
  else
    -- D-05 rule 3: removing a KEY never touches relevant rows (this RPC
    -- only removes relevant rows; the set_key_stat supersession below owns
    -- the promotion demotion).
    delete from class_relevant_stats
    where class_name = p_class and stat_key = p_stat_key;
  end if;

  return (select count(*) from class_relevant_stats where class_name = p_class);
end;
$$;

comment on function public.set_relevant_stat(text, text, boolean) is
  'Staff-only relevant-tier toggle (07.2 RELV-01/D-04/D-05). p_enabled=true adds (raises already_key if the stat is currently key, key_set_incomplete unless the class has exactly 6 key stats); p_enabled=false removes. Returns the class''s current relevant count. Shares the hashtext(''cks:''||p_class) advisory lock with set_key_stat so key/relevant toggles serialize. Internal gate: member_role in (officer,owner) AND caller active. Exceptions: forbidden/unknown_class/already_key/key_set_incomplete.';

-- ---------------------------------------------------------------------------
-- 4. set_key_stat supersession (07.2 D-05 rule 4): FULL byte-faithful copy
--    of the 0009 body (0009:51-95) with EXACTLY one addition after the
--    p_enabled insert: promoting a relevant stat into a key slot removes it
--    from the relevant tier. The p_enabled=false branch and all exception
--    tokens (forbidden/unknown_class/key_stat_limit) are unchanged —
--    smoke-rank must stay green.
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
  -- 07.2: set_relevant_stat shares this lock key (key/relevant D-05 race-proof).
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

    -- 07.2 D-05 rule 4: a relevant stat becomes key when selected —
    -- promoting a relevant stat into a key slot removes it from the
    -- relevant tier (key XOR relevant, D-05 rule 1).
    delete from class_relevant_stats
    where class_name = p_class and stat_key = p_stat_key;
  else
    delete from class_key_stats
    where class_name = p_class and stat_key = p_stat_key;
    -- 07.2 D-05 rule 3: deselecting a key NEVER demotes relevant rows —
    -- existing relevant stats remain relevant (a vacancy only blocks NEW
    -- relevant selections until the key set is complete again).
  end if;

  return (select count(*) from class_key_stats where class_name = p_class);
end;
$$;

comment on function public.set_key_stat(text, text, boolean) is
  'Staff-only key-stat toggle (RNK-01, D-02/D-03/D-14; 07.2 D-05 supersession). p_enabled=true adds (blocks at a 7th with key_stat_limit, advisory-lock race-proof) AND demotes the stat out of the relevant tier if it was relevant (07.2 D-05 rule 4: a relevant stat becomes key when selected); p_enabled=false removes WITHOUT touching relevant rows (D-05 rule 3). Returns the class''s current key-stat count. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 5. my_card — the leak-safe member card payload (07.2 CARD-01, D-03/D-23).
--    MEMBER-invocable: member gate (0011:302-309 shape — identity from the
--    JWT only; no client-supplied player id). Key identity here is the
--    sanctioned D-03 reveal (which stats are key); config (weights/toggles/
--    management data) has NO representation anywhere in the payload; NO
--    class_average/best aggregates on key_stats (D-02: cards show no
--    aggregates). key_stats reads whatever key config exists at runtime
--    (D-23: class-level today, Phase 9 per-(class, build-role) later).
--    Exceptions: no_member_claim | forbidden.
--    my_report() is deliberately NOT modified (existing probes stay green).
-- ---------------------------------------------------------------------------

create or replace function public.my_card()
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
  -- Member gate (0011:302-309 shape): identity from the JWT only.
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
      -- 0011 latest verbatim: latest value per (member, stat) over
      -- non-rejected, non-discarded submissions; per stat, the most recent
      -- submission CONTAINING it.
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    cohort as (
      -- 0011 cohort shape scoped to the caller's class+function; ACTIVE
      -- members only in every cohort (0011/D-07 supersession).
      select l.member_id, l.stat_key, l.value
      from latest l
      join members m on m.id = l.member_id
      where m.char_class = v_class and m.char_function = v_function and m.active
    ),
    agg as (
      -- Cohort size per stat (n>=3 gate for the points formula). The cohort
      -- here spans the caller's class+function — identical OVR/points
      -- semantics to my_report (0009/0011); cmp is not needed in a
      -- single-member payload, the cohort subqueries below are the 0009
      -- my_report shapes verbatim.
      select stat_key, count(*) as n
      from cohort
      group by stat_key
    )
    select jsonb_build_object(
      'char_class', v_class,
      'char_function', v_function,
      'ovr', (
        -- Exactly the 0009 my_report ovr subquery: OVR only when the class
        -- has exactly 6 key stats, the caller holds all 6, and each has
        -- n >= 3 (04 D-12 incomplete-config semantics: count(*) <> 6 ->
        -- value null, data_sufficient false). Unrounded output.
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
      ),
      'key_stats', (
        -- One entry per class_key_stats row of v_class (D-23: live config —
        -- <=6 when mid-configuration, [] when no config). Order by label
        -- (stable). Closed field list {stat_key,label,label_short,value_type,
        -- own_value,points} — NO class_average, NO best, NO config fields.
        -- Points = the 0009 formula scoped to n>=3; own_value from latest.
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'stat_key', ks.stat_key,
            'label', c.label,
            'label_short', c.label_short,
            'value_type', c.value_type,
            'own_value', o.value,
            'points', case
              when coalesce(a.n, 0) >= 3 and o.value is not null then
                round(
                  (
                    (select count(*) from cohort cb
                      where cb.stat_key = ks.stat_key and cb.value < o.value)
                    + ((select count(*) from cohort ct
                          where ct.stat_key = ks.stat_key and ct.value = o.value) - 1)::numeric / 2
                  ) / (a.n - 1) * 99, 2)
            end
          )
          order by c.label
        ), '[]'::jsonb)
        from class_key_stats ks
        join stat_catalog c on c.stat_key = ks.stat_key
        left join latest o on o.stat_key = ks.stat_key and o.member_id = v_member
        left join agg a on a.stat_key = ks.stat_key
        where ks.class_name = v_class
      ),
      'relevant_stat_keys', (
        -- Identity only (guides foco de melhoria, 07.2 D-07) — [] when the
        -- class has no relevant config.
        coalesce((
          select jsonb_agg(rs.stat_key order by rs.stat_key)
          from class_relevant_stats rs
          where rs.class_name = v_class
        ), '[]'::jsonb)
      )
    )); -- closes jsonb_build_object AND the `return (` wrapper (06 fix)
end;
$$;

comment on function public.my_card() is
  'Leak-safe member card payload (07.2 CARD-01, D-03/D-23): char_class/char_function from the JWT, OVR (0009 semantics, {value,data_sufficient}), key_stats (the class''s live key config — closed field list {stat_key,label,label_short,value_type,own_value,points}, NO class_average/best, NO config data) and relevant_stat_keys (identity only, [] when unset). Key identity is the SANCTIONED 07.2 D-03 reveal; key-stat CONFIG is never serialised. my_report() stays byte-identical (existing leak probes untouched). Internal gate: JWT member_id claim AND caller active. Exceptions: no_member_claim/forbidden.';

-- ---------------------------------------------------------------------------
-- 6. role_rank — staff-only officials rank view (07.2 RANK-02, D-18/D-20).
--    Role-primary boards: one row per active member whose char_function =
--    p_function (optionally filtered to p_class), ranked by OVR within the
--    role — each member's OVR computed inside their OWN class+function
--    cohort (identical semantics to my_report; OVR is the cross-role sort
--    key, not a re-cohorting). Per-stat value + points + class_average
--    (D-20 deliberate officials visibility expansion). Server-ordered
--    (ovr desc nulls last, display_name) — the client never re-sorts.
--    Exceptions: forbidden | invalid_function | unknown_class.
-- ---------------------------------------------------------------------------

create or replace function public.role_rank(p_function text, p_class text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Staff gate FIRST (0009:62-68 shape): officer/owner claim AND the
  -- caller's live active flag.
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  -- Whitelist check BEFORE everything else except the gate (05-02
  -- assertion-shape lesson: pin the actual contract token first).
  if p_function not in ('dps', 'mdps', 'suporte') then
    raise exception 'invalid_function';
  end if;

  -- '' and NULL both mean "all classes" (default board state, D-18).
  if p_class = '' then
    p_class := null;
  end if;

  if p_class is not null
     and not exists (select 1 from classes where class_name = p_class) then
    raise exception 'unknown_class';
  end if;

  return (
    with latest as (
      -- 0011 latest verbatim: latest value per (member, stat) over
      -- non-rejected, non-discarded submissions.
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    role_members as (
      -- D-18: role-primary board — active members with the requested build
      -- role and a non-null class, optionally narrowed to one class.
      select m.id, m.display_name, m.char_class, m.char_function
      from members m
      where m.char_function = p_function
        and m.active
        and m.char_class is not null
        and (p_class is null or m.char_class = p_class)
    ),
    cohort as (
      -- 0011 cohort shape + char_class carried so cross-class boards keep
      -- per-class cohorts (D-18: OVR is the cross-role sort key, each
      -- member still ranks inside their own class+function cohort).
      select l.member_id, l.stat_key, l.value, rm.char_function, rm.char_class
      from latest l
      join role_members rm on rm.id = l.member_id
    ),
    cmp as (
      -- 0011 cmp shape + class equality added to the join: per (member,
      -- stat), n = members of the SAME class AND function holding the stat
      -- (OVR semantics identical to my_report); below/ties include the member.
      select a.member_id, a.stat_key,
             count(*) as n,
             count(*) filter (where b.value < a.value) as below,
             count(*) filter (where b.value = a.value) as ties
      from cohort a
      join cohort b
        on b.stat_key = a.stat_key
       and b.char_function = a.char_function
       and b.char_class = a.char_class
      group by a.member_id, a.stat_key
    ),
    agg as (
      -- Per (class, stat) cohort aggregate: n for the points gate and
      -- class_average for the D-20 context column (member's own class
      -- +function cohort — the same cohort the points are computed in).
      select char_class, stat_key, count(*) as n, avg(value) as avg_v
      from cohort
      group by char_class, stat_key
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'member_id', rr.id,
        'display_name', rr.display_name,
        'char_class', rr.char_class,
        'char_function', rr.char_function,
        'ovr', rr.ovr,
        'stats', rr.stats
      )
      order by rr.ovr desc nulls last, rr.display_name
    ), '[]'::jsonb)
    from (
      select rm.id, rm.display_name, rm.char_class, rm.char_function, o.ovr,
             (
               -- All 57 catalog entries per member (D-19 detail shape):
               -- closed field list {stat_key,label,label_short,value_type,
               -- value,points,class_average}. Points = the 0009 formula
               -- within the member's class+function cohort (n>=3 only).
               select coalesce(jsonb_agg(
                 jsonb_build_object(
                   'stat_key', sc.stat_key,
                   'label', sc.label,
                   'label_short', sc.label_short,
                   'value_type', sc.value_type,
                   'value', lt.value,
                   'points', case
                     when coalesce(ag.n, 0) >= 3 and lt.value is not null then
                       round(
                         (
                           (select count(*) from cohort cb
                             where cb.stat_key = sc.stat_key
                               and cb.char_class = rm.char_class
                               and cb.value < lt.value)
                           + ((select count(*) from cohort ct
                                 where ct.stat_key = sc.stat_key
                                   and ct.char_class = rm.char_class
                                   and ct.value = lt.value) - 1)::numeric / 2
                         ) / (ag.n - 1) * 99, 2)
                   end,
                   'class_average', ag.avg_v
                 )
                 order by sc.group_name, sc.label
               ), '[]'::jsonb)
               from stat_catalog sc
               left join latest lt
                 on lt.stat_key = sc.stat_key and lt.member_id = rm.id
               left join agg ag
                 on ag.stat_key = sc.stat_key and ag.char_class = rm.char_class
             ) as stats
      from role_members rm
      cross join lateral (
        -- 0009 OVR lateral verbatim (exactly-6 key stats, member holds
        -- all 6, each with n >= 3, floor-51 rescale) — scoped to the
        -- member's own class.
        select case
          when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
        end as ovr
        from (
          select case
            when c.n >= 3 then
              (c.below + (c.ties - 1)::numeric / 2) / (c.n - 1) * 99
          end as p
          from class_key_stats ks
          join cmp c on c.member_id = rm.id and c.stat_key = ks.stat_key
          where ks.class_name = rm.char_class
        ) kp
      ) o
    ) rr
  );
end;
$$;

comment on function public.role_rank(text, text) is
  'Staff-only officials rank view (07.2 RANK-02, D-18/D-20): one row per active member of the requested build role (dps|mdps|suporte — anything else raises invalid_function), optionally narrowed to one class (else unknown_class), ranked by OVR within the role (each member''s OVR computed inside their OWN class+function cohort — my_report semantics). Per-member stats: all 57 catalog entries with value + points + class_average (closed field list; D-20 sanctioned officials visibility). Server-ordered ovr desc nulls last, display_name — the client never re-sorts. Heavy payload accepted (staff-only, guild-scale, T-072-04). Internal gate: member_role in (officer,owner) AND caller active. Exceptions: forbidden/invalid_function/unknown_class.';

-- ---------------------------------------------------------------------------
-- 7. get_promotion supersession (07.2 D-13): FULL byte-faithful copy of the
--    0011 body (0011:292-431) with EXACTLY one change — the `hl` lateral's
--    inner top-6-by-points subselect becomes a join over class_key_stats for
--    the card's class, ordered by sc.label (stable). Highlight selection is
--    now the SANCTIONED key reveal (07.2 D-13; RNK-02 re-baselined — config
--    data is still never serialised): identical fields for every card of a
--    class, closed list {stat_key,label,label_short,value_type,value,points}.
--    All gates/cohort/top-5/omitted-classes behavior byte-preserved.
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
      -- (the D-06 supersession — see the 0011 header).
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
      -- 07.2 D-13 SUPERSESSION: the old top-6-by-points subselect is
      -- replaced by a join over class_key_stats for the card's class —
      -- every card's highlights are the class's key stats (same set for
      -- every card of that class), ordered by sc.label (stable). This is
      -- the SANCTIONED key-stat reveal (07.2-CONTEXT D-13; RNK-02
      -- re-baselined): the closed field list
      -- {stat_key,label,label_short,value_type,value,points} carries key
      -- identity and per-stat values, but NEVER key-stat config
      -- (weights/toggles/management data). Points stay null when the
      -- stat's cohort has n < 3. Tier banding stays CLIENT-side
      -- (tierForOvr): the RPC returns the ovr value only.
      select t.id, hl.h as highlights
      from top5 t
      cross join lateral (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'stat_key', sc.stat_key,
            'label', sc.label,
            'label_short', sc.label_short,
            'value_type', sc.value_type,
            'value', lt.value,
            'points', sp.points
          )
          order by sc.label
        ), '[]'::jsonb) as h
        from class_key_stats ks
        join stat_catalog sc on sc.stat_key = ks.stat_key
        left join latest lt on lt.stat_key = ks.stat_key and lt.member_id = t.id
        left join (
          select c.member_id, c.stat_key,
                 (c.below + (c.ties - 1)::numeric / 2) / (c.n - 1) * 99 as points
          from cmp c
          where c.member_id = t.id and c.n >= 3
        ) sp on sp.stat_key = ks.stat_key
        where ks.class_name = t.char_class
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
  'Member-invocable promotion payload (SHWC-02; 07.2 D-13 supersession): per class, top-5-by-OVR cards whose highlights are the class''s KEY STATS (same set for every card of that class, ordered by label — the sanctioned 07.2 D-03/D-13 reveal; RNK-02 re-baselined) with the closed field list {stat_key,label,label_short,value_type,value,points}. Key-stat CONFIG (weights/toggles/management data) is never serialised. Active members only in every cohort (06-CONTEXT D-07). Internal gate: JWT member_id claim AND caller active. Exceptions: no_member_claim/forbidden.';

-- ---------------------------------------------------------------------------
-- 8. EXECUTE hygiene (WR-02 lesson) for the new + superseded functions —
--    Postgres grants function EXECUTE to PUBLIC at creation: revoke from
--    public/anon, grant to authenticated. PostgREST calls functions as
--    authenticated; membership is enforced INSIDE each function (and by RLS
--    for the staff select policy on class_relevant_stats).
-- ---------------------------------------------------------------------------

revoke execute on function public.set_relevant_stat(text, text, boolean) from public, anon;
grant  execute on function public.set_relevant_stat(text, text, boolean) to authenticated;

revoke execute on function public.set_key_stat(text, text, boolean) from public, anon;
grant  execute on function public.set_key_stat(text, text, boolean) to authenticated;

revoke execute on function public.my_card() from public, anon;
grant  execute on function public.my_card() to authenticated;

revoke execute on function public.role_rank(text, text) from public, anon;
grant  execute on function public.role_rank(text, text) to authenticated;

revoke execute on function public.get_promotion() from public, anon;
grant  execute on function public.get_promotion() to authenticated;
