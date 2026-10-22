// NeoFoot step-up (re-PIN) Edge Function — Phase 08.1 repair (migration 0017).
//
// POST /functions/v1/step-up
//   Authorization: Bearer <session access_token>
//   body: { pin }
//   -> 200 { token }        single-use, device-bound step-up token id (10 min)
//
// Why an Edge Function: re-PIN must verify the CALLER's bcryptjs hash. pgcrypto
// cannot read bcryptjs '$2b$' hashes (it falls back to a DES salt and silently
// returns a non-matching hash), so the check stays with bcryptjs — the exact
// library verify-pin uses. The token row is written with the service role;
// set_member_role consumes it from the X-Step-Up header.
//
// The PIN and pin_hash are never logged and never appear in any response path.
import bcrypt from 'npm:bcryptjs@3'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { jwtVerify } from 'npm:jose@4'
import {
  DUMMY_HASH,
  corsHeaders,
  envConfig,
  json,
  rowToState,
} from '../_shared/session.ts'
import {
  isLocked,
  retryAfterSeconds,
  resetState,
  MAX_ATTEMPTS,
} from '../_shared/lockout.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // WR-05: a missing function secret must never turn into a permissive path.
  const cfg = envConfig()
  if (!cfg) return json({ error: 'server_misconfigured' }, 500)

  // The caller is an authenticated member presenting their own session JWT —
  // verified locally with the project signing secret (same key verify-pin mints
  // with). The anon key is signed with a different secret, so it never passes.
  const authHeader = req.headers.get('authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (bearer === '') return json({ error: 'unauthorized' }, 401)

  let claims: Record<string, unknown>
  try {
    const { payload } = await jwtVerify(bearer, new TextEncoder().encode(cfg.jwtSecret), {
      algorithms: ['HS256'],
    })
    claims = payload as Record<string, unknown>
  } catch {
    return json({ error: 'unauthorized' }, 401)
  }

  const memberId = typeof claims.member_id === 'string' ? claims.member_id : ''
  if (memberId === '' || claims.role !== 'authenticated') {
    return json({ error: 'unauthorized' }, 401)
  }

  let body: { pin?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }
  const pin = body.pin
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return json({ error: 'invalid_request' }, 400)
  }

  const admin = createClient(cfg.supabaseUrl, cfg.serviceRoleKey)
  const now = new Date()

  const { data: member, error: memberErr } = await admin
    .from('members')
    .select('id, role, active, pin_hash, discord_handle')
    .eq('id', memberId)
    .maybeSingle()
  if (memberErr) return json({ error: 'server_error' }, 500)
  // Inactive or deleted sessions get the same 401 as a bad token; no oracle.
  if (!member || member.active === false) return json({ error: 'invalid_session' }, 401)
  // Step-up only exists for handling actions (role changes are owner-only, but
  // the RPC re-checks the owner gate — this is the staff surface, nothing more).
  if (member.role !== 'owner' && member.role !== 'officer') {
    return json({ error: 'forbidden' }, 403)
  }

  // Lockout gate (D-07): the SAME per-handle counter as the login path — a
  // wrong step-up PIN counts toward the 5-attempts/15-minutes window.
  const { data: attemptsRow, error: readErr } = await admin
    .from('pin_login_attempts')
    .select('failed_count, locked_until')
    .eq('discord_handle', member.discord_handle)
    .maybeSingle()
  if (readErr) return json({ error: 'server_error' }, 500)
  const lockState = rowToState(attemptsRow)
  if (isLocked(lockState, now)) {
    return json(
      { error: 'locked', retry_after_seconds: retryAfterSeconds(lockState, now) },
      429,
    )
  }

  // CR-01: count-and-lock is one atomic SECURITY DEFINER call (0003); trust
  // only its returned count, never the pre-read state.
  async function recordFailure(): Promise<number> {
    const { data: rpcRow, error: rpcErr } = await admin.rpc('record_pin_failure', {
      p_handle: member.discord_handle,
    })
    if (rpcErr) throw new Error('record_pin_failure RPC failed')
    const row = (Array.isArray(rpcRow) ? rpcRow[0] : rpcRow) as
      | { o_failed_count: number | null }
      | null
    if (!row) throw new Error('record_pin_failure RPC returned no row')
    return Math.max(0, MAX_ATTEMPTS - Number(row.o_failed_count ?? 0))
  }

  // D-04: an active member without a PIN has never completed first access —
  // never exchange a dummy compare for a token. Timing is equalized.
  if (member.pin_hash === null) {
    bcrypt.compareSync(pin, DUMMY_HASH)
    return json({ error: 'pin_setup_required' }, 409)
  }

  if (!bcrypt.compareSync(pin, member.pin_hash)) {
    try {
      const attemptsRemaining = await recordFailure()
      return json({ error: 'invalid_pin', attempts_remaining: attemptsRemaining }, 401)
    } catch {
      // Infra-side failure: never burn the user's attempts.
      return json({ error: 'server_error' }, 500)
    }
  }

  // Success path: the counter reset must not fail silently (same rule as
  // verify-pin WR-03) — otherwise the correct-PIN owner stays throttled.
  const cleared = resetState()
  const { error: clearErr } = await admin.from('pin_login_attempts').upsert({
    discord_handle: member.discord_handle,
    failed_count: cleared.failedCount,
    locked_until: null,
    updated_at: now.toISOString(),
  })
  if (clearErr) return json({ error: 'server_error' }, 500)

  // One live step-up at a time: retire any token the owner did not spend.
  const { error: retireErr } = await admin
    .from('step_up_tokens')
    .update({ used: true })
    .eq('member_id', member.id)
    .eq('used', false)
  if (retireErr) return json({ error: 'server_error' }, 500)

  // Device binding must match what set_member_role compares: the session's own
  // device_fp claim (empty for sessions minted before D-17, which simply means
  // the token is bound to the member + JWT only).
  const deviceFp = typeof claims.device_fp === 'string' ? claims.device_fp : ''

  const { data: tokenRow, error: insertErr } = await admin
    .from('step_up_tokens')
    .insert({ member_id: member.id, device_fp: deviceFp })
    .select('id')
    .single()
  if (insertErr || !tokenRow) return json({ error: 'server_error' }, 500)

  return json({ token: tokenRow.id })
})
