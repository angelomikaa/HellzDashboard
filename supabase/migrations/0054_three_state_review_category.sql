-- NeoFoot migration 0054: three-state officer review category.
--
-- Owner request (2026-10-31): the pending submission review should show THREE
-- categories for officers instead of a single "flagged" boolean:
--   consistent   (green)  — no anomaly and at least one reliable reference
--   inconclusive (yellow) — an anomaly without a known buff signature, OR no
--                           reliable reference could be evaluated
--   buffed       (orange) — a known buff signature was recognized
--
-- The classification is SERVER-SIDE (the UI only renders it). It uses the
-- evidence already computed by submission_anti_cheat:
--   - known buff patterns: history_deviations.pattern in (impositio, defense)
--     or curve_deviations.reason = 'impositio'  -> buffed
--   - any other anomaly: defense sigma spike, generic curve deviation, history
--     jump, OVR swing >= 8 -> inconclusive
--   - no reliable reference: cohort n < 5 (defense and curve) and no validated
--     history -> inconclusive even when there is no anomaly
--   - otherwise -> consistent
--
-- OCR edits are evidence but do NOT change the category by themselves (manual
-- fix-up is part of the normal flow).
--
-- Append-only. Apply AFTER 0053:
--   node scripts/apply-seed.mjs supabase/migrations/0054_three_state_review_category.sql

begin;

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
  v_curve_available := exists (
    select 1
    from jsonb_array_elements(v_curves) e
    where coalesce((e->>'available')::boolean, false)
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
    );

  v_anomaly :=
    (jsonb_array_length(v_spikes) > 0)
    or v_swing_flagged
    or v_curve_flagged
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

    if jsonb_array_length(v_reasons) = 0 then
      v_reasons := jsonb_build_array(
        'Curva de ataque deslocada no padrão Impositio Manus.'
      );
    end if;

  elsif v_anomaly or not v_cohort_available then
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
  'Review-only anti-cheat flags for ONE pending submission (0046..0054). Adds review.category: consistent (no anomaly + a reliable cohort/history reference), inconclusive (anomaly without a known buff signature, or no reliable reference), buffed (known Impositio/Angelus/Assumptio signature from history/curve). OCR edits are evidence only, never a category by themselves. Defense sigma, attack curves, self-history and OVR swing details stay in the payload. Internal: called only by the SECURITY DEFINER officer_queue().';

revoke execute on function public.submission_anti_cheat(uuid) from public, anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0054', 'three_state_review_category', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
