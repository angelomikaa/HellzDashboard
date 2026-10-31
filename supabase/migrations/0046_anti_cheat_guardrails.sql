-- NeoFoot migration 0046: anti-cheat guardrails for stat submissions.
--
-- Owner decisions (2026-10-30):
--   1. A submission value that is >= 1.5x the SAME CLASS + BUILD-ROLE cohort
--      average is flagged for officer review. The four watched stats are the
--      ones Angelus / Assumptio inflate by ~95%:
--        rpdef            (derived base physical DEF from the Equipment PDEF
--                          tooltip -- Phase 9.1)
--        rmdef            (derived base magical DEF)
--        equip_pdef_pct   (Equipment PDEF %)
--        equip_mdef_pct   (Equipment MDEF %)
--      Baseline = latest VALIDATED value per active member of the cohort,
--      excluding the submitting member, n >= 3 (the same data-sufficiency
--      gate every rank surface uses). Never the whole-guild average, never a
--      UI-only check.
--   2. Flagged submissions are SAVED PENDING and shown to officers with a
--      warning panel. Nothing is blocked: a legitimate new-gear outlier must
--      still be submittable, and the officer owns the final decision.
--   3. Fields altered by the player after an OCR read are recorded per input
--      key: source ('ocr' vs 'ocr_edited'), the value the OCR printed, and the
--      final submitted value. Equipment tooltip inputs (transient, never
--      stored as stats) are covered too, because RPDEF/RMDEF derive from them.
--   4. An OVR swing of >= 8 points WITHOUT a class or build-role change is a
--      warning. The projected OVR is computed server-side with the SAME
--      value-proportional formula as every rank RPC (Phase 9 / 10.1) -- never
--      in the browser, never a second formula.
--
-- Append-only. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0046_anti_cheat_guardrails.sql
--
-- Deploy order: MIGRATION FIRST, then the client bundle. An OLD cached client
-- keeps working against this RPC (p_provenance defaults null), but a NEW
-- bundle must never reach the old 2-arg function: PostgREST would fail to
-- resolve the unknown p_provenance argument. The reverse reads (queue, member
-- baselines) fail soft in the client, but submissions do not -- apply first.

begin;

-- ---------------------------------------------------------------------------
-- 1. submission_provenance -- append-only per-field OCR audit trail.
--    input_key is a stat_key OR one of the two transient equipment inputs.
--    RLS on with NO policies: clients can never read another member's audit
--    trail; only the SECURITY DEFINER surfaces (create_submission writes,
--    officer_queue reads) touch this table.
-- ---------------------------------------------------------------------------

create table if not exists public.submission_provenance (
  id bigserial primary key,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  input_key text not null,
  source text not null check (source in ('ocr', 'ocr_edited')),
  ocr_value numeric,
  final_value numeric,
  unique (submission_id, input_key)
);

create index if not exists idx_submission_provenance_submission
  on public.submission_provenance(submission_id);

alter table public.submission_provenance enable row level security;

revoke all on public.submission_provenance from public, anon, authenticated;
revoke all on sequence public.submission_provenance_id_seq from public, anon, authenticated;

comment on table public.submission_provenance is
  'Anti-cheat OCR audit trail (0046): one row per input the OCR read filled. source = ocr (submitted unchanged) or ocr_edited (the player changed it afterwards); ocr_value = what the read printed; final_value = what was submitted (catalog stats are re-derived from submission_stats, never trusted from the client). RLS enabled with NO policies: staff read it only through officer_queue(), members never see it.';

-- ---------------------------------------------------------------------------
-- 2. defense_cohort_baselines() -- member-callable aggregates used by the
--    submit wizard to warn the player BEFORE sending. Same cohort and same
--    n >= 3 gate as the officer-side check; excludes the caller so their own
--    history cannot move the baseline. Aggregates only -- this is the same
--    class-average surface my_report already exposes (CMP-03 discipline).
-- ---------------------------------------------------------------------------

