-- ---------------------------------------------------------------------------
-- Migration 0021 — Officer PIN reset (owner decision 2026-10-23)
--
-- Officers may now reset the PIN of MEMBERS only:
--   * officer  -> targets with role = 'member'
--   * owner    -> members and officers
--   * officer  -> another officer: refused (owner-only)
--   * anyone   -> the owner account: refused (D-08, unchanged)
--
-- Body is the 0020 v2 body (it replaces 0020 section 6 in place, so the
-- migration history stays consistent); only the caller gate and the target
-- rule change.
-- ---------------------------------------------------------------------------

create or replace function public.reset_member_pin(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text := coalesce(auth.jwt()->>'member_role', '');
  v_caller_id text := coalesce(auth.jwt()->>'member_id', '');
  v_caller_active boolean;
  v_target_role text;
  v_handle text;
begin
  -- Active staff caller (officer or owner). A stale/deleted caller is refused.
  select m.active into v_caller_active
  from members m
  where m.id::text = v_caller_id;

  if v_caller_role not in ('officer', 'owner') or v_caller_active is not true then
    raise exception 'forbidden';
  end if;

  select m.role, m.discord_handle into v_target_role, v_handle
  from members m where m.id = p_member;

  -- Missing target and owner targets are equally forbidden (D-08 precedent).
  if v_target_role is null or v_target_role = 'owner' then
    raise exception 'forbidden';
  end if;

  -- Officers reset MEMBERS only; an officer is reset by the owner.
  if v_caller_role = 'officer' and v_target_role <> 'member' then
    raise exception 'forbidden';
  end if;

  update members set pin_hash = null, claimed_at = null where id = p_member;

  -- D-16: the lockout rows are cleared with the claim, so the player can
  -- immediately use the first-access flow. 0020 keys login attempts by member
  -- id; the handle key is cleared too for rows written before 0020.
  delete from pin_login_attempts
  where discord_handle in (v_handle, p_member::text);
end;
$$;

comment on function public.reset_member_pin(uuid) is
  'PIN reset (WHIT-06, D-16/D-17; Phase 10; 0021). Nulls pin_hash + claimed_at (the member re-claims through Primeiro acesso by nickname) and deletes the account''s pin_login_attempts rows (member id + legacy handle key). Caller gate: role in (officer, owner) AND an active caller row. Officers may reset MEMBERS only - officer targets are owner-only and the owner account is never resettable (D-08). Does NOT revoke outstanding stateless JWTs (accepted, documented D-17) - deactivation remains the immediate kill switch.';

revoke all on function public.reset_member_pin(uuid) from public, anon;
grant execute on function public.reset_member_pin(uuid) to authenticated;
