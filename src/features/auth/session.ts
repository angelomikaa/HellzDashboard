// NeoFoot session helpers (Plan 01-03, D-06)
// localStorage-backed 7-day session. This is UX state ONLY — the real enforcement
// is the server: RLS re-validates the JWT on every PostgREST call (Plan 01-02).
export interface NeoFootSession {
  access_token: string
  member_id: string
  display_name: string
  member_role: 'member' | 'officer' | 'owner'
  expires_at: number // epoch seconds
  deviceFp?: string // D-17: device fingerprint bound to the session JWT
}

const STORAGE_KEY = 'nefoot_session'

// CR-02: shape validation for anything that crosses the localStorage boundary.
// A malformed 200 response or corrupted storage value must never poison the
// session key or crash the app (loadSession runs during RequireAuth's render).
export function isValidSession(s: unknown): s is NeoFootSession {
  if (typeof s !== 'object' || s === null) return false
  const t = s as Record<string, unknown>
  return (
    typeof t.access_token === 'string' && t.access_token.length > 0 &&
    typeof t.member_id === 'string' && t.member_id.length > 0 &&
    typeof t.display_name === 'string' && t.display_name.length > 0 &&
    (t.member_role === 'member' || t.member_role === 'officer' || t.member_role === 'owner') &&
    typeof t.expires_at === 'number' && Number.isFinite(t.expires_at)
  )
}

export function saveSession(s: NeoFootSession): void {
  // CR-02: never persist a malformed session (defense in depth — loadSession
  // re-validates on read, but refusing the write keeps the key unpoisoned).
  if (!isValidSession(s)) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

export function loadSession(): NeoFootSession | null {
  // CR-02: JSON.parse must never throw during render — a corrupted storage
  // value (or the literal "undefined") self-heals by clearing the key.
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s: unknown = JSON.parse(raw)
    if (!isValidSession(s)) {
      clearSession()
      return null
    }
    return s
  } catch {
    clearSession()
    return null
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function isExpired(s: NeoFootSession): boolean {
  return s.expires_at * 1000 <= Date.now()
}

// D-17: client-side device fingerprint (SHA-256 of navigator.userAgent).
// Computed once per page load; sent as X-Device-Fingerprint on every API
// request so the server can enforce session-device binding.
export async function computeDeviceFingerprintClient(): Promise<string> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const buf = new TextEncoder().encode(ua)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex
}

// D-17: returns true when the session's device_fp matches the current
// device fingerprint (or when deviceFp is absent — backward compatible with
// pre-binding sessions). Used by api.ts to decide whether to re-auth.
export function isDeviceBound(session: NeoFootSession, currentFp: string): boolean {
  if (!session.deviceFp) return true // pre-binding session, no enforcement yet
  return session.deviceFp === currentFp
}