create or replace function public.defense_cohort_baselines()
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
  v_member := nullif(auth.jwt()->>'member_id', '')::uuid;
  if v_member is null
     or not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;

  select m.char_class, m.char_function
    into v_class, v_function
  from members m
  where m.id = v_member;

  if v_class is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    with latest as (
      select distinct on (s.member_id, ss.stat_key)
             s.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions s on s.id = ss.submission_id
      join members m on m.id = s.member_id
      where s.status = 'validated'
        and m.active
        and m.char_class = v_class
        and m.char_function = v_function
        and s.member_id <> v_member
        and ss.stat_key in ('rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct')
      order by s.member_id, ss.stat_key, s.submitted_at desc, s.id desc
    )
    select jsonb_agg(
             jsonb_build_object(
               'stat_key', a.stat_key,
               'average', a.avg_v,
               'sample_size', a.n
             )
             order by a.stat_key
           )
    from (
      select stat_key, avg(value) as avg_v, count(*) as n
      from latest
      group by stat_key
      having count(*) >= 3
    ) a
  ), '[]'::jsonb);
end;
$$;

comment on function public.defense_cohort_baselines() is
  'Member-callable anti-cheat baselines (0046): {stat_key, average, sample_size} for rpdef/rmdef/equip_pdef_pct/equip_mdef_pct over the caller''s class+build-role cohort. Latest validated value per ACTIVE member, caller excluded, n >= 3 (same gate as rank surfaces). Aggregates only. Internal gate: active member from the JWT claim.';

revoke execute on function public.defense_cohort_baselines() from public, anon;
grant execute on function public.defense_cohort_baselines() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. ovr_projection() -- internal OVR calculator for REVIEW projections.
--    This is the Phase 9 / 10.1 value-proportional formula, copied verbatim
--    from the 0036 role_rank body (do not re-derive it). p_stats optionally
--    overrides the member's own latest values with a pending submission's
--    staircase, which lets officer_queue show "OVR before -> OVR if approved"
--    without validating anything. For the member's OWN points the projection
--    is exact: a pending value that becomes the cohort max/min clamps at 99 in
--    either direction, exactly like the validated live value.
--
--    Internal only (no client EXECUTE): officer_queue is SECURITY DEFINER and
--    calls it as the owner.
-- ---------------------------------------------------------------------------

create or replace function public.ovr_projection(
  p_member uuid,
  p_class text,
  p_function text,
  p_stats jsonb default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (s.member_id, ss.stat_key)
           s.member_id, ss.stat_key, ss.value
    from submission_stats ss
    join submissions s on s.id = ss.submission_id
    join members m on m.id = s.member_id
    where s.status = 'validated'
      and m.active
      and m.char_class = p_class
      and m.char_function = p_function
    order by s.member_id, ss.stat_key, s.submitted_at desc, s.id desc
  ),
  pending as (
    select coalesce(
      (
        select jsonb_object_agg(e->>'stat_key', (e->>'value')::numeric)
        from jsonb_array_elements(
          case when jsonb_typeof(p_stats) = 'array' then p_stats else '[]'::jsonb end
        ) e
      ),
      '{}'::jsonb
    ) as vals
  ),
  cohort as (
    select l.member_id, l.stat_key,
           case
             when l.member_id = p_member and pn.vals ? l.stat_key
               then (pn.vals->>l.stat_key)::numeric
             else l.value
           end as value
    from latest l
    cross join pending pn
  ),
  agg as (
    select stat_key, count(*) as n, max(value) as max_v, min(value) as min_v
    from cohort
    group by stat_key
  ),
  member_values as (
    select ks.stat_key,
           coalesce((pn.vals->>ks.stat_key)::numeric, lv.value) as value
    from class_key_stats ks
    cross join pending pn
    left join latest lv
      on lv.member_id = p_member and lv.stat_key = ks.stat_key
    where ks.class_name = p_class
      and ks.char_function = p_function
      and ks.selection_order <= 6
  ),
  points as (
    select case
      when a.n >= 3 and mv.value is not null then
        least(greatest(round(
          case c.stat_direction
            when 'lower' then mv.value / nullif(a.min_v, 0)
            else mv.value / nullif(a.max_v, 0)
          end * 99, 2), 0), 99)
    end as p
    from member_values mv
    join stat_catalog c on c.stat_key = mv.stat_key
    left join agg a on a.stat_key = mv.stat_key
  )
  select case when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0 / 99 end
  from points;
$$;

comment on function public.ovr_projection(uuid, text, text, jsonb) is
  'Internal review-only OVR projection (0046): the Phase 9/10.1 value-proportional formula (copied verbatim from role_rank 0036) over the member''s 6 ordered key stats for (class, build-role). p_stats (jsonb array of {stat_key,value}) optionally overrides the member''s own latest validated values with a PENDING submission so officers can see the OVR swing before validating. No client EXECUTE -- called only by the SECURITY DEFINER officer_queue().';

