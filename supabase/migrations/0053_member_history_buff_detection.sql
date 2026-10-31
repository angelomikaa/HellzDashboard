-- NeoFoot migration 0053: member-history buff detection.
--
-- Investigation 2026-10-31 (owner seeded a buffed batch): the pending rows in
-- small cohorts could not be flagged because the cohort curve/sigma requires
-- n >= 5 (Ahrya / High Priest-suporte has only 3 real members). The seed
-- changed the percentages by the buff amounts (+35 p.p. MATK%/PATK%, +95 p.p.
-- PDEF%/MDEF%) but the cohort baseline was unavailable.
--
-- This migration adds a SECOND, independent reference: the member's own
-- validated history. For the buff-sensitive stats it compares the pending
-- value with the member's latest validated value and flags the known buff
-- signatures:
--   - Impositio Manus: equip_matk_pct / equip_patk_pct +25..45 p.p.
--   - Angelus/Assumptio: equip_pdef_pct / equip_mdef_pct +80..110 p.p.
--   - the defense base ratio rpdef/rmdef x1.6..2.3 (~+95%)
--   - a generic history jump: robust z >= 3.5, percentage delta >= 20 p.p.,
--     or flat relative jump >= 25%
--
-- It is still a review aid: no auto-rejection. It uses only existing data and
-- works even when the cohort is too small for the population curve. The
-- regression dashboard remains validated-only; pending rows are reviewed in
-- Validações with this new evidence.
--
-- Append-only. Apply AFTER 0052:
--   node scripts/apply-seed.mjs supabase/migrations/0053_member_history_buff_detection.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. member_history_deviations() — pending vs the member's own validated
--    history. Internal helper (no client EXECUTE).
-- ---------------------------------------------------------------------------

create or replace function public.member_history_deviations(
  p_submission uuid,
  p_member uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with pending as (
    select ss.stat_key, ss.value
    from submission_stats ss
    where ss.submission_id = p_submission
      and ss.stat_key in (
        'matk', 'equip_matk_pct', 'patk', 'equip_patk_pct',
        'rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct'
      )
  ),
  prev_all as (
    select ss.stat_key, ss.value, s.submitted_at,
           row_number() over (
             partition by ss.stat_key
             order by s.submitted_at desc, s.id desc
           ) as rn
    from submission_stats ss
    join submissions s on s.id = ss.submission_id
    where s.member_id = p_member
      and s.status = 'validated'
      and ss.stat_key in (
        'matk', 'equip_matk_pct', 'patk', 'equip_patk_pct',
        'rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct'
      )
  ),
  latest_prev as (
    select stat_key, value, submitted_at
    from prev_all
    where rn = 1
  ),
  hist as (
    select stat_key, value
    from prev_all
    where rn <= 10
  ),
  hist_stats as (
    select stat_key, count(*) as n,
           percentile_cont(0.5) within group (order by value) as med_v
    from hist
    group by stat_key
  ),
  hist_mad as (
    select h.stat_key,
           percentile_cont(0.5) within group (order by abs(h.value - hs.med_v)) as mad_v
    from hist h
    join hist_stats hs on hs.stat_key = h.stat_key
    group by h.stat_key
  ),
  rows as (
    select p.stat_key, sc.label, sc.value_type, p.value,
           lp.value as prev_value,
           hs.n as history_n,
           hs.med_v as history_med,
           hm.mad_v as history_mad
    from pending p
    join stat_catalog sc on sc.stat_key = p.stat_key
    join latest_prev lp on lp.stat_key = p.stat_key
    left join hist_stats hs on hs.stat_key = p.stat_key
    left join hist_mad hm on hm.stat_key = p.stat_key
  ),
  calc as (
    select *,
           value - prev_value as delta,
           case
             when prev_value <> 0 then (value - prev_value) / abs(prev_value) * 100
           end as delta_pct,
           case
             when history_mad is not null and history_mad > 0
               then (value - history_med) / (1.4826 * history_mad)
           end as z
    from rows
  ),
  classified as (
    select *,
           case
             when value_type = 'percentual'
                  and stat_key in ('equip_matk_pct', 'equip_patk_pct')
                  and delta between 25 and 45 then 'impositio'
             when value_type = 'percentual'
                  and stat_key in ('equip_pdef_pct', 'equip_mdef_pct')
                  and delta between 80 and 110 then 'defense'
             when stat_key in ('rpdef', 'rmdef')
                  and prev_value > 0
                  and value / prev_value between 1.6 and 2.3 then 'defense'
             when z is not null and z >= 3.5 then 'history_jump'
             when value_type = 'percentual' and abs(delta) >= 20 then 'history_jump'
             when value_type = 'flat'
                  and prev_value > 0
                  and abs((value - prev_value) / prev_value) >= 0.25 then 'history_jump'
           end as pattern
    from calc
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'stat_key', c.stat_key,
             'label', c.label,
             'value_type', c.value_type,
             'previous', round(c.prev_value, 2),
             'value', round(c.value, 2),
             'delta', round(c.delta, 2),
             'delta_pct', round(c.delta_pct::numeric, 2),
             'history_median', case when c.history_med is not null then round(c.history_med::numeric, 2) end,
             'history_mad', case when c.history_mad is not null then round(c.history_mad::numeric, 2) end,
             'history_sample_size', c.history_n,
             'z', case when c.z is not null then round(c.z::numeric, 2) end,
             'pattern', c.pattern,
             'flagged', c.pattern is not null
           )
           order by case c.pattern
                      when 'impositio' then 0
                      when 'defense' then 1
                      when 'history_jump' then 2
                      else 3
                    end,
                    c.stat_key
         ), '[]'::jsonb)
  from classified c
  where c.pattern is not null;
