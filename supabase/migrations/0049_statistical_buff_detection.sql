-- NeoFoot migration 0049: statistical buff detection.
--
-- Owner request (2026-10-30): "instead of just considering the 1.5x margin,
-- lets use the data we already have to catch possible cheaters. another buff
-- that is frequently used to cheat is impositio manus, which gives +35% PATK
-- and MATK by raising its equipament ATK% stat. We can calculate the flat
-- stats and try to stabilish a curve, and look for deviations of the curve."
--
-- THREE changes, all review aids (nothing is auto-rejected):
--
-- 1. `curve_deviation()` — the proportional curve for a flat/percent pair.
--    For every active member of the same stats cohort (public.cohort_group +
--    build-role), latest VALIDATED value, self excluded:
--        base = flat / (1 + pct/100)
--    The cohort's robust centre is the MEDIAN of base (not the mean), with
--    MAD as the scale (floored at 5% of the median / 5 percentage points so a
--    small, tight cohort cannot explode the sigma). The expected flat for the
--    candidate's pct is `median_base * (1 + pct/100)`.
--
--    The Impositio Manus test removes the buff and checks whether the
--    DExBUFFED base lands on the cohort curve while the observed values do
--    not: flat/1.35, pct-35. That is the signature of a buffed submission.
--
-- 2. `submission_anti_cheat()` — defense spikes now also flag a robust sigma
--    (z >= 3.5, n >= 5) in addition to the 1.5x ratio, and the payload gains
--    `curve_deviations` for PATK/Equip. PATK % and MATK/Equip. MATK %.
--
-- 3. `stat_overview()` — the cross-cohort inspector gains the cohort MEDIAN,
--    MAD, sigma z and a direction-aware sigma-outlier flag per row, so the
--    Ranking inspector can show data-driven outliers for ANY stat (not just
--    the 1.5x ratio).
--
-- Statistical honesty: cohorts with fewer than 5 validated values get NO
-- curve/sigma flag (available=false / null z); the 1.5x ratio stays as the
-- safety net. A single buffed value cannot move the robust median/MAD the way
-- it moves a mean, so the baseline resists contamination.
--
-- Append-only. Apply AFTER 0048:
--   node scripts/apply-seed.mjs supabase/migrations/0049_statistical_buff_detection.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. curve_deviation() — internal helper: one flat/percent pair for ONE
--    pending submission. Impositio constants are the owner-stated +35% flat
--    and +35 percentage points on the equipment ATK%/MATK% stat.
-- ---------------------------------------------------------------------------

