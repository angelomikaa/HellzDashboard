-- NeoFoot migration 0066: unique login key + safe nickname guards.
--
-- WHY: members.login_key is the login identity (verify-pin / first-access
-- resolve by lower(btrim(display_name))). Two drifts surfaced on 2026-11-02:
--   1. LIVE login_key is a GENERATED column, but 0020 added it as a PLAIN
--      column and nothing in the repo maintains it — a replay would leave
--      every new row with a null key and no one could log in.
--   2. members_login_key_idx is NOT unique, so two active members could share
--      a nickname; verify-pin answers ambiguous_identity and BOTH accounts
--      are locked out of login.
--
-- WHAT:
--   1. Converge login_key to the live generated definition (idempotent: skips
--      when it is already ALWAYS).
--   2. A partial unique index on (login_key) WHERE active — inactive rows may
--      keep a historical nickname.
--   3. add_member and correct_identity raise 'duplicate_nickname' before the
--      raw 23505 (approve_request already had this guard).
--
-- Append-only: 0020 is not edited. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0066_login_key_uniqueness.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. login_key must be GENERATED (repo replay would otherwise leave it null)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'members'
      and column_name = 'login_key'
      and is_generated <> 'ALWAYS'
  ) then
    alter table public.members drop column login_key;
    alter table public.members
      add column login_key text generated always as (lower(btrim(display_name))) stored;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. One ACTIVE row per nickname (inactive rows may repeat history)
-- ---------------------------------------------------------------------------
create unique index if not exists members_active_login_key_key
  on public.members (login_key)
  where active;

comment on column public.members.login_key is
  'Generated login identity: lower(btrim(display_name)). Unique among ACTIVE rows (0066) so verify-pin can never resolve an ambiguous nickname.';

-- ---------------------------------------------------------------------------
-- 3. add_member — clean duplicate_nickname guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_member(p_handle text, p_display_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_handle text := btrim(coalesce(p_handle, ''));
  v_name text := btrim(coalesce(p_display_name, ''));
  v_existing members%rowtype;
  v_id uuid;
begin
  -- 0064: device binding restored (0024 intent). First statement, before
  -- any role gate, so a mismatched device cannot even probe authorization.
  perform public.assert_device_bound();
  -- Staff gate verbatim (0011:75-81).
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if char_length(v_handle) = 0 or char_length(v_handle) > 64 then
    raise exception 'invalid_handle';
  end if;
  if char_length(v_name) = 0 or char_length(v_name) > 80 then
    raise exception 'invalid_display_name';
  end if;
  if public.is_dummy_handle(v_handle) then
    raise exception 'dummy_handle';
  end if;


  -- 0066: the nickname is the login key (generated column), so two ACTIVE
  -- rows may not share it. Clean token instead of a raw 23505.
  if exists (
    select 1 from public.members m
    where m.login_key = lower(btrim(v_name))
      and m.active
  ) then
    raise exception 'duplicate_nickname';
  end if;

  select * into v_existing from members where discord_handle = v_handle;

  if v_existing.id is not null and v_existing.active then
    raise exception 'already_member';
  end if;

  if v_existing.id is not null then
    -- WHIT-07: reactivation keeps pin_hash/role/identity and every submission.
    update members
       set active = true,
           display_name = v_name
     where id = v_existing.id;
    return v_existing.id;
  end if;

  insert into members (discord_handle, display_name, pin_hash, role, active)
  values (v_handle, v_name, null, 'member', true)
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function public.add_member(text, text) is
  'Handle-only member creation/reactivation (WHIT-01/06/07) with device binding (0064) and the active-nickname uniqueness guard (0066). role=member, pin_hash NULL (unclaimed).';

-- ---------------------------------------------------------------------------
-- 4. correct_identity — the same guard on staff renames
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correct_identity(p_member uuid, p_char_id text, p_nickname text, p_char_class text, p_char_function text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller uuid := (auth.jwt()->>'member_id')::uuid;
  v_char_id text := btrim(coalesce(p_char_id, ''));
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_class text := btrim(coalesce(p_char_class, ''));
  v_function text := coalesce(p_char_function, '');
begin
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if not exists (select 1 from members m where m.id = p_member) then
    raise exception 'forbidden';
  end if;
  if v_char_id !~ '^[0-9]{1,12}$' then
    raise exception 'invalid_identity';
  end if;
  if char_length(v_nickname) = 0 or char_length(v_nickname) > 80 then
    raise exception 'invalid_identity';
  end if;
  if not exists (select 1 from classes where class_name = v_class) then
    raise exception 'unknown_class';
  end if;
  if v_function not in ('dps', 'mdps', 'suporte') then
    raise exception 'invalid_function';
  end if;


  -- 0066: a correction that renames a member to an ACTIVE nickname would make
  -- both accounts unresolvable at login. Refuse it cleanly.
  if exists (
    select 1 from public.members m
    where m.login_key = lower(btrim(v_nickname))
      and m.active
      and m.id <> p_member
  ) then
    raise exception 'duplicate_nickname';
  end if;

  perform public.assert_char_id_available(v_char_id, p_member, null);

  insert into member_identity_history
    (member_id, submission_id, char_id, nickname, char_class, char_function, source, created_by)
  values
    (p_member, null, v_char_id, v_nickname, v_class, v_function, 'correction', v_caller);

  -- D-20: char_function is staff-only — this correction is one of the only
  -- places it is applied to the registry.
  update members
     set char_id = v_char_id,
         display_name = v_nickname,
         char_class = v_class,
         char_function = v_function
   where id = p_member;
end;
$function$;

comment on function public.correct_identity(uuid, text, text, text, text) is
  'Staff identity correction (IDEN-03) with the active-nickname uniqueness guard (0066): a rename to an ACTIVE member nickname raises duplicate_nickname.';

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0066', 'login_key_uniqueness', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
