// NeoFoot verify-pin Edge Function (D-01, D-03, D-06, D-07)
// POST { discord_handle, pin } -> 200 { session } with a 7-day custom-claim JWT.
// The PIN and pin_hash are never logged and never appear in any response path.
import bcrypt from 'npm:bcryptjs@3'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  DUMMY_HASH,
  corsHeaders,
  envConfig,
  json,
  mintSession,
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

  let body: { discord_handle?: unknown; pin?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }

  // WR-04: trim + bound the handle server-side so whitespace variants and
  // unbounded junk handles cannot fill the DB or desync the lockout key.
  const handle = typeof body.discord_handle === 'string' ? body.discord_handle.trim() : ''
  const pin = body.pin
  if (
    handle.length === 0 || handle.length > 64 ||
    typeof pin !== 'string' || !/^\d{4}$/.test(pin)
  ) {
    return json({ error: 'invalid_request' }, 400)
  }

  // WR-05: fail fast on missing function env secrets — a missing secret must
  // never mint HS256 tokens signed with the literal string "undefined".
  const cfg = envConfig()
  if (!cfg) {
    return json({ error: 'server_misconfigured' }, 500)
  }

  const admin = createClient(cfg.supabaseUrl, cfg.serviceRoleKey)

  const now = new Date()

  // Lockout gate (D-07): server-side, per handle, DB-backed. LOCKOUT_MINUTES (15) lives in
  // _shared/lockout.ts — the window is enforced here, never client-side.
  // WR-03: every Supabase query error fails loudly as a 500 — and infra-side
  // failures never count as login failures (a DB hiccup must not lock out users).
  const { data: attemptsRow, error: readErr } = await admin
    .from('pin_login_attempts')
    .select('failed_count, locked_until')
    .eq('discord_handle', handle)
    .maybeSingle()
  if (readErr) return json({ error: 'server_error' }, 500)
  const lockState = rowToState(attemptsRow)
  if (isLocked(lockState, now)) {
    return json(
      { error: 'locked', retry_after_seconds: retryAfterSeconds(lockState, now) },
      429,
    )
  }

  // Shared failure path: missing handle, inactive member, and wrong PIN return the
  // IDENTICAL 401 shape (T-01-07: no user enumeration) and all count toward the lockout.
  // CR-01: count-and-lock is a single atomic statement — the SECURITY DEFINER RPC
  // record_pin_failure (migration 0003_lockout_rpc.sql) — so concurrent requests
  // cannot collapse the counter. We trust only the RPC's RETURNED count, never the
  // pre-read state above. The RPC's 5-attempts/15-minutes constants mirror
  // MAX_ATTEMPTS/LOCKOUT_MINUTES in _shared/lockout.ts (the validated source).
  async function recordFailure(): Promise<number> {
    const { data: rpcRow, error: rpcErr } = await admin.rpc('record_pin_failure', {
      p_handle: handle,
    })
    if (rpcErr) throw new Error('record_pin_failure RPC failed')
    const row = (Array.isArray(rpcRow) ? rpcRow[0] : rpcRow) as
      | { o_failed_count: number | null; o_locked_until: string | null }
      | null
    if (!row) throw new Error('record_pin_failure RPC returned no row')
    const failedCount = Number(row.o_failed_count ?? 0)
    return Math.max(0, MAX_ATTEMPTS - failedCount)
  }

  const invalidCredentials = async () => {
    try {
      const attemptsRemaining = await recordFailure()
      return json({ error: 'invalid_credentials', attempts_remaining: attemptsRemaining }, 401)
    } catch {
      // Infra-side failure (RPC unavailable/failed): never burn the user's attempts.
      return json({ error: 'server_error' }, 500)
    }
  }

  const { data: member, error: memberErr } = await admin
    .from('members')
    .select('id, display_name, role, pin_hash, active')
    .eq('discord_handle', handle)
    .maybeSingle()
  // WR-03: a failed member lookup is NOT "wrong credentials" — return 500
  // without recording a failure (recordFailure is never reached).
  if (memberErr) return json({ error: 'server_error' }, 500)

  // WR-01: equalize the timing of the missing/inactive path with the wrong-PIN
  // path (dummy compare) so latency cannot enumerate handles (T-01-07).
  if (!member || member.active === false) {
    bcrypt.compareSync(pin, DUMMY_HASH) // burn equal time; discard result
    return await invalidCredentials()
  }

  // D-04/WHIT-02: an ACTIVE handle with no PIN yet is a whitelisted player who
  // has not claimed access. Never mint a session here. The branch sits AFTER the
  // inactive gate (inactive handles keep the uniform 401) and BEFORE the real
  // compare (a null hash must never reach bcrypt). Timing is equalized with the
  // dummy compare and the existing per-handle counter throttles enumeration.
  if (member.pin_hash === null) {
    bcrypt.compareSync(pin, DUMMY_HASH)
    try {
      await recordFailure()
    } catch {
      // Infra hiccup must not mask the setup signal (the counter stays untouched).
    }
    return json({ error: 'pin_setup_required' }, 409)
  }

  if (!bcrypt.compareSync(pin, member.pin_hash)) return await invalidCredentials()

  // WR-03: the success-path reset must not silently fail — the correct-PIN user
  // would get a 200 while the counter stays incremented.
  const cleared = resetState()
  const { error: clearErr } = await admin.from('pin_login_attempts').upsert({
    discord_handle: handle,
    failed_count: cleared.failedCount,
    locked_until: null,
    updated_at: now.toISOString(),
  })
  if (clearErr) return json({ error: 'server_error' }, 500)

  // Mint the 7-day custom-claim JWT (D-06) through the shared module — the exact
  // same block setup-pin uses, so both functions return an identical session.
  let session
  try {
    session = await mintSession({
      id: member.id,
      display_name: member.display_name,
      role: member.role,
    })
  } catch {
    return json({ error: 'server_error' }, 500)
  }

  return json({ session })
})
