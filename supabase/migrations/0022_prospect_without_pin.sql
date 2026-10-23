-- 0022_prospect_without_pin.sql
-- Owner decision 2026-10-23: the recruitment flow never asks for a PIN.
-- =========================================================================
-- A prospect is not a member yet. Asking for a PIN at application time was a
-- leftover from the old intake model: the applicant picked a credential for an
-- account that staff might reject. From 0020 on the PIN is defined on the
-- first access (print-first claim), so the prospect request is stored with
-- pin_hash NULL and approve_request v3 already creates the member UNCLAIMED
-- for exactly that case.
--
-- Only the shape guard changes: a prospect request may carry no PIN hash
-- (and any PIN a stale client still sends is dropped, never stored). The
-- member re-link path keeps requiring one, because there the PIN proves the
-- handle belongs to the applicant (D-11 supersede).
-- =========================================================================

create or replace function public.create_membership_request(
  p_handle text,
  p_pin_hash text,
  p_request_type text,
  p_char_id text,
  p_nickname text,
  p_char_class text,
  p_char_function text,
  p_proof_path text,
  p_stats jsonb default null,
  p_supersede_request uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text := btrim(coalesce(p_handle, ''));
  v_pin_hash text := nullif(btrim(coalesce(p_pin_hash, '')), '');
  v_type text := coalesce(p_request_type, '');
  v_char_id text := btrim(coalesce(p_char_id, ''));
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_class text := btrim(coalesce(p_char_class, ''));
  v_function text := coalesce(p_char_function, '');
  v_proof text := coalesce(p_proof_path, '');
  v_current membership_requests%rowtype;
  v_old_proof text;
  v_request uuid;
begin
  if char_length(v_handle) = 0 or char_length(v_handle) > 64 then
    raise exception 'invalid_handle';
  end if;
  if public.is_dummy_handle(v_handle) then
    raise exception 'dummy_handle';
  end if;
  if v_type not in ('member', 'prospect') then
    raise exception 'invalid_request_type';
  end if;
  -- 0022: a prospect has no credential yet; the member re-link still proves
  -- ownership of the handle through its PIN.
  if v_type = 'prospect' then
    v_pin_hash := null;
  elsif v_pin_hash is null then
    raise exception 'invalid_pin';
  end if;
  if v_pin_hash is not null and char_length(v_pin_hash) > 200 then
    raise exception 'invalid_pin';
  end if;
  -- UAT test 7 (owner, 2026-10-22): Identificacao is a re-link loop for
  -- EXISTING handles only. Unknown handles must use Recrutamento.
  if v_type = 'member'
     and not exists (select 1 from members m where m.discord_handle = v_handle) then
    raise exception 'not_member';
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
  if char_length(v_proof) = 0 then
    raise exception 'invalid_proof';
  end if;

  -- Stats shape: prospects must carry a full application (>= 56 known unique
  -- keys, every value numeric); member-type requests carry none (D-06/D-08).
  if v_type = 'prospect' then
    if p_stats is null
       or jsonb_typeof(p_stats) <> 'array'
       or jsonb_array_length(p_stats) < 56 then
      raise exception 'invalid_stats';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_stats) e
      where jsonb_typeof(e -> 'value') <> 'number'
         or not exists (select 1 from stat_catalog c where c.stat_key = e ->> 'stat_key')
    ) then
      raise exception 'invalid_stats';
    end if;
    if (select count(distinct e ->> 'stat_key') from jsonb_array_elements(p_stats) e)
       <> jsonb_array_length(p_stats) then
      raise exception 'invalid_stats';
    end if;
  else
    if p_stats is not null
       and jsonb_typeof(p_stats) = 'array'
       and jsonb_array_length(p_stats) > 0 then
      raise exception 'invalid_stats';
    end if;
  end if;

  -- D-11: exactly one current request per handle. A still-pending request can
  -- only be overwritten when the caller supplies its id (the Edge Function
  -- proved PIN ownership); any other attempt raises request_pending.
  select * into v_current
  from membership_requests r
  where lower(r.discord_handle) = lower(v_handle)
    and r.status = 'pending'
  for update;

  if v_current.id is not null then
    if p_supersede_request is null or p_supersede_request <> v_current.id then
      raise exception 'request_pending';
    end if;
    v_old_proof := v_current.proof_path;
    update membership_requests
       set status = 'superseded',
           decided_at = now(),
           proof_path = null
     where id = v_current.id
       and status = 'pending';
  end if;

  -- Cross-table ID uniqueness. Exclude the requesting handle's own member row
  -- (an inactive legacy member may re-request with their own ID) and the
  -- request just superseded (its char_id becomes reusable).
  perform public.assert_char_id_available(
    v_char_id,
    (select m.id from members m where m.discord_handle = v_handle),
    p_supersede_request
  );

  insert into membership_requests
    (discord_handle, pin_hash, request_type, char_id, nickname, char_class, char_function, proof_path)
  values
    (v_handle, v_pin_hash, v_type, v_char_id, v_nickname, v_class, v_function, v_proof)
  returning id into v_request;

  if v_type = 'prospect' then
    insert into membership_request_stats (request_id, stat_key, value)
    select v_request, e ->> 'stat_key', (e ->> 'value')::numeric
    from jsonb_array_elements(p_stats) e;
  end if;

  return jsonb_build_object(
    'request_id', v_request,
    'superseded_proof_path', v_old_proof
  );
end;
$$;

comment on function public.create_membership_request(text, text, text, text, text, text, text, text, jsonb, uuid) is
  'Service-role-only membership application write (WHIT-08/09/10, D-06/D-08/D-11; 0022). Validates handle/PIN/identity(class+function)/proof and stats (prospect: >=56 known unique numeric keys; member: none). A prospect request is stored with NO PIN (pin_hash NULL) - the PIN is chosen at first access after staff approval (owner decision 2026-10-23); the member re-link path still requires one. Supersedes the handle''s pending request ONLY when p_supersede_request matches its id (the Edge proved PIN ownership) - the superseded row and stats are retained, only proof_path is cleared and returned so the client can purge the image. Exceptions: invalid_handle/dummy_handle/invalid_pin/invalid_request_type/not_member/invalid_identity/unknown_class/invalid_function/invalid_proof/invalid_stats/request_pending/duplicate_char_id. No caller gate by design - grant is service_role only.';
