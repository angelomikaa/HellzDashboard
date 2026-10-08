// NeoFoot verify-pin Edge Function (D-01, D-03, D-06, D-07)
// POST { discord_handle, pin } -> 200 { session } with a 7-day custom-claim JWT.
// The PIN and pin_hash are never logged and never appear in any response path.
import bcrypt from 'npm:bcryptjs@3'
import { SignJWT } from 'npm:jose@4'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  isLocked,
  nextFailureState,
  retryAfterSeconds,
  resetState,
  MAX_ATTEMPTS,
  LOCKOUT_MINUTES,
  type LockoutState,
} from '../_shared/lockout.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SESSION_SECONDS = 7 * 24 * 60 * 60 // D-06: 7-day session

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function rowToState(
  row: { failed_count: number | null; locked_until: string | null } | null,
): LockoutState {
  return {
    failedCount: row?.failed_count ?? 0,
    lockedUntil: row?.locked_until ? new Date(row.locked_until) : null,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { discord_handle?: unknown; pin?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }

  const discordHandle = body.discord_handle
  const pin = body.pin
  if (
    typeof discordHandle !== 'string' || discordHandle.length === 0 ||
    typeof pin !== 'string' || !/^\d{4}$/.test(pin)
  ) {
    return json({ error: 'invalid_request' }, 400)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()

  // Lockout gate (D-07): server-side, per handle, DB-backed. LOCKOUT_MINUTES (15) lives in
  // _shared/lockout.ts — the window is enforced here, never client-side.
  const attemptsRow = await admin
    .from('pin_login_attempts')
    .select('failed_count, locked_until')
    .eq('discord_handle', discordHandle)
    .maybeSingle()
  const lockState = rowToState(attemptsRow)
  if (isLocked(lockState, now)) {
    return json(
      { error: 'locked', retry_after_seconds: retryAfterSeconds(lockState, now) },
      429,
    )
  }

  // Shared failure path: missing handle, inactive member, and wrong PIN return the
  // IDENTICAL 401 shape (T-01-07: no user enumeration) and all count toward the lockout.
  async function recordFailure(): Promise<number> {
    const next = nextFailureState(lockState, now)
    await admin.from('pin_login_attempts').upsert({
      discord_handle: discordHandle,
      failed_count: next.failedCount,
      locked_until: next.lockedUntil ? next.lockedUntil.toISOString() : null,
      updated_at: now.toISOString(),
    })
    return Math.max(0, MAX_ATTEMPTS - next.failedCount)
  }

  const invalidCredentials = async () =>
    json({ error: 'invalid_credentials', attempts_remaining: await recordFailure() }, 401)

  const member = await admin
    .from('members')
    .select('id, display_name, role, pin_hash, active')
    .eq('discord_handle', discordHandle)
    .maybeSingle()

  if (!member || member.active === false) return await invalidCredentials()

  if (!bcrypt.compareSync(pin, member.pin_hash)) return await invalidCredentials()

  // Success: reset the attempt counter (D-07: reset only on success)
  const cleared = resetState()
  await admin.from('pin_login_attempts').upsert({
    discord_handle: discordHandle,
    failed_count: cleared.failedCount,
    locked_until: null,
    updated_at: now.toISOString(),
  })

  // Mint the 7-day custom-claim JWT (D-06). `role: 'authenticated'` drives the PostgREST
  // role switch; RLS reads identity from the member_id/member_role custom claims.
  const nowSec = Math.floor(Date.now() / 1000)
  const secret = new TextEncoder().encode(Deno.env.get('SUPABASE_JWT_SECRET')!)
  const token = await new SignJWT({
    role: 'authenticated',
    member_id: member.id,
    member_role: member.role,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(member.id)
    .setIssuedAt(nowSec)
    .setIssuer('nefoot-verify-pin')
    .setExpirationTime(nowSec + SESSION_SECONDS)
    .sign(secret)

  return json({
    session: {
      access_token: token,
      member_id: member.id,
      display_name: member.display_name,
      member_role: member.role,
      expires_at: nowSec + SESSION_SECONDS,
    },
  })
})
