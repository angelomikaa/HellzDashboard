// NeoFoot verify-pin Edge Function (D-01, D-03, D-06, D-07; Phase 10)
// POST { nickname, pin } -> 200 { session } with a 7-day custom-claim JWT.
//
// Phase 10 (owner decision 2026-10-23): login is by character NICKNAME + PIN.
// The row is resolved through members.login_key (lower(trim(display_name)));
// the Discord handle stays a staff-facing contact field. Legacy clients that
// still post { discord_handle } keep working (handle lookup fallback) and the
// request-access identify probe still classifies unclaimed handles.
//
// The PIN and pin_hash are never logged and never appear in any response path.
import bcrypt from 'npm:bcryptjs@3'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  DUMMY_HASH,
  corsHeaders,
  envConfig,
  json,
  mintSession,
  deviceFingerprintFromRequest,
  rowToState,
} from '../_shared/session.ts'
import {
  isLocked,
  retryAfterSeconds,
  resetState,
  MAX_ATTEMPTS,
} from '../_shared/lockout.ts'

interface MemberRow {
  id: string
  display_name: string
  role: string
  pin_hash: string | null
  active: boolean
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { nickname?: unknown; discord_handle?: unknown; pin?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }

  // WR-04: trim + bound the login key server-side so whitespace variants and
  // unbounded junk cannot desync the lockout key.
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : ''
  const legacyHandle = typeof body.discord_handle === 'string' ? body.discord_handle.trim() : ''
  const pin = body.pin
  if (
    (nickname.length === 0 && legacyHandle.length === 0) ||
    nickname.length > 80 ||
    legacyHandle.length > 64 ||
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

  // Discord handles are stored as typed; compare case-insensitively without
  // letting a handle's `%`/`_` act as LIKE wildcards.
  const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)

  async function memberByHandle(value: string): Promise<MemberRow | null> {
    const { data, error } = await admin
      .from('members')
      .select('id, display_name, role, pin_hash, active')
      .eq('active', true)
      .ilike('discord_handle', escapeLike(value))
      .limit(2)
    if (error) throw new Error('handle lookup failed')
    const rows = (data ?? []) as MemberRow[]
    // discord_handle is UNIQUE; more than one hit means a broken registry, which
    // must never be guessed (uniform 401).
    return rows.length === 1 ? rows[0] : null
  }

  // Resolve the registry row before touching the lockout: since 0020 attempts
  // are counted per ACCOUNT (members.id), so the same person cannot dodge the
  // window by switching between nickname and legacy handle.
  let member: MemberRow | null = null
  if (nickname.length > 0) {
    const { data, error } = await admin
      .from('members')
      .select('id, display_name, role, pin_hash, active')
      .eq('login_key', nickname.toLowerCase())
      .eq('active', true)
    if (error) return json({ error: 'server_error' }, 500)
    const rows = (data ?? []) as MemberRow[]
    // Two active members sharing a nickname cannot be told apart: never guess.
    if (rows.length > 1) return json({ error: 'ambiguous_identity' }, 409)
    member = rows[0] ?? null
  }
  if (!member && legacyHandle.length > 0) {
    try {
      member = await memberByHandle(legacyHandle)
    } catch {
      return json({ error: 'server_error' }, 500)
    }
  }
  // 2026-10-23 owner report: typing the DISCORD HANDLE in the login field must
  // still log the account in (and, when a PIN exists, never reach the PIN
  // setup path — only a NULL pin_hash does that).
  if (!member && nickname.length > 0) {
    try {
      member = await memberByHandle(nickname)
    } catch {
      return json({ error: 'server_error' }, 500)
    }
  }

  // Shared failure path: missing account, inactive member and wrong PIN return
  // the IDENTICAL 401 shape (T-01-07: no user enumeration). Unknown names are
  // never written to the counter - there is no account to protect.
  const invalidCredentials = async () => {
    if (!member) {
      bcrypt.compareSync(pin, DUMMY_HASH) // burn equal time; discard result
      return json({ error: 'invalid_credentials' }, 401)
    }
    try {
      const { data: rpcRow, error: rpcErr } = await admin.rpc('record_pin_failure', {
        p_handle: member.id,
      })
      if (rpcErr) throw new Error('record_pin_failure RPC failed')
      const row = (Array.isArray(rpcRow) ? rpcRow[0] : rpcRow) as
        | { o_failed_count: number | null; o_locked_until: string | null }
        | null
      if (!row) throw new Error('record_pin_failure RPC returned no row')
      const failedCount = Number(row.o_failed_count ?? 0)
      const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - failedCount)
      return json({ error: 'invalid_credentials', attempts_remaining: attemptsRemaining }, 401)
    } catch {
      // Infra-side failure (RPC unavailable/failed): never burn the user's attempts.
      return json({ error: 'server_error' }, 500)
    }
  }

  if (!member || member.active === false) return await invalidCredentials()

  // Lockout gate (D-07): server-side, per account, DB-backed. LOCKOUT_MINUTES
  // (15) lives in _shared/lockout.ts — enforced here, never client-side.
  const { data: attemptsRow, error: readErr } = await admin
    .from('pin_login_attempts')
    .select('failed_count, locked_until')
    .eq('discord_handle', member.id)
    .maybeSingle()
  if (readErr) return json({ error: 'server_error' }, 500)
  const lockState = rowToState(attemptsRow)
  if (isLocked(lockState, now)) {
    return json(
      { error: 'locked', retry_after_seconds: retryAfterSeconds(lockState, now) },
      429,
    )
  }

  // D-04/WHIT-02: an ACTIVE account with no PIN yet has not claimed access.
  // Never mint a session here. The branch sits BEFORE the real compare (a null
  // hash must never reach bcrypt) and is timing-equalized.
  if (member.pin_hash === null) {
    bcrypt.compareSync(pin, DUMMY_HASH)
    try {
      await admin.rpc('record_pin_failure', { p_handle: member.id })
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
    discord_handle: member.id,
    failed_count: cleared.failedCount,
    locked_until: null,
    updated_at: now.toISOString(),
  })
  if (clearErr) return json({ error: 'server_error' }, 500)

  // Mint the 7-day custom-claim JWT (D-06) through the shared module — the exact
  // same block setup-pin uses, so both functions return an identical session.
  // D-17: bind device fingerprint (User-Agent only) to the JWT so a stolen
  // session is invalidated from a different device. IP is excluded — the
  // browser cannot read its public IP, so an IP-derived value can never match
  // the client and breaks on mobile networks.
  const deviceFp = await deviceFingerprintFromRequest(req)

  let session
  try {
    session = await mintSession(
      {
        id: member.id,
        display_name: member.display_name,
        role: member.role,
      },
      deviceFp,
    )
  } catch {
    return json({ error: 'server_error' }, 500)
  }

  return json({ session })
})