$$;

comment on function public.member_history_deviations(uuid, uuid) is
  'Internal member-history buff detector (0053): compares a pending submission''s buff-sensitive stats with the member''s latest validated value and history (last 10). Known signatures: Impositio +25..45 p.p. on equip MATK/PATK %, Angelus/Assumptio +80..110 p.p. on equip PDEF/MDEF % or rpdef/rmdef x1.6..2.3; generic history jump at robust z >= 3.5, >= 20 p.p. on a percent, or >= 25% on a flat. Returns only noteworthy entries; empty array when there is no validated history or no deviation. Review aid only.';

revoke execute on function public.member_history_deviations(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. submission_anti_cheat() — 0050 body + history_deviations.
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
  v_history jsonb;
  v_history_flagged boolean;
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

  -- Self-history reference: works even when the cohort is below n=5.
  v_history := public.member_history_deviations(p_submission, v_member);
  v_history_flagged := exists (
    select 1
    from jsonb_array_elements(v_history) e
    where coalesce((e->>'flagged')::boolean, false)
  );

  return jsonb_build_object(
    'flagged',
      (jsonb_array_length(v_spikes) > 0) or v_swing_flagged
        or v_curve_flagged or v_history_flagged,
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
  'Review-only anti-cheat flags for ONE pending submission (0046/0048/0049/0050/0053). Curve-only cohort defense sigma (n >= 5), PATK/MATK proportional curves with the Impositio undo test, and a SELF-HISTORY reference that catches the known buff signatures even in small cohorts (Impositio +25..45 p.p. on equip MATK/PATK %, Angelus/Assumptio +80..110 p.p. on equip PDEF/MDEF % or rpdef/rmdef x1.6..2.3, generic history jump). Curves, spikes, history or an OVR swing >= 8 points (class/role unchanged) set flagged=true. OCR edits are always reported. Internal: called only by the SECURITY DEFINER officer_queue().';

revoke execute on function public.submission_anti_cheat(uuid) from public, anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0053', 'member_history_buff_detection', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
