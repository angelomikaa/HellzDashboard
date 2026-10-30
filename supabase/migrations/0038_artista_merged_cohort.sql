-- NeoFoot migration 0038: Artista — Menestrel + Cigana merged cohort (owner 2026-10-29).
--
-- Owner: "menestrel and cigana are the same class for the purpose of stats, so
-- they also must be merged, in a status of exception, all other tabs keep
-- working as they are, except for the 'menestrel + Cigana' tab. And we must call
-- the merged tab the 'Artista' tab." Scope answers: ALL surfaces, ONE shared
-- 6-key config, each member keeps their own class on the card/registry.
--
-- The rank engine keys every cohort by (members.char_class, members.char_function)
-- and every config by (class_key_stats.class_name, char_function), so this makes
-- ONE group of two classes and leaves every other cohort untouched:
--   1. public.class_cohort_merges (class_name -> group_name) — the persisted split;
--      a class belongs to at most one group and a class NOT in the table is its own
--      group (that is what keeps this an exception, never a global rule).
--   2. public.cohort_group(p_class) — the ONE helper every RPC scopes by.
--   3. classes gains the VIRTUAL class 'Artista' (satisfies the class_relevant_stats
--      FK — class_key_stats has no classes FK, verified via information_schema —
--      and appears ONCE in /classes so every class filter lists it once);
--      members.char_class keeps Bard/Gypsy — a member can never be an Artista.
--   4. config + cohort re-key: Artista carries the ONE shared config (copied from
--      Bard, the merge's canonical representative) and the class_cohorts rows of
--      Bard/Gypsy collapse onto the group; the 39-row split becomes 36 rows.
--   5. the seven cohort RPCs are create-or-replace from the LIVE pg_proc bodies
--      (scripts/gen-0038.mjs), with ONE systematic change: cohort scopes, board
--      filters and key-stat config reads go through cohort_group(); payloads that
--      must show the member's own class still do.
--
-- Append-only: 0001-0037 are never edited in place; create or replace only, exact
-- signatures, no function is dropped. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0038_artista_merged_cohort.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. The persisted merge: class -> stats group.
-- ---------------------------------------------------------------------------

insert into public.classes (class_name) values ('Artista')
on conflict (class_name) do nothing;

create table if not exists public.class_cohort_merges (
  class_name text primary key references public.classes(class_name) on delete cascade,
  group_name text not null
);

comment on table public.class_cohort_merges is
  'Persisted class-merge map (owner decision 2026-10-29): class_name ranks INSIDE group_name instead of on its own. Seeded Bard/Gypsy -> Artista (same job line for stats). A class with no row is its own group, so every other cohort is untouched. RLS deny-all for members (staff-select policy), exactly like class_cohorts; never serialised in any RPC payload.';

alter table public.class_cohort_merges enable row level security;

grant select on public.class_cohort_merges to authenticated;
revoke insert, update, delete on public.class_cohort_merges from anon, authenticated;
revoke select on public.class_cohort_merges from anon;

drop policy if exists staff_select_cohort_merges on public.class_cohort_merges;
create policy staff_select_cohort_merges on public.class_cohort_merges
  for select to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active));

-- Owner list 2026-10-29: the Dancer/Bard job line is one class for stats.
insert into public.class_cohort_merges (class_name, group_name)
values ('Bard', 'Artista'), ('Gypsy', 'Artista')
on conflict (class_name) do update set group_name = excluded.group_name;

-- ---------------------------------------------------------------------------
-- 2. cohort_group(p_class) — the ONE identity the rank engine scopes by.
--    Immutable + parallel safe: the RPCs qualify it as public.cohort_group(),
--    so a search_path surprise can never reach another function of this name.
-- ---------------------------------------------------------------------------

create or replace function public.cohort_group(p_class text)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(
    (select m.group_name from public.class_cohort_merges m where m.class_name = p_class),
    p_class
  );
$$;

comment on function public.cohort_group(text) is
  'The stats group a class ranks inside: the merged group name (Artista) for a merged class (Bard, Gypsy), otherwise the class itself. SECURITY INVOKER by design and fail-closed — a member calling it directly sees no rows (class_cohort_merges is staff-select under RLS) so cohort_group falls back to the plain class, while the SECURITY DEFINER RPCs run as the table owner, bypass RLS and DO see the merge. Reading a merged group is therefore never a member-readable fact.';

