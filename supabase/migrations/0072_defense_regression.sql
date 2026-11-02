-- NeoFoot migration 0072: PDEF/MDEF regression with both Assumptio directions.
--
-- WHY: the attack curves cover PATK/MATK, and the defense signal was only a
-- sigma spike plus the +95 p.p. window. The 0052 dashboard model tests only
-- y-scale (RPDEF / 1.95). The common Assumptio case is an x-shift: the
-- equipment PDEF % jumps +95 p.p. while the raw RPDEF stays put, which leaves
-- the pair FAR BELOW the cohort's RPDEF x PDEF% curve. The anti-cheat could
-- not see that shape, and the post-submit panel only had an ATK/MATK curve.
--
-- WHAT:
--   1. defense_curve(): OLS over the same stats cohort (latest validated, self
--      excluded, n >= 5), median/MAD residual scale, and two hypotheses:
--        x-shift: expected flat at (pct - 95)
--        y-scale: expected flat at (flat / 1.95)
--      available only when R2 >= 0.25 (the dashboard's defense floor).
--   2. submission_anti_cheat() returns defense_curves for RPDEF/PDEF% and
--      RMDEF/MDEF%, and marks a strong x-shift/y-scale residual as an anomaly
--      (inconclusive) with an explicit Assumptio reason. The +80..110 p.p. /
--      x1.6..2.3 known signature remains the only defense "buffed" label
--      (0071), so a weak regression can never accuse by itself.
--
-- Append-only: 0071 is not edited. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0072_defense_regression.sql

begin;

-- Defense pair regression (RPDEF/RMDEF x Equip. PDEF/MDEF %), 0072.
-- OLS over the same stats cohort (latest validated, self excluded, n >= 5),
-- with the two Assumptio hypotheses and the known +95 p.p. / x1.95 signature.
create or replace function public.defense_curve(
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
  v_flat numeric;
  v_pct numeric;
  v_flat_label text;
  v_pct_label text;
  v_n int;
  v_slope numeric;
  v_intercept numeric;
  v_r2 numeric;
  v_scale numeric;
  v_median_flat numeric;
  v_median_pct numeric;
  v_expected numeric;
  v_residual numeric;
  v_z numeric;
  v_x_expected numeric;
  v_x_residual numeric;
  v_x_score numeric;
  v_y_residual numeric;
  v_y_score numeric;
  v_signature text;
begin
  select max(ss.value) filter (where ss.stat_key = p_flat_key),
         max(ss.value) filter (where ss.stat_key = p_pct_key)
    into v_flat, v_pct
  from submission_stats ss
  where ss.submission_id = p_submission;

  select label into v_flat_label from stat_catalog where stat_key = p_flat_key;
  select label into v_pct_label from stat_catalog where stat_key = p_pct_key;

  with latest as (
    select distinct on (s.member_id) s.id
    from submissions s
    join members m on m.id = s.member_id
    where s.status = 'validated'
      and m.active
      and public.cohort_group(m.char_class) = public.cohort_group(p_class)
      and m.char_function = p_function
      and s.member_id <> (
        select s2.member_id from submissions s2 where s2.id = p_submission
      )
    order by s.member_id, s.submitted_at desc, s.id desc
  ),
  pair_rows as (
    select l.id,
           max(ss.value) filter (where ss.stat_key = p_flat_key) as flat,
           max(ss.value) filter (where ss.stat_key = p_pct_key) as pct
    from latest l
    join submission_stats ss on ss.submission_id = l.id
    where ss.stat_key in (p_flat_key, p_pct_key)
    group by l.id
  ),
  usable as (
    select flat, pct from pair_rows where flat is not null and pct is not null
  ),
  agg as (
    select count(*) as n,
           regr_slope(flat, pct) as slope,
           regr_intercept(flat, pct) as intercept,
           regr_r2(flat, pct) as r2,
           percentile_cont(0.5) within group (order by flat) as median_flat,
           percentile_cont(0.5) within group (order by pct) as median_pct
    from usable
  ),
  residuals as (
    select u.flat - (a.intercept + a.slope * u.pct) as r
    from usable u cross join agg a
  ),
  med as (
    select percentile_cont(0.5) within group (order by r) as m from residuals
  ),
  mad as (
    select percentile_cont(0.5) within group (order by abs(r - med.m)) as v
    from residuals cross join med
  )
  select a.n, a.slope, a.intercept, a.r2, a.median_flat, a.median_pct,
         greatest(1.4826 * coalesce(mad.v, 0), 1)
    into v_n, v_slope, v_intercept, v_r2, v_median_flat, v_median_pct, v_scale
  from agg a cross join mad;

  if v_flat is null or v_pct is null or coalesce(v_n, 0) < 5
     or v_slope is null or v_intercept is null then
    return jsonb_build_object(
      'available', false,
      'flat_stat', p_flat_key,
      'pct_stat', p_pct_key,
      'flat_label', v_flat_label,
      'pct_label', v_pct_label,
      'flat_value', v_flat,
      'pct_value', v_pct,
      'sample_size', coalesce(v_n, 0)
    );
  end if;

  v_expected := v_intercept + v_slope * v_pct;
  v_residual := v_flat - v_expected;
  v_z := v_residual / v_scale;

  -- x-shift: the buff is on the percentage (+95 p.p.); the raw defense stays.
  v_x_expected := v_intercept + v_slope * (v_pct - 95);
  v_x_residual := v_flat - v_x_expected;
  v_x_score := (abs(v_residual) - abs(v_x_residual)) / v_scale;

  -- y-scale: the buff multiplies the raw defense (x1.95).
  v_y_residual := (v_flat / 1.95) - v_expected;
  v_y_score := (abs(v_residual) - abs(v_y_residual)) / v_scale;

  v_signature := case
    when v_median_pct is not null and (v_pct - v_median_pct) between 80 and 110 then 'defense'
    when v_median_flat is not null and v_median_flat > 0
         and v_flat / v_median_flat between 1.6 and 2.3 then 'defense'
  end;

  return jsonb_build_object(
    'available', coalesce(v_r2, 0) >= 0.25,
    'flat_stat', p_flat_key,
    'pct_stat', p_pct_key,
    'flat_label', v_flat_label,
    'pct_label', v_pct_label,
    'flat_value', round(v_flat, 2),
    'pct_value', round(v_pct, 2),
    'sample_size', v_n,
    'r2', round(v_r2::numeric, 3),
    'slope', round(v_slope::numeric, 2),
    'intercept', round(v_intercept::numeric, 2),
    'expected_flat', round(v_expected::numeric, 2),
    'residual', round(v_residual::numeric, 2),
    'z_residual', round(v_z::numeric, 2),
    'x_shift_expected', round(v_x_expected::numeric, 2),
    'x_shift_residual', round(v_x_residual::numeric, 2),
    'x_shift_score', round(v_x_score::numeric, 2),
    'x_shift_possible',
      v_x_score >= 1.5 and abs(v_residual) >= 2 * v_scale and v_residual < 0,
    'y_scale_expected', round((v_flat / 1.95)::numeric, 2),
    'y_scale_residual', round(v_y_residual::numeric, 2),
    'y_scale_score', round(v_y_score::numeric, 2),
    'y_scale_possible',
      v_y_score >= 1.5 and abs(v_residual) >= 2 * v_scale and v_residual > 0,
    'signature', v_signature
  );
end;
$$;

comment on function public.defense_curve(uuid, text, text, text, text) is
  'Internal defense regression (0072): RPDEF/RMDEF x Equip. PDEF/MDEF % OLS over the stats cohort (latest validated, self excluded, n >= 5), robust residual scale, and BOTH Assumptio hypotheses — x-shift (+95 p.p. on the %) and y-scale (x1.95 on the raw defense). Requires R2 >= 0.25 for available=true. Review aid only; no client EXECUTE.';

revoke all on function public.defense_curve(uuid, text, text, text, text) from public, anon, authenticated;


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
  v_defense_curves jsonb;
  v_defense_flagged boolean;
  v_curve_available boolean;
  v_cohort_defense_available boolean;
  v_cohort_available boolean;
  v_history jsonb;
  v_history_flagged boolean;
  v_history_available boolean;
  v_history_sample_size int;
  v_buffed boolean;
  v_anomaly boolean;
  v_category text;
  v_reasons jsonb;
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
  -- cached clients, but they never flag on their own.
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
           end as z,
           -- 0071: the known Angelus/Assumptio shape measured against the
           -- COHORT median, so it also works on a first submission (no history).
           case
             when bm.med_v is null then null
             when ss.stat_key in ('equip_pdef_pct', 'equip_mdef_pct')
                  and ss.value - bm.med_v between 80 and 110 then 'defense'
             when ss.stat_key in ('rpdef', 'rmdef')
                  and bm.med_v > 0
                  and ss.value / bm.med_v between 1.6 and 2.3 then 'defense'
           end as signature
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
             'reason', 'sigma',
             'signature', c.signature
           )
           order by c.stat_key
         ), '[]'::jsonb)
    into v_spikes
  from candidates c
  where c.z >= 3.5 or c.signature is not null;

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
  v_curve_available := exists (
    select 1
    from jsonb_array_elements(v_curves) e
    where coalesce((e->>'available')::boolean, false)
  );

  -- 0072: defense regression curves with BOTH Assumptio hypotheses:
  --   x-shift: +95 p.p. on Equip. PDEF/MDEF % (the common case; the raw
  --            defense ends up BELOW the cohort curve)
  --   y-scale: x1.95 on RPDEF/RMDEF (the original 0052 hypothesis)
  v_defense_curves := jsonb_build_array(
    public.defense_curve(p_submission, v_class, v_function, 'rpdef', 'equip_pdef_pct'),
    public.defense_curve(p_submission, v_class, v_function, 'rmdef', 'equip_mdef_pct')
  );
  v_defense_flagged := exists (
    select 1
    from jsonb_array_elements(v_defense_curves) e
    where coalesce((e->>'available')::boolean, false)
      and (
        coalesce((e->>'x_shift_possible')::boolean, false)
        or coalesce((e->>'y_scale_possible')::boolean, false)
      )
  );

  -- Defense baseline availability (latest validated, self excluded, n >= 5).
  select exists (
    select 1
    from (
      select ss2.stat_key
      from submission_stats ss2
      join submissions s2 on s2.id = ss2.submission_id
      join members m2 on m2.id = s2.member_id
      where s2.status = 'validated'
        and m2.active
        and public.cohort_group(m2.char_class) = public.cohort_group(v_class)
        and m2.char_function = v_function
        and s2.member_id <> v_member
        and ss2.stat_key in ('rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct')
      group by ss2.stat_key
      having count(distinct s2.member_id) >= 5
    ) x
  ) into v_cohort_defense_available;

  v_cohort_available :=
    v_curve_available or v_cohort_defense_available or (jsonb_array_length(v_spikes) > 0);

  -- Self-history reference: works even when the cohort is below n=5.
  v_history := public.member_history_deviations(p_submission, v_member);
  v_history_flagged := exists (
    select 1
    from jsonb_array_elements(v_history) e
    where coalesce((e->>'flagged')::boolean, false)
  );

  select count(*) into v_history_sample_size
  from submissions s
  where s.member_id = v_member and s.status = 'validated';
  v_history_available := coalesce(v_history_sample_size, 0) > 0;

  -- Known buff signature wins; any other anomaly (or no reference at all) is
  -- inconclusive; a clean evaluation with a reliable reference is consistent.
  v_buffed :=
    exists (
      select 1 from jsonb_array_elements(v_history) e
      where e->>'pattern' in ('impositio', 'defense')
    )
    or exists (
      select 1 from jsonb_array_elements(v_curves) e
      where e->>'reason' = 'impositio'
    )
    or exists (
      select 1 from jsonb_array_elements(v_spikes) e
      where e->>'signature' = 'defense'
    );

  v_anomaly :=
    (jsonb_array_length(v_spikes) > 0)
    or v_swing_flagged
    or v_curve_flagged
    or v_defense_flagged
    or exists (
      select 1 from jsonb_array_elements(v_history) e
      where e->>'pattern' = 'history_jump'
    );

  v_reasons := '[]'::jsonb;

  if v_buffed then
    v_category := 'buffed';
    select coalesce(jsonb_agg(
             case e->>'pattern'
               when 'impositio' then
                 'Impositio Manus em ' || (e->>'label') || ' (' ||
                 replace(e->>'delta', '.', ',') || ' p.p.)'
               when 'defense' then
                 'Angelus/Assumptio em ' || (e->>'label') || ' (' ||
                 case
                   when e->>'value_type' = 'percentual'
                     then replace(e->>'delta', '.', ',') || ' p.p.'
                   else replace(e->>'delta_pct', '.', ',') || '%'
                 end || ')'
             end
             order by e->>'stat_key'
           ), '[]'::jsonb)
      into v_reasons
      from jsonb_array_elements(v_history) e
    where e->>'pattern' in ('impositio', 'defense');

    -- 0071: the cohort-level defense signature (first submission) carries the
    -- same known-buff label as the history detector.
    if not exists (
      select 1 from jsonb_array_elements(v_history) e
      where e->>'pattern' = 'defense'
    ) then
      v_reasons := v_reasons || coalesce((
        select jsonb_agg(
          'Angelus/Assumptio em ' || (e->>'label') || ' (' ||
          case
            when e->>'value_type' = 'percentual'
              then replace(round(((e->>'value')::numeric - (e->>'median')::numeric)::numeric, 2)::text, '.', ',') || ' p.p. acima da mediana'
            else replace((e->>'ratio'), '.', ',') || 'x a mediana'
          end || ')'
          order by e->>'stat_key'
        )
        from jsonb_array_elements(v_spikes) e
        where e->>'signature' = 'defense'
      ), '[]'::jsonb);
    end if;

    if jsonb_array_length(v_reasons) = 0 then
      v_reasons := jsonb_build_array(
        'Curva de ataque deslocada no padrão Impositio Manus.'
      );
    end if;

  -- 0068: the documented rule is "inconclusive only when NO reference is
  -- available". 0054 forced inconclusive whenever the cohort was below n=5,
  -- even when the member's own validated history was a usable reference — so a
  -- clean resubmission could never reach "consistent" in a small cohort.
  elsif v_anomaly or not (v_cohort_available or v_history_available) then
    v_category := 'inconclusive';

    if not v_cohort_available and not v_history_available then
      v_reasons := v_reasons || jsonb_build_array(
        'Sem baseline de coorte (n<5) nem histórico validado.'
      );
    end if;
    if jsonb_array_length(v_spikes) > 0 then
      v_reasons := v_reasons || jsonb_build_array(
        'Desvio de defesa fora da curva, sem padrão de buff reconhecido.'
      );
    end if;
    if v_curve_flagged then
      v_reasons := v_reasons || jsonb_build_array(
        'Desvio da curva de ataque sem padrão de buff reconhecido.'
      );
    end if;
    if v_defense_flagged then
      v_reasons := v_reasons || jsonb_build_array(
        'Defesa (PDEF/MDEF) fora da curva — a hipótese Assumptio (+95 p.p. / ÷1,95) explica o desvio.'
      );
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_history) e
      where e->>'pattern' = 'history_jump'
    ) then
      v_reasons := v_reasons || jsonb_build_array(
        'Salto no histórico sem padrão de buff reconhecido.'
      );
    end if;
    if v_swing_flagged then
      v_reasons := v_reasons || jsonb_build_array(
        'OVR variou 8 pontos ou mais sem mudança de classe/função.'
      );
    end if;
    if jsonb_array_length(v_reasons) = 0 then
      v_reasons := jsonb_build_array(
        'Dados insuficientes para separar buff de variação de build.'
      );
    end if;

  else
    v_category := 'consistent';
    v_reasons := jsonb_build_array(
      'Dentro das referências disponíveis (coorte/histórico).'
    );
  end if;

  return jsonb_build_object(
    'flagged', v_category <> 'consistent',
    'review', jsonb_build_object(
      'category', v_category,
      'cohort_available', v_cohort_available,
      'history_available', v_history_available,
      'history_sample_size', coalesce(v_history_sample_size, 0),
      'reasons', v_reasons
    ),
    'defense_spikes', v_spikes,
    'defense_curves', v_defense_curves,
    'curve_deviations', v_curves,
    'history_deviations', v_history,
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
  'Officer review evidence (0046/0049/0050/0053/0054/0068/0071 + 0072): defense sigma, PATK/MATK curves, PDEF/MDEF regression curves (x-shift +95 p.p. and y-scale x1.95), member-history deviations, OCR overrides and OVR swing, plus the three-state review category. Known buff signatures -> buffed; any other anomaly (including a strong defense-regression residual) -> inconclusive; a clean evaluation with EITHER a cohort curve (n>=5) or the member''s own validated history -> consistent; no reference at all -> inconclusive.';

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0072', 'defense_regression', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
