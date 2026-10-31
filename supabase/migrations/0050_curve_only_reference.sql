-- NeoFoot migration 0050: curve-only reference.
--
-- Owner decision (2026-10-30): "vamos descartar o padrão, e usar apenas a
-- curva como referencia." The fixed 1.5x margin and the guild-wide
-- "Fora do padrão" shorthand are no longer the reference. Detection uses only
-- the robust cohort curve (median + MAD sigma) and the ATK/MATK proportional
-- curve, including the Impositio Manus undo test.
--
-- Scope:
--   1. defense_cohort_baselines() now requires n >= 5 and returns the cohort
--      median + MAD (plus the average for backward-compatible clients).
--   2. submission_anti_cheat() only returns a defense spike when the value is
--      >= 3.5 sigma above the cohort median. The average/ratio fields stay in
--      the payload for old cached clients, but they no longer flag anything.
--   3. stat_overview() is deliberately unchanged: the new client ignores its
--      legacy 1.5x fields and renders only the median/sigma; keeping them in
--      the payload avoids breaking a cached bundle during the deploy window.
--
-- Review aid only. Cohorts below n=5 produce NO curve/sigma flag; officers
-- still decide. No auto-rejection.
--
-- Append-only. Apply AFTER 0049:
--   node scripts/apply-seed.mjs supabase/migrations/0050_curve_only_reference.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. defense_cohort_baselines() — median/MAD, n >= 5.
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
        and public.cohort_group(m.char_class) = public.cohort_group(v_class)
        and m.char_function = v_function
        and s.member_id <> v_member
        and ss.stat_key in ('rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct')
      order by s.member_id, ss.stat_key, s.submitted_at desc, s.id desc
    ),
    med as (
      select stat_key,
             count(*) as n,
             avg(value) as avg_v,
             percentile_cont(0.5) within group (order by value) as med_v
      from latest
      group by stat_key
      having count(*) >= 5
    ),
    mad as (
      select l.stat_key,
             percentile_cont(0.5) within group (order by abs(l.value - m.med_v)) as mad_v
      from latest l
      join med m on m.stat_key = l.stat_key
      group by l.stat_key
    )
    select jsonb_agg(
             jsonb_build_object(
               'stat_key', m.stat_key,
               'average', round(m.avg_v, 2),
               'median', round(m.med_v::numeric, 2),
               'mad', round(mad.mad_v::numeric, 2),
               'sample_size', m.n
             )
             order by m.stat_key
           )
    from med m
    join mad on mad.stat_key = m.stat_key
  ), '[]'::jsonb);
end;
$$;

comment on function public.defense_cohort_baselines() is
  'Member-callable curve baselines (0046; 0048 merged cohort; 0050 curve-only). {stat_key, average, median, mad, sample_size} for rpdef/rmdef/equip_pdef_pct/equip_mdef_pct over the caller''s stats cohort (public.cohort_group + build-role). Latest validated value per ACTIVE member, caller excluded, n >= 5 (the robust curve gate). The average is kept for backward compatibility; the submit warning uses the median/MAD sigma only. Aggregates only. Internal gate: active member from the JWT claim.';