-- ---------------------------------------------------------------------------
-- 3. Re-key config: ONE shared config per (Artista, function), copied from
--    Bard (the representative the owner registered first). Idempotent: after
--    the first run there are no Bard/Gypsy rows to copy, so a re-run can never
--    clobber an officer's later edits to the Artista config.
-- ---------------------------------------------------------------------------

insert into public.class_key_stats (class_name, char_function, stat_key, selection_order, selected_at)
select 'Artista', k.char_function, k.stat_key, k.selection_order, coalesce(k.selected_at, now())
from public.class_key_stats k
where k.class_name = 'Bard'
on conflict (class_name, char_function, stat_key) do update
  set selection_order = excluded.selection_order,
      selected_at = excluded.selected_at;

-- Relevants are CLASS-level (class_relevant_stats carries no char_function —
-- information_schema verified), so the copy is a straight class rename.
insert into public.class_relevant_stats (class_name, stat_key)
select distinct 'Artista', r.stat_key
from public.class_relevant_stats r
where r.class_name = 'Bard'
on conflict (class_name, stat_key) do nothing;

delete from public.class_key_stats where class_name in ('Bard', 'Gypsy');
delete from public.class_relevant_stats where class_name in ('Bard', 'Gypsy');

-- ---------------------------------------------------------------------------
-- 4. Re-key the persisted viability split: the Bard/Gypsy rows collapse onto
--    the group (meta = TRUE when EITHER source row was meta — the union, never
--    the intersection: a merge must not silently un-meta a playable build).
-- ---------------------------------------------------------------------------

insert into public.class_cohorts (class_name, char_function, meta)
select 'Artista', c.char_function, bool_or(c.meta)
from public.class_cohorts c
where c.class_name in ('Bard', 'Gypsy')
group by c.char_function
on conflict (class_name, char_function) do update
  set meta = excluded.meta,
      updated_at = now();

delete from public.class_cohorts where class_name in ('Bard', 'Gypsy');

-- Seed invariants after the re-key: every class exists, the split matches the
-- owner's counts (23 - 2 meta + 1 group = 22 meta; 16 - 4 dark + 2 = 14 dark),
-- and Artista really is ONE cohort covering both classes with a full key set.
do $$
declare
  v_meta int;
  v_dark int;