create or replace function public.curve_deviation(
  p_submission uuid,
  p_class text,
  p_function text,
  p_flat_key text,
  p_pct_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid;
  v_flat numeric;
  v_pct numeric;
  v_base numeric;
  v_base_debuff numeric;
  v_n int;
  v_median_base numeric;
  v_median_pct numeric;
  v_mad_base numeric;
  v_mad_pct numeric;
  v_scale_base numeric;
  v_scale_pct numeric;
  v_z_base numeric;
  v_z_pct numeric;
  v_z_debuff numeric;
  v_expected_flat numeric;
  v_curve_dev numeric;
  v_impositio boolean := false;
  v_curve boolean := false;
  v_flat_label text;
  v_pct_label text;
  v_flat_type text;
  v_pct_type text;
begin
  select s.member_id into v_member from submissions s where s.id = p_submission;

  select ss.value into v_flat
  from submission_stats ss
  where ss.submission_id = p_submission and ss.stat_key = p_flat_key;

  select ss.value into v_pct
  from submission_stats ss
  where ss.submission_id = p_submission and ss.stat_key = p_pct_key;

  select label, value_type into v_flat_label, v_flat_type
  from stat_catalog where stat_key = p_flat_key;
  select label, value_type into v_pct_label, v_pct_type
  from stat_catalog where stat_key = p_pct_key;

  if v_member is null or v_flat is null or v_pct is null
     or v_flat <= 0 or v_pct <= -100 then
    return jsonb_build_object(
      'available', false,
      'flagged', false,
      'reason', null,
      'flat_stat', p_flat_key,
      'pct_stat', p_pct_key,
      'flat_label', v_flat_label,
      'pct_label', v_pct_label,
      'flat_value_type', v_flat_type,
      'pct_value_type', v_pct_type,
      'flat_value', v_flat,
      'pct_value', v_pct,
      'sample_size', 0
    );
  end if;

  v_base := v_flat / (1 + v_pct / 100);

  with latest as (
    select distinct on (m.id, ss.stat_key)
           m.id as member_id, ss.stat_key, ss.value
    from members m
    join submissions s on s.member_id = m.id and s.status = 'validated'
    join submission_stats ss on ss.submission_id = s.id
    where m.active
      and public.cohort_group(m.char_class) = public.cohort_group(p_class)
      and m.char_function = p_function
      and m.id <> v_member
      and ss.stat_key in (p_flat_key, p_pct_key)
    order by m.id, ss.stat_key, s.submitted_at desc, s.id desc
  ),
  pairs as (
    select f.member_id, f.value as flat, pc.value as pct,
           f.value / (1 + pc.value / 100) as base
    from latest f
    join latest pc on pc.member_id = f.member_id and pc.stat_key = p_pct_key
    where f.stat_key = p_flat_key and f.value > 0 and pc.value > -100
  ),
  med as (
    select count(*) as n,
           percentile_cont(0.5) within group (order by base) as median_base,
           percentile_cont(0.5) within group (order by pct) as median_pct
    from pairs
  ),
  mad as (
    select med.n, med.median_base, med.median_pct,
           percentile_cont(0.5) within group (order by abs(p.base - med.median_base)) as mad_base,
           percentile_cont(0.5) within group (order by abs(p.pct - med.median_pct)) as mad_pct
    from pairs p
    cross join med
    group by med.n, med.median_base, med.median_pct
  )
  select n, median_base, median_pct, mad_base, mad_pct
    into v_n, v_median_base, v_median_pct, v_mad_base, v_mad_pct
  from mad;

  if coalesce(v_n, 0) < 5 or v_median_base is null then
    return jsonb_build_object(
      'available', false,
      'flagged', false,
      'reason', null,
      'flat_stat', p_flat_key,
      'pct_stat', p_pct_key,
      'flat_label', v_flat_label,
      'pct_label', v_pct_label,
      'flat_value_type', v_flat_type,
      'pct_value_type', v_pct_type,
      'flat_value', round(v_flat, 2),
      'pct_value', round(v_pct, 2),
      'base_value', round(v_base, 2),
      'sample_size', coalesce(v_n, 0)
    );
  end if;

  -- Robust scale: MAD * 1.4826 with a 5%-of-median / 5-point floor. A tight
  -- cohort can never produce an infinite sigma.
  v_scale_base := greatest(1.4826 * coalesce(v_mad_base, 0), 0.05 * abs(v_median_base), 1);
  v_scale_pct := greatest(1.4826 * coalesce(v_mad_pct, 0), 5);
  v_z_base := (v_base - v_median_base) / v_scale_base;
  v_z_pct := (v_pct - v_median_pct) / v_scale_pct;
  v_expected_flat := v_median_base * (1 + v_pct / 100);
  v_curve_dev := case when v_expected_flat <> 0 then v_flat / v_expected_flat - 1 end;

  -- Impositio Manus undo: flat / 1.35 and pct - 35 percentage points.
  if v_pct - 35 > -100 then
    v_base_debuff := v_flat / 1.35 / (1 + (v_pct - 35) / 100);
    v_z_debuff := (v_base_debuff - v_median_base) / v_scale_base;
  end if;

  -- The pct is a high outlier, the observed base is at least 1 sigma high,
  -- and removing the buff puts the base BACK on the cohort curve.
  v_impositio :=
    v_z_pct >= 2.0
    and v_z_base >= 1.0
    and v_z_debuff is not null
    and abs(v_z_debuff) <= 1.5
    and v_z_debuff < v_z_base - 0.5;

  -- General curve deviation: the normalized base is a strong outlier, or the
  -- actual flat is 30% away from what the cohort curve predicts for this pct.
  v_curve := abs(v_z_base) >= 3.5 or abs(coalesce(v_curve_dev, 0)) >= 0.30;

  return jsonb_build_object(
    'available', true,
    'flagged', v_impositio or v_curve,
    'reason', case
      when v_impositio then 'impositio'
      when v_curve then 'curve'
    end,
    'flat_stat', p_flat_key,
    'pct_stat', p_pct_key,
    'flat_label', v_flat_label,
    'pct_label', v_pct_label,
    'flat_value_type', v_flat_type,
    'pct_value_type', v_pct_type,
    'flat_value', round(v_flat, 2),
    'pct_value', round(v_pct, 2),
    'base_value', round(v_base, 2),
    'median_base', round(v_median_base::numeric, 2),
    'median_pct', round(v_median_pct::numeric, 2),
    'mad_base', round(v_mad_base::numeric, 2),
    'mad_pct', round(v_mad_pct::numeric, 2),
    'z_base', round(v_z_base::numeric, 2),
    'z_pct', round(v_z_pct::numeric, 2),
    'expected_flat', round(v_expected_flat::numeric, 2),
    'curve_deviation_pct', round((v_curve_dev * 100)::numeric, 2),
    'base_debuff', case when v_base_debuff is not null then round(v_base_debuff, 2) end,
    'z_debuff', case when v_z_debuff is not null then round(v_z_debuff::numeric, 2) end,
    'sample_size', v_n
  );
end;
$$;

comment on function public.curve_deviation(uuid, text, text, text, text) is
  'Internal statistical curve (0049): for ONE pending submission and a flat/percent pair (e.g. patk/equip_patk_pct), compute base = flat/(1+pct/100) over the same stats cohort (public.cohort_group + build-role, latest validated, self excluded), robust median/MAD, the expected flat for the submitted pct, the normalized-base sigma, and the Impositio Manus undo test (flat/1.35, pct-35 -> base back on the curve). Requires n >= 5; otherwise available=false and no flag. Review aid only -- no client EXECUTE.';

revoke execute on function public.curve_deviation(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. submission_anti_cheat() — 0048 body + defense sigma + curve_deviations.
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
  -- Literal identity change (owner rule: warning only when class/role are
  -- unchanged). The STATS math below still scopes by cohort_group().
  v_class_changed := v_class is distinct from v_member_class;
  v_function_changed := v_function is distinct from v_member_function;

  -- Defense buff spikes: 1.5x the cohort AVERAGE (existing rule) OR a robust
  -- sigma >= 3.5 vs the cohort MEDIAN (n >= 5).
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
             'reason', case
               when c.avg_v > 0 and c.value >= 1.5 * c.avg_v and c.z >= 3.5 then 'both'
               when c.avg_v > 0 and c.value >= 1.5 * c.avg_v then 'ratio'
               when c.z >= 3.5 then 'sigma'
             end
           )
           order by c.stat_key
         ), '[]'::jsonb)
    into v_spikes
  from candidates c
  where (c.avg_v > 0 and c.value >= 1.5 * c.avg_v) or c.z >= 3.5;

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
  'Review-only anti-cheat flags for ONE pending submission (0046/0048/0049). Defense spikes = rpdef/rmdef/equip_pdef_pct/equip_mdef_pct flagged by the 1.5x cohort-average ratio AND/OR a robust sigma >= 3.5 vs the cohort median (n >= 5); each entry carries median/mad/z/reason. curve_deviations carries the PATK/Equip. PATK % and MATK/Equip. MATK % proportional curves, including the Impositio Manus undo test (flat/1.35, pct-35). Defense spikes, curves and OVR swings >= 8 points (class/role unchanged) set flagged=true. OCR edits are always reported. Internal: called only by the SECURITY DEFINER officer_queue().';