-- ---------------------------------------------------------------------------
-- 2. submission_anti_cheat() — defense spikes only at >= 3.5 sigma.
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
  v_curves jsonb;
  v_curve_flagged boolean;
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

  -- Curve-only defense signal: robust sigma >= 3.5 vs the cohort median
  -- (n >= 5). The average/ratio stay in the payload for backward-compatible
  -- cached clients, but they NEVER flag on their own.
  with base_latest as (
    select distinct on (s2.member_id, ss2.stat_key)
           s2.member_id, ss2.stat_key, ss2.value
    from submissions s2
    join members m2 on m2.id = s2.member_id
    join submission_stats ss2 on ss2.submission_id = s2.id
    where s2.status = 'validated'
      and m2.active
      and public.cohort_group(m2.char_class) = public.cohort_group(v_class)
      and m2.char_function = v_function
      and s2.member_id <> v_member
      and ss2.stat_key in ('rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct')
    order by s2.member_id, ss2.stat_key, s2.submitted_at desc, s2.id desc
  ),
  base_agg as (
    select stat_key, avg(value) as avg_v, count(*) as n
    from base_latest
    group by stat_key
    having count(*) >= 3
  ),
  base_med as (
    select stat_key, percentile_cont(0.5) within group (order by value) as med_v
    from base_latest
    group by stat_key
    having count(*) >= 5
  ),
  base_mad as (
    select bl.stat_key,
           percentile_cont(0.5) within group (order by abs(bl.value - bm.med_v)) as mad_v
    from base_latest bl
    join base_med bm on bm.stat_key = bl.stat_key
    group by bl.stat_key
  ),
  candidates as (
    select ss.stat_key, ss.value, sc.label, sc.value_type, ba.avg_v, ba.n,
           bm.med_v, bmad.mad_v,
           case
             when bm.med_v is not null and bm.med_v > 0 then
               (ss.value - bm.med_v)
                 / greatest(1.4826 * coalesce(bmad.mad_v, 0), 0.05 * abs(bm.med_v), 1)
           end as z
    from submission_stats ss
    join stat_catalog sc on sc.stat_key = ss.stat_key
    join base_agg ba on ba.stat_key = ss.stat_key
    left join base_med bm on bm.stat_key = ss.stat_key
    left join base_mad bmad on bmad.stat_key = ss.stat_key
    where ss.submission_id = p_submission
      and ss.stat_key in ('rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct')
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'stat_key', c.stat_key,
             'label', c.label,
             'value_type', c.value_type,
             'value', c.value,
             'baseline', round(c.avg_v, 2),
             'ratio', round(c.value / c.avg_v, 2),
             'sample_size', c.n,
             'median', case when c.med_v is not null then round(c.med_v::numeric, 2) end,
             'mad', case when c.mad_v is not null then round(c.mad_v::numeric, 2) end,
             'z', case when c.z is not null then round(c.z::numeric, 2) end,
             'reason', 'sigma'
           )
           order by c.stat_key
         ), '[]'::jsonb)
    into v_spikes
  from candidates c
  where c.z >= 3.5;

  -- OCR provenance: edits are always reported; counts cover unchanged reads.
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
  v_previous := public.ovr_projection(
    v_member, v_member_class, v_member_function, null, p_submission
  );
  v_projected := public.ovr_projection(
    v_member,
    v_class,
    v_function,
    (
      select jsonb_agg(jsonb_build_object('stat_key', ss.stat_key, 'value', ss.value))
      from submission_stats ss
      where ss.submission_id = p_submission
    ),
    null
  );
  v_swing_flagged :=
    not v_class_changed
    and not v_function_changed
    and v_previous is not null
    and v_projected is not null
    and abs(v_projected - v_previous) >= 8;

  -- Statistical curves for the Impositio-prone physical/magical attack pairs.
  v_curves := jsonb_build_array(
    public.curve_deviation(p_submission, v_class, v_function, 'patk', 'equip_patk_pct'),
    public.curve_deviation(p_submission, v_class, v_function, 'matk', 'equip_matk_pct')
  );
  v_curve_flagged := exists (
    select 1
    from jsonb_array_elements(v_curves) e
    where coalesce((e->>'flagged')::boolean, false)
  );

  return jsonb_build_object(
    'flagged',
      (jsonb_array_length(v_spikes) > 0) or v_swing_flagged or v_curve_flagged,
    'defense_spikes', v_spikes,
    'curve_deviations', v_curves,
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
  'Review-only anti-cheat flags for ONE pending submission (0046/0048/0049/0050). CURVE-ONLY reference: defense spikes appear only when rpdef/rmdef/equip_pdef_pct/equip_mdef_pct is >= 3.5 sigma above the cohort median (n >= 5); the average/ratio fields remain for backward-compatible clients but never flag. curve_deviations carries the PATK/Equip. PATK % and MATK/Equip. MATK % proportional curves, including the Impositio Manus undo test (flat/1.35, pct-35). Curves and OVR swings >= 8 points (class/role unchanged) set flagged=true. OCR edits are always reported. Internal: called only by the SECURITY DEFINER officer_queue().';

revoke execute on function public.defense_cohort_baselines() from public, anon;
grant execute on function public.defense_cohort_baselines() to authenticated;
revoke execute on function public.submission_anti_cheat(uuid) from public, anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0050', 'curve_only_reference', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
