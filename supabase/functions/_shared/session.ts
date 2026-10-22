// NeoFoot shared Edge Function session plumbing (Phase 8, plan 08-02).
// verify-pin, setup-pin and request-access all import from here so the CORS
// shape, the JSON envelope, the JWT mint and the proof decoder can never drift.
// The PIN and pin_hash are never logged and never appear in any response path.
import { SignJWT } from 'npm:jose@4'
import type { LockoutState } from './lockout.ts'

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// WR-01: bcrypt only runs on the wrong-PIN path, so the ~100ms latency gap is a
// timing oracle for whether a handle exists in the whitelist. Missing/inactive
// handles burn equal time with a dummy compare; the result is discarded.
// Copied verbatim from verify-pin (the production value must not drift).
export const DUMMY_HASH = '$2b$10$do3wEW4Kw.b6.cPViR4gful21a5LL997L3/TZ61hX.B0g/.7haOUO'

export function rowToState(
  row: { failed_count: number | null; locked_until: string | null } | null,
): LockoutState {
  return {
    failedCount: row?.failed_count ?? 0,
    lockedUntil: row?.locked_until ? new Date(row.locked_until) : null,
  }
}

export const SESSION_SECONDS = 7 * 24 * 60 * 60 // D-06: 7-day session

// D-17: device fingerprint = SHA-256(user agent + IP). Bound to the JWT at
// login; invalidated on mismatch (requires re-login).
export async function computeDeviceFingerprint(
  ua: string | null,
  ip: string | null,
): Promise<string> {
  const input = ((ua ?? '') + '|' + (ip ?? '')).trim()
  const buf = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex
}

export const DEVICE_FP_CLAIM = 'device_fp'

export interface EnvConfig {
  supabaseUrl: string
  serviceRoleKey: string
  jwtSecret: string
  jwtKid: string
}

// WR-05: fail fast on missing function env secrets — a missing secret must
// never mint HS256 tokens signed with the literal string "undefined".
export function envConfig(): EnvConfig | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const jwtSecret = Deno.env.get('NEFOOT_JWT_SECRET')
  const jwtKid = Deno.env.get('NEFOOT_JWT_KEY_ID')
  if (!supabaseUrl || !serviceRoleKey || !jwtSecret || !jwtKid) return null
  return { supabaseUrl, serviceRoleKey, jwtSecret, jwtKid }
}

export interface Session {
  access_token: string
  member_id: string
  display_name: string
  member_role: string
  expires_at: number
}

// Mint the 7-day custom-claim JWT (D-06). `role: 'authenticated'` drives the
// PostgREST role switch; RLS reads identity from the member_id/member_role
// custom claims. Signed HS256 with NEFOOT_JWT_SECRET — a project JWT signing key
// registered via the Management API (the legacy project secret is no longer
// exposed by the platform). The kid header lets PostgREST select the right key;
// both are function env secrets. This is the exact block verify-pin shipped.
export async function mintSession(member: {
  id: string
  display_name: string
  role: string
}, deviceFp?: string): Promise<Session> {
  const cfg = envConfig()
  if (!cfg) throw new Error('server_misconfigured')
  const nowSec = Math.floor(Date.now() / 1000)
  const secret = new TextEncoder().encode(cfg.jwtSecret)
  const kid = cfg.jwtKid
  const claims: Record<string, unknown> = {
    role: 'authenticated',
    member_id: member.id,
    member_role: member.role,
  }
  if (deviceFp) {
    claims[DEVICE_FP_CLAIM] = deviceFp
  }
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid })
    .setSubject(member.id)
    .setIssuedAt(nowSec)
    .setIssuer('nefoot-verify-pin')
    .setExpirationTime(nowSec + SESSION_SECONDS)
    .sign(secret)

  return {
    access_token: token,
    member_id: member.id,
    display_name: member.display_name,
    member_role: member.role,
    expires_at: nowSec + SESSION_SECONDS,
  }
}

// D-14/D-15 step-up lives in the step_up_tokens table + the `step-up` Edge
// Function (migration 0017). The earlier short-lived-JWT design was never
// wired to a caller and is removed so the two designs cannot be confused.

export const MAX_PROOF_BYTES = 2_097_152 // CONTEXT: JPEG only, 2 MB

// Byte length encoded by a `data:image/jpeg;base64,...` payload, or -1 when the
// value is not a base64 JPEG data URL. Callers use this to answer 413 before
// decodeProof() conflates "too large" with "not a JPEG".
export function proofByteLength(dataUrl: unknown): number {
  if (typeof dataUrl !== 'string') return -1
  const match = /^data:image\/jpeg;base64,(.*)$/is.exec(dataUrl.trim())
  if (!match) return -1
  const payload = match[1].replace(/\s+/g, '')
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.floor((payload.length * 3) / 4) - padding
}

// T-08-13: accept only a server-decodable JPEG with a real SOI marker. No PNG,
// no SVG, no arbitrary data URL. size is bounded by the caller (413 path) and
// again here (treat as invalid) so a mis-sized payload can never reach storage.
export function decodeProof(
  dataUrl: unknown,
  maxBytes = MAX_PROOF_BYTES,
): { bytes: Uint8Array; mime: 'image/jpeg' } | null {
  if (typeof dataUrl !== 'string') return null
  const match = /^data:image\/jpeg;base64,(.*)$/is.exec(dataUrl.trim())
  if (!match) return null

  const payload = match[1].replace(/\s+/g, '')
  if (payload.length === 0) return null

  let binary: string
  try {
    binary = atob(payload)
  } catch {
    return null
  }

  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  if (bytes.length === 0 || bytes.length > maxBytes) return null
  // JPEG magic bytes: FF D8 FF
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null
  return { bytes, mime: 'image/jpeg' }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