-- ---------------------------------------------------------------------------
-- 3. stat_overview() — 0048 body + cohort median/MAD/sigma per row.
-- ---------------------------------------------------------------------------

create or replace function public.stat_overview(p_stat_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_label text;
  v_label_short text;
  v_group text;
  v_type text;
  v_dir text;
begin
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  select label, label_short, group_name, value_type, stat_direction
    into v_label, v_label_short, v_group, v_type, v_dir
  from stat_catalog
  where stat_key = p_stat_key;

  if not found then
    raise exception 'unknown_stat';
  end if;

  return (
    with latest as (
      select distinct on (m.id)
             m.id as member_id,
             m.char_class,
             m.char_function,
             ss.value,
             s.submitted_at
      from members m
      join submissions s on s.member_id = m.id and s.status = 'validated'
      join submission_stats ss on ss.submission_id = s.id and ss.stat_key = p_stat_key
      where m.active
        and m.discord_handle not like 'smoke%'
        and m.discord_handle not like 'dummy-%'
      order by m.id, s.submitted_at desc, s.id desc
    ),
    roster as (
      select m.id as member_id, m.display_name, m.char_id, m.char_class, m.char_function
      from members m
      where m.active
        and m.discord_handle not like 'smoke%'
        and m.discord_handle not like 'dummy-%'
    ),
    guild as (
      select count(*) as n,
             avg(value) as avg_v,
             min(value) as min_v,
             max(value) as max_v,
             percentile_cont(0.5) within group (order by value) as median_v
      from latest
    )
    select jsonb_build_object(
      'stat_key', p_stat_key,
      'label', v_label,
      'label_short', v_label_short,
      'group_name', v_group,
      'value_type', v_type,
      'stat_direction', v_dir,
      'guild', jsonb_build_object(
        'sample_size', g.n,
        'average', case when g.n > 0 then round(g.avg_v, 2) end,
        'median', case when g.n > 0 then round(g.median_v::numeric, 2) end,
        'max', g.max_v,
        'min', g.min_v
      ),
      'rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'member_id', r.member_id,
            'display_name', r.display_name,
            'char_id', r.char_id,
            'char_class', r.char_class,
            'char_function', r.char_function,
            'value', l.value,
            'submitted_at', l.submitted_at,
            'class_average', case when a.n >= 3 then round(a.avg_v, 2) end,
            'class_median', case when a.n >= 3 then round(a.med_v::numeric, 2) end,
            'class_mad', case when a.n >= 5 then round(am.mad_v::numeric, 2) end,
            'class_sample_size', a.n,
            'class_z', case
              when l.value is not null and a.n >= 5 and a.med_v > 0
                   and am.mad_v > 0 then
                round(((l.value - a.med_v)
                  / greatest(1.4826 * am.mad_v, 0.05 * abs(a.med_v), 1))::numeric, 2)
            end,
            'class_sigma_outlier', case
              when l.value is null or a.n < 5 or a.med_v is null or a.med_v = 0
                   or am.mad_v is null or am.mad_v = 0 then false
              when v_dir = 'lower' then
                (l.value - a.med_v)
                  / greatest(1.4826 * am.mad_v, 0.05 * abs(a.med_v), 1) <= -3.5
              else
                (l.value - a.med_v)
                  / greatest(1.4826 * am.mad_v, 0.05 * abs(a.med_v), 1) >= 3.5
            end,
            'cohort_ratio', case
              when l.value is not null and a.avg_v > 0
                then round(l.value / a.avg_v, 2)
            end,
            'guild_ratio', case
              when l.value is not null and g.avg_v > 0
                then round(l.value / g.avg_v, 2)
            end,
            'cohort_outlier', case
              when l.value is null or a.n < 3 or a.avg_v is null or a.avg_v <= 0 then false
              when v_dir = 'lower' then l.value <= 0.5 * a.avg_v
              else l.value >= 1.5 * a.avg_v
            end,
            'guild_outlier', case
              when l.value is null or g.n < 3 or g.avg_v is null or g.avg_v <= 0 then false
              when v_dir = 'lower' then l.value <= 0.5 * g.avg_v
              else l.value >= 1.5 * g.avg_v
            end
          )
          order by l.value desc nulls last, r.display_name
        )
        from roster r
        left join latest l on l.member_id = r.member_id
        left join lateral (
          select avg(l2.value) as avg_v,
                 count(*) as n,
                 percentile_cont(0.5) within group (order by l2.value) as med_v
          from latest l2
          where public.cohort_group(l2.char_class) = public.cohort_group(r.char_class)
            and l2.char_function = r.char_function
            and l2.member_id <> r.member_id
        ) a on true
        left join lateral (
          select percentile_cont(0.5) within group (order by abs(l3.value - a.med_v)) as mad_v
          from latest l3
          where public.cohort_group(l3.char_class) = public.cohort_group(r.char_class)
            and l3.char_function = r.char_function
            and l3.member_id <> r.member_id
        ) am on true
        cross join guild g
      ), '[]'::jsonb)
    )
    from guild g
  );
end;
$$;

comment on function public.stat_overview(text) is
  'Staff-only cross-cohort stat inspector for the Ranking tab (0047/0048/0049). For ONE stat_key: catalog metadata, guild aggregates over the latest VALIDATED value per active real member (smoke/dummy excluded), and one row per active real member with value, latest submission time, class average/median/MAD under public.cohort_group(char_class)+build-role (Artista includes Bard and Gypsy; self excluded), cohort sigma z and direction-aware sigma >= 3.5 outlier (n >= 5), the 1.5x cohort/guild ratios, and both outlier hints. Members without a value return value null. Internal gate: member_role in (officer,owner) AND caller active.';

-- Restate the grant contract (create-or-replace keeps grants, this is explicit).
revoke execute on function public.submission_anti_cheat(uuid) from public, anon, authenticated;
revoke execute on function public.stat_overview(text) from public, anon;
grant execute on function public.stat_overview(text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0049', 'statistical_buff_detection', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