revoke execute on function public.ovr_projection(uuid, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. submission_anti_cheat() -- one pending submission's review flags.
--    Returns:
--      flagged            boolean (defense spike OR >= 8 OVR swing)
--      defense_spikes[]   {stat_key,label,value_type,value,baseline,ratio,sample_size}
--      ocr_overrides[]    {input_key,label,value_type,source,ocr_value,final_value,delta_pct}
--      ocr_filled_count   inputs the latest OCR read filled
--      ocr_edited_count   of those, how many the player changed
--      ovr_swing          {previous,projected,delta,class_changed,function_changed}
--    Internal only: officer_queue() exposes it to staff.
-- ---------------------------------------------------------------------------

create or replace function public.submission_anti_cheat(p_submission uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid;
  v_sub_class text;
  v_sub_function text;
  v_member_class text;
  v_member_function text;
  v_class text;
  v_function text;
  v_class_changed boolean;
  v_function_changed boolean;
  v_spikes jsonb;
  v_overrides jsonb;
  v_ocr_count int;
  v_edited_count int;
  v_previous numeric;
  v_projected numeric;
  v_swing_flagged boolean;
begin
  select s.member_id, s.char_class, s.char_function, m.char_class, m.char_function
    into v_member, v_sub_class, v_sub_function, v_member_class, v_member_function
  from submissions s
  join members m on m.id = s.member_id
  where s.id = p_submission;

  if v_member is null then
    return null;
  end if;

  v_class := coalesce(v_sub_class, v_member_class);
  v_function := coalesce(v_sub_function, v_member_function);
  v_class_changed := v_class is distinct from v_member_class;
  v_function_changed := v_function is distinct from v_member_function;

  -- Defense buff spikes: >= 1.5x the cohort average (n >= 3, self excluded).
  with base_latest as (
    select distinct on (s2.member_id, ss2.stat_key)
           s2.member_id, ss2.stat_key, ss2.value
    from submissions s2
    join members m2 on m2.id = s2.member_id
    join submission_stats ss2 on ss2.submission_id = s2.id
    where s2.status = 'validated'
      and m2.active
      and m2.char_class = v_class
      and m2.char_function = v_function
      and s2.member_id <> v_member
      and ss2.stat_key in ('rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct')
    order by s2.member_id, ss2.stat_key, s2.submitted_at desc, s2.id desc
  ),
  base_avg as (
    select stat_key, avg(value) as avg_v, count(*) as n
    from base_latest
    group by stat_key
    having count(*) >= 3
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'stat_key', ss.stat_key,
             'label', sc.label,
             'value_type', sc.value_type,
             'value', ss.value,
             'baseline', round(ba.avg_v, 2),
             'ratio', round(ss.value / ba.avg_v, 2),
             'sample_size', ba.n
           )
           order by ss.stat_key
         ), '[]'::jsonb)
    into v_spikes
  from submission_stats ss
  join stat_catalog sc on sc.stat_key = ss.stat_key
  join base_avg ba on ba.stat_key = ss.stat_key
  where ss.submission_id = p_submission
    and ss.stat_key in ('rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct')
    and ba.avg_v > 0
    and ss.value >= 1.5 * ba.avg_v;

  -- OCR provenance: always report the edits; counts cover the unchanged reads.
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'input_key', pr.input_key,
          'label', coalesce(
            sc.label,
            case pr.input_key
              when 'equip_pdef_raw' then 'Equip. PDEF (valor)'
              when 'equip_mdef_raw' then 'Equip. MDEF (valor)'
            end
          ),
          'value_type', coalesce(sc.value_type, 'flat'),
          'source', pr.source,
          'ocr_value', pr.ocr_value,
          'final_value', pr.final_value,
          'delta_pct', case
            when pr.ocr_value is not null and pr.ocr_value <> 0
              then round((pr.final_value - pr.ocr_value) / abs(pr.ocr_value) * 100, 2)
          end
        )
        order by pr.input_key
      ) filter (where pr.source = 'ocr_edited'),
      '[]'::jsonb
    ),
    (count(*) filter (where pr.source = 'ocr'))::int,
    (count(*) filter (where pr.source = 'ocr_edited'))::int
    into v_overrides, v_ocr_count, v_edited_count
  from submission_provenance pr
  left join stat_catalog sc on sc.stat_key = pr.input_key
  where pr.submission_id = p_submission;

  -- OVR swing (owner threshold: 8 points, only when class/role are unchanged).
  v_previous := public.ovr_projection(v_member, v_member_class, v_member_function, null);
  v_projected := public.ovr_projection(
    v_member,
    v_class,
    v_function,
    (
      select jsonb_agg(jsonb_build_object('stat_key', ss.stat_key, 'value', ss.value))
      from submission_stats ss
      where ss.submission_id = p_submission
    )
  );
  v_swing_flagged :=
    not v_class_changed
    and not v_function_changed
    and v_previous is not null
    and v_projected is not null
    and abs(v_projected - v_previous) >= 8;

  return jsonb_build_object(
    'flagged', (jsonb_array_length(v_spikes) > 0) or v_swing_flagged,
    'defense_spikes', v_spikes,
    'ocr_overrides', v_overrides,
    'ocr_filled_count', coalesce(v_ocr_count, 0),
    'ocr_edited_count', coalesce(v_edited_count, 0),
    'ovr_swing', jsonb_build_object(
      'previous', v_previous,
      'projected', v_projected,
      'delta', case
        when v_previous is not null and v_projected is not null
          then round(v_projected - v_previous, 2)
      end,
      'class_changed', v_class_changed,
      'function_changed', v_function_changed
    )
  );
