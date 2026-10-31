-- NeoFoot migration 0048: align the anti-cheat baselines and the cross-cohort
-- inspector with the Artista merged cohort (0038).
--
-- WHY: 0046/0047 compared `char_class` directly. Since 0038, every rank RPC
-- scopes by `public.cohort_group(char_class)` and reads class_key_stats under
-- that group — Bard and Gypsy are ONE `Artista` stats cohort with ONE 6-key
-- config. Raw-class comparison would therefore:
--   - compare a Menestrel only against other Menestrels (and vice versa),
--     weakening the 1.5x anti-cheat baseline and the inspector's class average;
--   - leave `ovr_projection` with NO key config for Bard/Gypsy (0038 deleted
--     their rows), so the OVR-swing warning could never fire for Artista.
--
-- The fix is the 0038 swap only: `public.cohort_group(...)` in the four
-- cohort-scope comparisons. No payload shape changes, no thresholds changed.
--
-- Append-only. Apply AFTER 0046/0047:
--   node scripts/apply-seed.mjs supabase/migrations/0048_anticheat_merged_cohort_alignment.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. defense_cohort_baselines() — 0046 body, merged cohort scope.
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
  'Member-callable anti-cheat baselines (0046; 0048 merged-cohort alignment): {stat_key, average, sample_size} for rpdef/rmdef/equip_pdef_pct/equip_mdef_pct over the caller''s stats cohort (public.cohort_group(char_class) + build-role — Artista includes Bard and Gypsy). Latest validated value per ACTIVE member, caller excluded, n >= 3. Aggregates only. Internal gate: active member from the JWT claim.';

-- ---------------------------------------------------------------------------
-- 2. ovr_projection() — 0046 body, cohort + key-config reads through
--    cohort_group(), exactly like 0038's my_report/my_card.
-- ---------------------------------------------------------------------------

create or replace function public.ovr_projection(
  p_member uuid,
  p_class text,
  p_function text,
  p_stats jsonb default null,
  p_exclude_submission uuid default null
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
    where s.status not in ('rejected', 'discarded')
      and (p_exclude_submission is null or s.id <> p_exclude_submission)
      and m.active
      and public.cohort_group(m.char_class) = public.cohort_group(p_class)
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
    where ks.class_name = public.cohort_group(p_class)
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

comment on function public.ovr_projection(uuid, text, text, jsonb, uuid) is
  'Internal review-only OVR projection (0046; 0048 merged-cohort alignment): the Phase 9/10.1 value-proportional formula over the member''s 6 ordered key stats, scoped by public.cohort_group(char_class) + build-role like every 0038 rank RPC (a Menestrel projects on the Artista config). p_stats optionally overrides the member''s own values; p_exclude_submission removes exactly one row ("OVR before"). No client EXECUTE -- called only by the SECURITY DEFINER officer_queue().';

-- ---------------------------------------------------------------------------
-- 3. submission_anti_cheat() — 0046 body, defense baseline through
--    cohort_group().
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
  -- Literal identity change (owner rule: warning only when class/role are
  -- unchanged). The STATS math below still scopes by cohort_group().
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
      and public.cohort_group(m2.char_class) = public.cohort_group(v_class)
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
  -- "Before" excludes the pending row under review; "after" includes it.
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
  'Review-only anti-cheat flags for ONE pending submission (0046; 0048 merged-cohort alignment). Defense spikes = rpdef/rmdef/equip_pdef_pct/equip_mdef_pct >= 1.5x the public.cohort_group(char_class)+build-role cohort average (Artista includes Bard and Gypsy; latest validated per active member, submitting member excluded, n >= 3). Defense spikes and OVR swings >= 8 points with an unchanged cohorts set flagged=true. OCR edits are always reported with the originally printed value and the final value. Internal: called only by the SECURITY DEFINER officer_queue().';

-- ---------------------------------------------------------------------------
-- 4. stat_overview() — 0047 body, class average through cohort_group().
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
            'class_sample_size', a.n,
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
          select avg(l2.value) as avg_v, count(*) as n
          from latest l2
          where public.cohort_group(l2.char_class) = public.cohort_group(r.char_class)
            and l2.char_function = r.char_function
            and l2.member_id <> r.member_id
        ) a on true
        cross join guild g
      ), '[]'::jsonb)
    )
    from guild g
  );
end;
$$;

comment on function public.stat_overview(text) is
  'Staff-only cross-cohort stat inspector for the Ranking tab (0047; 0048 merged-cohort alignment). For ONE stat_key: catalog metadata, guild aggregates over the latest VALIDATED value per active real member (smoke/dummy excluded), and one row per active real member with value, latest submission time, class average under public.cohort_group(char_class)+build-role (Artista includes Bard and Gypsy; self excluded, n >= 3 to display), cohort_ratio / guild_ratio and direction-aware >= 1.5x / <= 0.5x outlier hints. Members without a value return value null. Internal gate: member_role in (officer,owner) AND caller active.';

-- Grants survive create-or-replace for the same signatures, but restate the
-- internal/leaf contract explicitly (0046/0047 precedent).
revoke execute on function public.defense_cohort_baselines() from public, anon;
grant execute on function public.defense_cohort_baselines() to authenticated;
revoke execute on function public.ovr_projection(uuid, text, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.submission_anti_cheat(uuid) from public, anon, authenticated;
revoke execute on function public.stat_overview(text) from public, anon;
grant execute on function public.stat_overview(text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0048', 'anticheat_merged_cohort_alignment', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
