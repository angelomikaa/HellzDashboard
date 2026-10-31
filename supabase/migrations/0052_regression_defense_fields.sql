-- NeoFoot migration 0052: extend the regression dataset with the defense
-- fields needed for the Angelus / Assumptio models.
--
-- Owner request (2026-10-31): extend the regression dashboard to the Assumptio
-- and Angelus formulas, which work similarly to Impositio Manus.
--
-- Both buffs are multiplicative on the DEFENSE side:
--   Angelus      +95% Base PDEF
--   Assumptio    +95% Equipment PDEF and Equipment MDEF
--
-- The panel stores the derived base defenses (rpdef/rmdef, Phase 9.1) and the
-- equipment percentages, so the same normalized curve can be used:
--   rpdef vs equip_pdef_pct   (Angelus / Assumptio)
--   rmdef vs equip_mdef_pct   (Assumptio)
-- The Equipment PDEF/MDEF FLAT tooltip value is still NOT stored (only the
-- derived rpdef/rmdef); the payload keeps marking that absence explicitly.
--
-- Read-only. Append-only. Apply AFTER 0051:
--   node scripts/apply-seed.mjs supabase/migrations/0052_regression_defense_fields.sql

begin;

create or replace function public.stat_regression_dataset()
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

  return (
    with latest as (
      select distinct on (m.id, ss.stat_key)
             m.id as member_id,
             m.display_name,
             m.char_class,
             m.char_function,
             ss.stat_key,
             ss.value,
             s.submitted_at
      from members m
      join submissions s on s.member_id = m.id and s.status = 'validated'
      join submission_stats ss on ss.submission_id = s.id
      where m.active
        and m.discord_handle not like 'smoke%'
        and m.discord_handle not like 'dummy-%'
      order by m.id, ss.stat_key, s.submitted_at desc, s.id desc
    ),
    wide as (
      select member_id, display_name, char_class, char_function,
             max(value) filter (where stat_key = 'matk') as matk,
             max(value) filter (where stat_key = 'equip_matk_pct') as matk_pct,
             max(value) filter (where stat_key = 'patk') as patk,
             max(value) filter (where stat_key = 'equip_patk_pct') as patk_pct,
             max(value) filter (where stat_key = 'pdef') as pdef,
             max(value) filter (where stat_key = 'mdef') as mdef,
             max(value) filter (where stat_key = 'rpdef') as rpdef,
             max(value) filter (where stat_key = 'rmdef') as rmdef,
             max(value) filter (where stat_key = 'equip_pdef_pct') as equip_pdef_pct,
             max(value) filter (where stat_key = 'equip_mdef_pct') as equip_mdef_pct,
             max(submitted_at) as latest_submitted_at
      from latest
      group by 1,2,3,4
    ),
    history as (
      select s.member_id, count(*) as validated_submissions
      from submissions s
      join members m on m.id = s.member_id
      where s.status = 'validated'
        and m.active
        and m.discord_handle not like 'smoke%'
        and m.discord_handle not like 'dummy-%'
      group by s.member_id
    )
    select jsonb_build_object(
      'generated_at', now(),
      'fields', jsonb_build_object(
        'matk', jsonb_build_object('label', 'MATK', 'value_type', 'flat', 'available', true),
        'matk_pct', jsonb_build_object('label', 'Equip. MATK %', 'value_type', 'percentual', 'available', true),
        'patk', jsonb_build_object('label', 'PATK', 'value_type', 'flat', 'available', true),
        'patk_pct', jsonb_build_object('label', 'Equip. PATK %', 'value_type', 'percentual', 'available', true),
        'pdef', jsonb_build_object('label', 'PDEF', 'value_type', 'flat', 'available', true),
        'mdef', jsonb_build_object('label', 'MDEF', 'value_type', 'flat', 'available', true),
        'rpdef', jsonb_build_object('label', 'RPDEF (base calculada)', 'value_type', 'flat', 'available', true),
        'rmdef', jsonb_build_object('label', 'RMDEF (base calculada)', 'value_type', 'flat', 'available', true),
        'equip_pdef_pct', jsonb_build_object('label', 'Equip. PDEF %', 'value_type', 'percentual', 'available', true),
        'equip_mdef_pct', jsonb_build_object('label', 'Equip. MDEF %', 'value_type', 'percentual', 'available', true),
        'equip_matk', jsonb_build_object(
          'label', 'Equip. MATK (flat)', 'value_type', 'flat', 'available', false,
          'reason', 'O formulário não captura o MATK de equipamento (flat); só o total e o %.'
        ),
        'equip_patk', jsonb_build_object(
          'label', 'Equip. PATK (flat)', 'value_type', 'flat', 'available', false,
          'reason', 'O formulário não captura o PATK de equipamento (flat); só o total e o %.'
        ),
        'equip_pdef', jsonb_build_object(
          'label', 'Equip. PDEF (flat)', 'value_type', 'flat', 'available', false,
          'reason', 'O formulário captura o tooltip e deriva RPDEF; o PDEF de equipamento flat não é armazenado.'
        ),
        'equip_mdef', jsonb_build_object(
          'label', 'Equip. MDEF (flat)', 'value_type', 'flat', 'available', false,
          'reason', 'O formulário captura o tooltip e deriva RMDEF; o MDEF de equipamento flat não é armazenado.'
        )
      ),
      'coverage', jsonb_build_object(
        'active_real_members', (
          select count(*) from members m
          where m.active and m.discord_handle not like 'smoke%' and m.discord_handle not like 'dummy-%'
        ),
        'members_with_validated', (select count(*) from wide),
        'complete_matk_pairs', (
          select count(*) from wide where matk is not null and matk_pct is not null
        ),
        'complete_patk_pairs', (
          select count(*) from wide where patk is not null and patk_pct is not null
        ),
        'complete_both_pairs', (
          select count(*) from wide
          where matk is not null and matk_pct is not null
            and patk is not null and patk_pct is not null
        ),
        'complete_rpdef_pairs', (
          select count(*) from wide where rpdef is not null and equip_pdef_pct is not null
        ),
        'complete_rmdef_pairs', (
          select count(*) from wide where rmdef is not null and equip_mdef_pct is not null
        ),
        'repeated_submitters', (
          select count(*) from history where validated_submissions > 1
        ),
        'total_validated_submissions', (
          select coalesce(sum(validated_submissions), 0) from history
        )
      ),
      'members', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'member_id', w.member_id,
            'display_name', w.display_name,
            'char_class', w.char_class,
            'char_function', w.char_function,
            'matk', w.matk,
            'matk_pct', w.matk_pct,
            'patk', w.patk,
            'patk_pct', w.patk_pct,
            'pdef', w.pdef,
            'mdef', w.mdef,
            'rpdef', w.rpdef,
            'rmdef', w.rmdef,
            'equip_pdef_pct', w.equip_pdef_pct,
            'equip_mdef_pct', w.equip_mdef_pct,
            'latest_submitted_at', w.latest_submitted_at,
            'validated_submissions', coalesce(h.validated_submissions, 0)
          )
          order by w.display_name
        )
        from wide w
        left join history h on h.member_id = w.member_id
      ), '[]'::jsonb)
    )
  );
end;
$$;

comment on function public.stat_regression_dataset() is
  'Staff-only read-only regression dataset (0051; 0052 defense extension) for the Ranking regression dashboard: one row per active real member (smoke/dummy excluded) with the latest validated matk/equip_matk_pct/patk/equip_patk_pct plus pdef/mdef/rpdef/rmdef/equip_pdef_pct/equip_mdef_pct for the Angelus/Assumptio models, latest submission time and validated submission count; coverage counts and a `fields` map that explicitly marks Equipment/Base flat attack and Equipment flat defense as NOT captured. No table is modified. Internal gate: member_role in (officer,owner) AND caller active.';

revoke execute on function public.stat_regression_dataset() from public, anon;
grant execute on function public.stat_regression_dataset() to authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0052', 'regression_defense_fields', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