end;
$$;

comment on function public.submission_anti_cheat(uuid) is
  'Review-only anti-cheat flags for ONE pending submission (0046). Defense spikes = rpdef/rmdef/equip_pdef_pct/equip_mdef_pct >= 1.5x the same class+build-role cohort average (latest validated per active member, submitting member excluded, n >= 3). Defense spikes and OVR swings >= 8 points with an unchanged class/build-role set flagged=true. OCR edits are always reported with the originally printed value and the final value (catalog final values are re-derived from submission_stats). Internal: called only by the SECURITY DEFINER officer_queue().';

revoke execute on function public.submission_anti_cheat(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. create_submission v4 -- 0014:1169-1246 body + optional p_provenance.
--    The 2-arg signature is DROPPED (0014 precedent) so PostgREST resolves
--    exactly one candidate; the default keeps old clients working.
-- ---------------------------------------------------------------------------

drop function if exists public.create_submission(jsonb, jsonb);

create or replace function public.create_submission(
  p_stats jsonb,
  p_identity jsonb default null,
  p_provenance jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
  v_submission uuid;
  v_char_id text;
  v_nickname text;
  v_char_class text;
  v_char_function text;
begin
  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  -- SECURITY DEFINER (needed to call the internal assert_char_id_available
  -- guard): the 0004 insert policy's active-member check is enforced here
  -- explicitly instead of row-by-row by RLS.
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
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

  -- IDEN-01/02: optional identity payload (old clients send nothing).
  if p_identity is not null and p_identity <> 'null'::jsonb then
    if jsonb_typeof(p_identity) <> 'object' then
      raise exception 'invalid_identity';
    end if;
    v_char_id := nullif(btrim(p_identity->>'char_id'), '');
    v_nickname := nullif(btrim(p_identity->>'nickname'), '');
    v_char_class := nullif(btrim(p_identity->>'char_class'), '');
    v_char_function := nullif(btrim(p_identity->>'char_function'), '');

    if v_char_id is null or v_char_id !~ '^[0-9]{1,12}$' then
      raise exception 'invalid_identity';
    end if;
    if v_nickname is null or char_length(v_nickname) > 80 then
      raise exception 'invalid_identity';
    end if;
    if v_char_class is null
       or not exists (select 1 from classes where class_name = v_char_class) then
      raise exception 'unknown_class';
    end if;
    if v_char_function is null or v_char_function not in ('dps', 'mdps', 'suporte') then
      raise exception 'invalid_function';
    end if;

    perform public.assert_char_id_available(v_char_id, v_member, null);
  end if;

  -- Anti-cheat OCR provenance (0046): optional array of
  -- {input_key, source, ocr_value, final_value}. input_key is a catalog stat
  -- or one of the two transient equipment inputs. Catalog final values are
  -- re-derived from p_stats, never trusted from the client.
  if p_provenance is not null and p_provenance <> 'null'::jsonb then
    if jsonb_typeof(p_provenance) <> 'array' then
      raise exception 'invalid_provenance';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_provenance) e
      where e->>'input_key' is null
         or char_length(e->>'input_key') > 64
         or (
           (e->>'input_key') not in (select stat_key from stat_catalog)
           and (e->>'input_key') not in ('equip_pdef_raw', 'equip_mdef_raw')
         )
         or coalesce(e->>'source', '') not in ('ocr', 'ocr_edited')
         or (e->>'ocr_value') is null
         or (e->>'ocr_value') !~ '^-?[0-9]+(\.[0-9]+)?$'
         or (e->>'final_value') is null
         or (e->>'final_value') !~ '^-?[0-9]+(\.[0-9]+)?$'
    ) then
      raise exception 'invalid_provenance';
    end if;
    if (select count(*) from jsonb_array_elements(p_provenance) e)
       <> (select count(distinct e->>'input_key') from jsonb_array_elements(p_provenance) e) then
      raise exception 'invalid_provenance';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_provenance) e
      where (e->>'input_key') in (select stat_key from stat_catalog)
        and not exists (
          select 1
          from jsonb_array_elements(p_stats) st
          where st->>'stat_key' = e->>'input_key'
        )
    ) then
      raise exception 'invalid_provenance';
    end if;
  end if;

  -- D-11 one-pending rule: a new submission discards the player's previous
  -- pending row (status mark only -- never a delete, INPT-04). Scoped to the
  -- caller's own rows.
  update submissions set status = 'discarded'
  where member_id = v_member and status = 'pending';
  insert into submissions (member_id, char_id, nickname, char_class, char_function)
  values (v_member, v_char_id, v_nickname, v_char_class, v_char_function)
  returning id into v_submission;
  insert into submission_stats (submission_id, stat_key, value)
  select v_submission, e->>'stat_key', (e->>'value')::numeric
  from jsonb_array_elements(p_stats) e;

  if p_provenance is not null and jsonb_typeof(p_provenance) = 'array' then
    insert into submission_provenance (submission_id, input_key, source, ocr_value, final_value)
    select v_submission,
           e->>'input_key',
           e->>'source',
           (e->>'ocr_value')::numeric,
           case
             when (e->>'input_key') in (select stat_key from stat_catalog)
               then (
                 select (st->>'value')::numeric
                 from jsonb_array_elements(p_stats) st
                 where st->>'stat_key' = e->>'input_key'
                 limit 1
               )
             else (e->>'final_value')::numeric
           end
    from jsonb_array_elements(p_provenance) e;
  end if;

  return v_submission;
