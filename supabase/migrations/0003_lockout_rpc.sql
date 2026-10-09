-- NeoFoot Phase 1 fix (CR-01): atomic PIN failure counter (review 01-REVIEW).
--
-- The read-modify-write upsert in verify-pin was a TOCTOU race: concurrent
-- requests all read the same failed_count and the effective attempt limit
-- collapsed. This SECURITY DEFINER RPC makes count-and-lock a single atomic
-- statement (INSERT ... ON CONFLICT DO UPDATE with a server-computed count).
--
-- D-07 lockout semantics are IDENTICAL to _shared/lockout.ts and MUST stay in
-- sync — MAX_ATTEMPTS = 5 and LOCKOUT_MINUTES = 15 are the single source of
-- truth in supabase/functions/_shared/lockout.ts; if they ever change, this
-- RPC must be updated to match.
--
-- NOTE: this migration must be pushed to the live Supabase project (via the
-- Management API database/query endpoint) for the fix to take effect.

create or replace function public.record_pin_failure(
  p_handle text,
  out o_failed_count int,
  out o_locked_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into pin_login_attempts (discord_handle) values (p_handle)
  on conflict (discord_handle) do update
    set failed_count = pin_login_attempts.failed_count + 1,
        locked_until = case
          when pin_login_attempts.failed_count + 1 >= 5  -- MAX_ATTEMPTS (D-07)
            then now() + interval '15 minutes'            -- LOCKOUT_MINUTES (D-07)
          else null end,
        updated_at = now()
  returning pin_login_attempts.failed_count, pin_login_attempts.locked_until
  into o_failed_count, o_locked_until;
end;
$$;

comment on function public.record_pin_failure(text) is
  'Atomic PIN failure counter (CR-01). Increments failed_count and locks after 5 failures for 15 minutes (D-07). Constants mirror supabase/functions/_shared/lockout.ts — keep in sync.';
