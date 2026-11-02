-- NeoFoot migration 0070: flag an isolated equipment-% inflation.
--
-- WHY: 0049/0050 only flagged when the normalized BASE was a strong outlier or
-- the flat was 30% away from the curve. A submission that inflates ONLY the
-- equipment percentage (flat unchanged) lowers the base instead of raising it,
-- so a +20 p.p. outlier (measured live: z_pct 3.26, z_base -2.35) passed as
-- "consistent". That is exactly the shape a percentage-only buff produces.
--
-- WHAT: curve_deviation gains one additional 'curve' branch:
--   pct >= cohort median + 20 p.p.  AND  z_pct >= 2  AND  z_base <= -1.5
-- It is an ANOMALY (inconclusive), never 'impositio': a legitimate high-%
-- build can produce the same shape, so an officer reviews it; only the joint
-- flat+pct undo test may label a known buff.
--
-- Append-only: 0049 is not edited. Apply AFTER 0069:
--   node scripts/apply-seed.mjs supabase/migrations/0070_curve_pct_inflation.sql

begin;

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
  v_pct_inflation boolean := false;
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

  -- 0070: isolated percentage inflation. A legitimate high-% build also lowers
  -- the normalized base (flat unchanged / larger denominator), so this is an
  -- ANOMALY signal only (reason 'curve' -> inconclusive), never a buff label:
  -- the pct is at least 20 p.p. above the cohort median, a robust pct outlier,
  -- and the observed base is materially BELOW the curve.
  v_pct_inflation :=
    v_median_pct is not null
    and (v_pct - v_median_pct) >= 20
    and v_z_pct >= 2.0
    and v_z_base <= -1.5;

  -- General curve deviation: the normalized base is a strong outlier, the
  -- actual flat is 30% away from the curve, or the pct is an isolated
  -- inflation (above).
  v_curve := abs(v_z_base) >= 3.5
    or abs(coalesce(v_curve_dev, 0)) >= 0.30
    or v_pct_inflation;

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
  'Internal statistical curve (0049 + 0070): for ONE pending submission and a flat/percent pair (e.g. patk/equip_patk_pct), compute base = flat/(1+pct/100) over the same stats cohort (public.cohort_group + build-role, latest validated, self excluded), robust median/MAD, the expected flat for the submitted pct, the normalized-base sigma, the Impositio Manus undo test (flat/1.35, pct-35 -> base back on the curve), and the 0070 isolated-% inflation (pct >= median + 20 p.p., z_pct >= 2, z_base <= -1.5 -> reason curve). Requires n >= 5; otherwise available=false and no flag. Review aid only -- no client EXECUTE.';

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0070', 'curve_pct_inflation', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