begin
  if exists (
    select 1 from public.class_cohorts cc
    where not exists (select 1 from public.classes c where c.class_name = cc.class_name)
  ) then
    raise exception 'class_cohorts references an unknown class';
  end if;

  select count(*) filter (where meta), count(*) filter (where not meta)
    into v_meta, v_dark
  from public.class_cohorts;

  if v_meta <> 22 or v_dark <> 14 then
    raise exception 'class_cohorts seed mismatch: % meta / % non-viable (expected 22 / 14 after the Artista merge)',
      v_meta, v_dark;
  end if;

  if not exists (
    select 1 from public.class_cohorts
    where class_name = 'Artista' and char_function = 'suporte' and meta
  ) then
    raise exception 'Artista/suporte must be the merged meta cohort';
  end if;

  if exists (
    select 1 from public.class_cohort_merges m
    where not exists (
      select 1 from public.class_key_stats ks
      where ks.class_name = m.group_name
      group by ks.class_name, ks.char_function
      having count(*) = 6
    )
  ) then
    raise exception 'a merged group must own a full 6-key config';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The seven cohort RPCs — byte-faithful live bodies, cohort_group() swap.
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
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    cohort as (
      select l.member_id, l.stat_key, l.value
      from latest l
      join members m on m.id = l.member_id
      where public.cohort_group(m.char_class) = public.cohort_group(v_class) and m.char_function = v_function and m.active
    ),
    agg as (
      select stat_key,
             count(*) as n,
             avg(value) as avg_v,
             max(value) as max_v,
             min(value) as min_v
      from cohort
      group by stat_key
    )
    select jsonb_build_object(
      'char_class', v_class,
      'char_function', v_function,
      'stats', (
        select jsonb_agg(
          jsonb_build_object(
            'stat_key', c.stat_key,
            'label', c.label,
            'group_name', c.group_name,
            'value_type', c.value_type,
            'own_value', o.value,
            'class_average', a.avg_v,
            'best',
              case c.stat_direction
                when 'lower' then a.min_v
                else a.max_v
              end,
            'points', case
              when coalesce(a.n, 0) >= 3 and o.value is not null then
                least(greatest(
                  round(
                    case c.stat_direction
                      when 'lower' then o.value / nullif(a.min_v, 0)
                      else o.value / nullif(a.max_v, 0)
                    end * 99, 2),
                  0), 99)
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
        select jsonb_build_object(
          'value', case
            when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
          end,
          'data_sufficient', count(*) = 6 and count(p) = 6
        )
        from (
          select case
            when coalesce(a.n, 0) >= 3 and o.value is not null then
              least(greatest(
                round(
                  case c.stat_direction
                    when 'lower' then o.value / nullif(a.min_v, 0)
                    else o.value / nullif(a.max_v, 0)
                  end * 99, 2),
                0), 99)
          end as p
          from class_key_stats ks
          join stat_catalog c on c.stat_key = ks.stat_key
          left join latest o on o.stat_key = ks.stat_key and o.member_id = v_member
          left join agg a on a.stat_key = ks.stat_key
          where ks.class_name = public.cohort_group(v_class)
            and ks.char_function = v_function
            and ks.selection_order <= 6
        ) kp
      ),
      'last_validated_at', (
        select max(sub.submitted_at)
        from submissions sub
        where sub.member_id = v_member and sub.status = 'validated'
      )
    )
  );
end;
$$;

comment on function public.my_report() is 'Member rank report (0038): identical to 0028/0036 bodies except every cohort scope and key-stat config read goes through public.cohort_group() — a merged class (Bard) ranks with its group (Artista). The payload still carries the member''s own class (owner 2026-10-29: the card keeps printing Menestrel). Key-stat identity NEVER serialised (RNK-02).';

revoke all on function public.my_report() from public;
grant execute on function public.my_report() to authenticated;

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
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    cohort as (
      select l.member_id, l.stat_key, l.value
      from latest l
      join members m on m.id = l.member_id
      where public.cohort_group(m.char_class) = public.cohort_group(v_class) and m.char_function = v_function and m.active
    ),
    agg as (
      select stat_key, count(*) as n,
             max(value) as max_v, min(value) as min_v
      from cohort
      group by stat_key
    )
    select jsonb_build_object(
      'char_class', v_class,
      'char_function', v_function,
      'ovr', (
        select jsonb_build_object(
          'value', case
            when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
          end,
          'data_sufficient', count(*) = 6 and count(p) = 6
        )
        from (
          select case
            when coalesce(a.n, 0) >= 3 and o.value is not null then
              least(greatest(round(
                case c.stat_direction
                  when 'lower' then o.value / nullif(a.min_v, 0)
                  else o.value / nullif(a.max_v, 0)
                end * 99, 2), 0), 99)
          end as p
          from class_key_stats ks
          join stat_catalog c on c.stat_key = ks.stat_key
          left join latest o on o.stat_key = ks.stat_key and o.member_id = v_member
          left join agg a on a.stat_key = ks.stat_key
          where ks.class_name = public.cohort_group(v_class)
            and ks.char_function = v_function
            and ks.selection_order <= 6
        ) kp
      ),
      'key_stats', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'stat_key', ks.stat_key,
            'label', c.label,
            'label_short', c.label_short,
            'value_type', c.value_type,
            'own_value', o.value,
            'points', case
              when coalesce(a.n, 0) >= 3 and o.value is not null then
                least(greatest(round(
                  case c.stat_direction
                    when 'lower' then o.value / nullif(a.min_v, 0)
                    else o.value / nullif(a.max_v, 0)
                  end * 99, 2), 0), 99)
            end
          )
          order by c.label
        ), '[]'::jsonb)
        from class_key_stats ks
        join stat_catalog c on c.stat_key = ks.stat_key
        left join latest o on o.stat_key = ks.stat_key and o.member_id = v_member
        left join agg a on a.stat_key = ks.stat_key
        where ks.class_name = public.cohort_group(v_class)
          and ks.char_function = v_function
          and ks.selection_order <= 6
      ),
      'relevant_stat_keys', (
        coalesce((
          select jsonb_agg(rs.stat_key order by rs.stat_key)
          from class_relevant_stats rs
          where rs.class_name = public.cohort_group(v_class)
        ), '[]'::jsonb)
      )
    )
  );
end;
$$;

