// NeoFoot session helpers (Plan 01-03, D-06)
// localStorage-backed 7-day session. This is UX state ONLY — the real enforcement
// is the server: RLS re-validates the JWT on every PostgREST call (Plan 01-02).
export interface NeoFootSession {
  access_token: string
  member_id: string
  display_name: string
  member_role: 'member' | 'officer' | 'owner'
  expires_at: number // epoch seconds
}

const STORAGE_KEY = 'nefoot_session'

export function saveSession(s: NeoFootSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

export function loadSession(): NeoFootSession | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as NeoFootSession) : null
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function isExpired(s: NeoFootSession): boolean {
  return s.expires_at * 1000 <= Date.now()
}