end;
$$;

comment on function public.create_submission(jsonb, jsonb, jsonb) is
  'Member-invocable atomic submission (INPT-04, IDEN-01/02, 0046 provenance). Full 0014 v3 body (one-pending discard + stats insert + optional identity) plus an OPTIONAL p_provenance array of {input_key,source,ocr_value,final_value} recording which inputs the OCR read filled and which the player edited afterwards. Catalog provenance final values are re-derived from p_stats (never trusted). p_provenance defaults null so old clients keep working (the 2-arg overload is dropped to keep PostgREST resolution unambiguous). Exceptions: no_member_claim/forbidden/empty_stats/unknown_stat_key/invalid_identity/unknown_class/invalid_function/duplicate_char_id/invalid_provenance. SECURITY DEFINER: identity branch calls the internal assert_char_id_available guard; the caller is pinned to the JWT member_id claim; the one-pending discard is scoped to the caller''s own rows.';

revoke execute on function public.create_submission(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_submission(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. officer_queue() -- 0014:1322-1373 body + per-row anti_cheat flags.
--    The row payload keeps every existing field byte-identical; anti_cheat
--    is purely additive.
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
        'char_id', s.char_id,
        'nickname', s.nickname,
        'char_class', coalesce(s.char_class, m.char_class),
        'char_function', coalesce(s.char_function, m.char_function),
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
        ),
        'anti_cheat', public.submission_anti_cheat(s.id)
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
  'Staff-only validation queue (AUTH-05; 08-01 identity patch; 0046 anti-cheat). ALL pending submissions newest-first with submitter identity, captured identity (char_id/nickname + coalesced class/function), the full stat payload and an additive anti_cheat object (defense spikes vs the class+role cohort average, OCR edits with original/final values, projected OVR swing). Read-only; validation flips happen via set_submission_status. Empty queue returns [] (never null). Internal gate: member_role in (officer,owner) AND caller active.';

revoke execute on function public.officer_queue() from public, anon;
grant execute on function public.officer_queue() to authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0046', 'anti_cheat_guardrails', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