comment on function public.my_card() is 'Member Painel card (0038): same cohort_group() swap as my_report — the merged cohort''s aggregates and the ONE shared key/relevant config drive the card, while char_class stays the member''s own class. Key-stat CONFIG never serialised.';

revoke all on function public.my_card() from public;
grant execute on function public.my_card() to authenticated;

create or replace function public.role_rank(p_function text, p_class text DEFAULT NULL::text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$

begin
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if p_function not in ('dps', 'mdps', 'suporte') then
    raise exception 'invalid_function';
  end if;

  if p_class = '' then
    p_class := null;
  end if;

  if p_class is not null
     and not exists (select 1 from classes where class_name = p_class) then
    raise exception 'unknown_class';
  end if;

  return (
    with latest as (
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    role_members as (
      select m.id, m.display_name, public.cohort_group(m.char_class) as char_class, m.char_function
      from members m
      where m.char_function = p_function
        and m.active
        and m.char_class is not null
        and (p_class is null or public.cohort_group(m.char_class) = p_class)
    ),
    cohort as (
      select l.member_id, l.stat_key, l.value, rm.char_function, rm.char_class
      from latest l
      join role_members rm on rm.id = l.member_id
    ),
    agg as (
      select char_class, stat_key, count(*) as n, avg(value) as avg_v,
             max(value) as max_v, min(value) as min_v
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
               select coalesce(jsonb_agg(
                 jsonb_build_object(
                   'stat_key', sc.stat_key,
                   'label', sc.label,
                   'label_short', sc.label_short,
                   'value_type', sc.value_type,
                   'value', lt.value,
                   'points', case
                     when coalesce(ag.n, 0) >= 3 and lt.value is not null then
                       least(greatest(round(
                         case sc.stat_direction
                           when 'lower' then lt.value / nullif(ag.min_v, 0)
                           else lt.value / nullif(ag.max_v, 0)
                         end * 99, 2), 0), 99)
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
        select case
          when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
        end as ovr
        from (
          select case
            when ag.n >= 3 and o.value is not null then
              least(greatest(round(
                case c.stat_direction
                  when 'lower' then o.value / nullif(ag.min_v, 0)
                  else o.value / nullif(ag.max_v, 0)
                end * 99, 2), 0), 99)
          end as p
          from class_key_stats ks
          join stat_catalog c on c.stat_key = ks.stat_key
          left join latest o on o.stat_key = ks.stat_key and o.member_id = rm.id
          left join agg ag on ag.stat_key = ks.stat_key and ag.char_class = rm.char_class
          where ks.class_name = rm.char_class
            and ks.char_function = rm.char_function
            and ks.selection_order <= 6
        ) kp
      ) o
    ) rr
  );
end;
$$;

comment on function public.role_rank(p_function text, p_class text) is 'Staff ranking board (0038): role_members carries cohort_group(char_class), so a board filtered to the Artista group ranks Menestrel and Cigana together and rows print the group. Board filter matches p_class through the group. Staff gate and value-proportional math untouched.';

revoke all on function public.role_rank(p_function text, p_class text) from public;
grant execute on function public.role_rank(p_function text, p_class text) to authenticated;

create or replace function public.staff_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$

begin
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  return coalesce((
    with latest as (
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    cohort as (
      select l.member_id, l.stat_key, l.value, public.cohort_group(m.char_class) as char_class, m.char_function
      from latest l
      join members m on m.id = l.member_id
      where m.active and m.char_class is not null
    ),
    agg as (
      select char_class, char_function, stat_key, count(*) as n,
             max(value) as max_v, min(value) as min_v
      from cohort
      group by char_class, char_function, stat_key
    )
    select jsonb_agg(
      jsonb_build_object(
        'request_id', r.id,
        'discord_handle', r.discord_handle,
        'request_type', r.request_type,
        'char_id', r.char_id,
        'nickname', r.nickname,
        'char_class', r.char_class,
        'char_function', r.char_function,
        'proof_path', r.proof_path,
        'created_at', r.created_at,
        'member_id', r.member_id,
        'ovr', o.ovr,
        'data_sufficient', (o.ovr is not null),
        'stats', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'stat_key', sc.stat_key,
              'label', sc.label,
              'label_short', sc.label_short,
              'value_type', sc.value_type,
              'group_name', sc.group_name,
              'value', rs.value
            )
            order by sc.group_name, sc.label
          ), '[]'::jsonb)
          from stat_catalog sc
          left join membership_request_stats rs
            on rs.request_id = r.id and rs.stat_key = sc.stat_key
        )
      )
      order by r.created_at desc
    )
    from membership_requests r
    cross join lateral (
      -- 0036 unified OVR semantics: exactly-6 key stats read by the
      -- applicant's own class+function with selection_order <= 6, the
      -- applicant holds all 6, each cohort n >= 3, Phase 9 value-proportional
      -- points (SCALE-01). Cohort = ACTIVE members of the SAME class+function;
      -- the applicant's own stats never join it (D-14).
      select case
        when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
      end as ovr
      from (
        select case
          when coalesce(a.n, 0) >= 3 and rq.value is not null then
            least(greatest(round(
              case sc.stat_direction
                when 'lower' then rq.value / nullif(a.min_v, 0)
                else rq.value / nullif(a.max_v, 0)
              end * 99, 2), 0), 99)
        end as p
        from class_key_stats ks
        join stat_catalog sc on sc.stat_key = ks.stat_key
        left join membership_request_stats rq
          on rq.request_id = r.id and rq.stat_key = ks.stat_key
        left join agg a
          on a.stat_key = ks.stat_key
         and a.char_class = public.cohort_group(r.char_class)
         and a.char_function = r.char_function
        where ks.class_name = public.cohort_group(r.char_class)
          and ks.char_function = r.char_function
          and ks.selection_order <= 6
      ) kp
    ) o
    where r.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

comment on function public.staff_requests() is 'Staff requests board with per-applicant OVR (0038): the cohort is the applicant''s merged group, so a Menestrel applicant is scored against the Artista cohort and its single shared key config. The request''s own class still rides the payload.';

revoke all on function public.staff_requests() from public;
grant execute on function public.staff_requests() to authenticated;

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
    select distinct on (sub.member_id, ss.stat_key)
           sub.member_id, ss.stat_key, ss.value
    from submission_stats ss
    join submissions sub on sub.id = ss.submission_id
    where sub.status not in ('rejected','discarded')
    order by sub.member_id, ss.stat_key, sub.submitted_at desc
  ),
  class_members as (
    select m.id, m.display_name, m.char_function
    from members m
    where public.cohort_group(m.char_class) = p_class and m.active
  ),
  cohort as (
    select l.member_id, l.stat_key, l.value, cm.char_function
    from latest l
    join class_members cm on cm.id = l.member_id
  ),
  agg as (
    select stat_key,
           count(*) as n,
           max(value) as max_v,
           min(value) as min_v
    from cohort
    group by stat_key
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
        select case
          when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
        end as ovr
        from (
          select case
            when ag.n >= 3 and o.value is not null then
              least(greatest(
                round(
                  case c.stat_direction
                    when 'lower' then o.value / nullif(ag.min_v, 0)
                    else o.value / nullif(ag.max_v, 0)
                  end * 99, 2),
                0), 99)
          end as p
          from class_key_stats ks
          join stat_catalog c on c.stat_key = ks.stat_key
          left join latest o on o.stat_key = ks.stat_key and o.member_id = cm.id
          left join agg ag on ag.stat_key = ks.stat_key
          where ks.class_name = p_class
            and ks.char_function = cm.char_function
            and ks.selection_order <= 6
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

comment on function public.class_top5(p_class text) is 'Class top 5 (0038): class_members filters through cohort_group(p_class), so the Artista group is one board. Key config already reads p_class (the group).';

revoke all on function public.class_top5(p_class text) from public;
grant execute on function public.class_top5(p_class text) to authenticated;

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
  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;

  return (
    with latest as (
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    class_members as (
      select m.id, m.display_name, m.char_function, public.cohort_group(m.char_class) as char_class
      from members m
      where m.char_class is not null and m.active
    ),
    cohort as (
      select l.member_id, l.stat_key, l.value, cm.char_function, cm.char_class
      from latest l
      join class_members cm on cm.id = l.member_id
    ),
    cmp as (
      select a.member_id, a.stat_key,
             count(*) as n,
             count(*) filter (where b.value < a.value) as below,
             count(*) filter (where b.value = a.value) as ties
      from cohort a
      join cohort b on b.stat_key = a.stat_key
                     and b.char_function = a.char_function
                     and b.char_class = a.char_class
      group by a.member_id, a.stat_key
    ),
    agg as (
      select char_class, char_function, stat_key,
             count(*) as n,
             max(value) as max_v,
             min(value) as min_v
      from cohort
      group by char_class, char_function, stat_key
    ),
    ovr_rows as (
      select cm.char_class, cm.id, cm.display_name, cm.char_function, o.ovr
      from class_members cm
      cross join lateral (
        select case
          when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
        end as ovr
        from (
          select case
            when ag.n >= 3 and o.value is not null then
              least(greatest(
                round(
                  case c.stat_direction
                    when 'lower' then o.value / nullif(ag.min_v, 0)
                    else o.value / nullif(ag.max_v, 0)
                  end * 99, 2),
                0), 99)
          end as p
          from class_key_stats ks
          join stat_catalog c on c.stat_key = ks.stat_key
          left join latest o on o.stat_key = ks.stat_key and o.member_id = cm.id
          left join agg ag on ag.stat_key = ks.stat_key
                          and ag.char_class = cm.char_class
                          and ag.char_function = cm.char_function
          where ks.class_name = cm.char_class
            and ks.char_function = cm.char_function
            and ks.selection_order <= 6
        ) kp
      ) o
    ),
    -- 0037: top 3 PER COHORT, meta cohorts only (owner decision 2026-10-28).
    top3 as (
      select char_class, id, display_name, char_function, ovr,
             row_number() over (
               partition by char_class, char_function
               order by ovr desc nulls last, display_name
             ) as rn
      from ovr_rows
      where ovr is not null
        and exists (
          select 1 from class_cohorts cc
          where cc.class_name = ovr_rows.char_class
            and cc.char_function = ovr_rows.char_function
            and cc.meta
        )
    ),
    hl as (
      select t.id, hl.h as highlights
      from top3 t
      cross join lateral (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'stat_key', sc.stat_key,
            'label', sc.label,
            'label_short', sc.label_short,
            'value_type', sc.value_type,
            'value', lt.value,
            'points', case
              when ag.n >= 3 and lt.value is not null then
                least(greatest(
                  round(
                    case sc.stat_direction
                      when 'lower' then lt.value / nullif(ag.min_v, 0)
                      else lt.value / nullif(ag.max_v, 0)
                    end * 99, 2),
                  0), 99)
            end
          )
          order by sc.label
        ), '[]'::jsonb) as h
        from class_key_stats ks
        join stat_catalog sc on sc.stat_key = ks.stat_key
        left join latest lt on lt.stat_key = ks.stat_key and lt.member_id = t.id
        left join agg ag on ag.stat_key = ks.stat_key
                        and ag.char_class = t.char_class
                        and ag.char_function = t.char_function
        where ks.class_name = t.char_class
          and ks.char_function = t.char_function
          and ks.selection_order <= 6
      ) hl
    )
    select coalesce(jsonb_agg(
      jsonb_build_object('class_name', cards.char_class, 'char_function', cards.char_function, 'cards', cards.cards)
      order by cards.char_class, cards.char_function
    ), '[]'::jsonb)
    from (
      select t.char_class, t.char_function,
             jsonb_agg(
               jsonb_build_object(
                 'display_name', t.display_name,
                 'char_function', t.char_function,
                 'ovr', t.ovr,
                 'photo_path', 'card-photos/' || t.id::text || '/card.jpg',
                 'highlights', hl.highlights
               )
               order by t.ovr desc, t.display_name
             ) as cards
      from top3 t
      join hl on hl.id = t.id
      where t.rn <= 3
      group by t.char_class, t.char_function
    ) cards
  );
end;
$$;

comment on function public.get_promotion() is 'Members-only Início showCase (0038): class_members carries cohort_group(char_class), so each meta GROUP claims one section — Artista instead of Menestrel + Cigana as two. Non-viable cohorts still gated by class_cohorts.meta.';

revoke all on function public.get_promotion() from public;
grant execute on function public.get_promotion() to authenticated;

create or replace function public.get_promotion_public()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$



begin
  return (
    with latest as (
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    class_members as (
      select m.id, m.display_name, m.char_function, public.cohort_group(m.char_class) as char_class
      from members m
      where m.char_class is not null and m.active
    ),
    cohort as (
      select l.member_id, l.stat_key, l.value, cm.char_function, cm.char_class
      from latest l
      join class_members cm on cm.id = l.member_id
    ),
    cmp as (
      select a.member_id, a.stat_key,
             count(*) as n,
             count(*) filter (where b.value < a.value) as below,
             count(*) filter (where b.value = a.value) as ties
      from cohort a
      join cohort b on b.stat_key = a.stat_key
                     and b.char_function = a.char_function
                     and b.char_class = a.char_class
      group by a.member_id, a.stat_key
    ),
    agg as (
      select char_class, char_function, stat_key,
             count(*) as n,
             max(value) as max_v,
             min(value) as min_v
      from cohort
      group by char_class, char_function, stat_key
    ),
    ovr_rows as (
      select cm.char_class, cm.id, cm.display_name, cm.char_function, o.ovr
      from class_members cm
      cross join lateral (
        select case
          when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
        end as ovr
        from (
          select case
            when ag.n >= 3 and o.value is not null then
              least(greatest(
                round(
                  case c.stat_direction
                    when 'lower' then o.value / nullif(ag.min_v, 0)
                    else o.value / nullif(ag.max_v, 0)
                  end * 99, 2),
                0), 99)
          end as p
          from class_key_stats ks
          join stat_catalog c on c.stat_key = ks.stat_key
          left join latest o on o.stat_key = ks.stat_key and o.member_id = cm.id
          left join agg ag on ag.stat_key = ks.stat_key
                          and ag.char_class = cm.char_class
                          and ag.char_function = cm.char_function
          where ks.class_name = cm.char_class
            and ks.char_function = cm.char_function
            and ks.selection_order <= 6
        ) kp
      ) o
    ),
    -- 0037: top 3 PER COHORT, meta cohorts only (owner decision 2026-10-28).
    top3 as (
      select char_class, id, display_name, char_function, ovr,
             row_number() over (
               partition by char_class, char_function
               order by ovr desc nulls last, display_name
             ) as rn
      from ovr_rows
      where ovr is not null
        and exists (
          select 1 from class_cohorts cc
          where cc.class_name = ovr_rows.char_class
            and cc.char_function = ovr_rows.char_function
            and cc.meta
        )
    ),
    hl as (
      select t.id, hl.h as highlights
      from top3 t
      cross join lateral (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'stat_key', sc.stat_key,
            'label', sc.label,
            'label_short', sc.label_short,
            'value_type', sc.value_type,
            'value', lt.value,
            'points', case
              when ag.n >= 3 and lt.value is not null then
                least(greatest(
                  round(
                    case sc.stat_direction
                      when 'lower' then lt.value / nullif(ag.min_v, 0)
                      else lt.value / nullif(ag.max_v, 0)
                    end * 99, 2),
                  0), 99)
            end
          )
          order by sc.label
        ), '[]'::jsonb) as h
        from class_key_stats ks
        join stat_catalog sc on sc.stat_key = ks.stat_key
        left join latest lt on lt.stat_key = ks.stat_key and lt.member_id = t.id
        left join agg ag on ag.stat_key = ks.stat_key
                        and ag.char_class = t.char_class
                        and ag.char_function = t.char_function
        where ks.class_name = t.char_class
          and ks.char_function = t.char_function
          and ks.selection_order <= 6
      ) hl
    )
    select coalesce(jsonb_agg(
      jsonb_build_object('class_name', cards.char_class, 'char_function', cards.char_function, 'cards', cards.cards)
      order by cards.char_class, cards.char_function
    ), '[]'::jsonb)
    from (
      select t.char_class, t.char_function,
             jsonb_agg(
               jsonb_build_object(
                 'display_name', t.display_name,
                 'char_function', t.char_function,
                 'ovr', t.ovr,
                 'photo_path', 'card-photos/' || t.id::text || '/card.jpg',
                 'highlights', hl.highlights
               )
               order by t.ovr desc, t.display_name
             ) as cards
      from top3 t
      join hl on hl.id = t.id
      where t.rn <= 3
      group by t.char_class, t.char_function
    ) cards
  );
end;
$$;

comment on function public.get_promotion_public() is 'Public landing showCase (0038): same group swap as get_promotion — anon-callable, meta groups only, one section per group. Key-stat CONFIG and the merge table are never serialised.';

revoke all on function public.get_promotion_public() from public;
grant execute on function public.get_promotion_public() to authenticated;


-- ---------------------------------------------------------------------------
-- 6. Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0038', 'artista_merged_cohort', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
