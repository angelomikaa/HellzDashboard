// NeoFoot REST data layer (plan 02-01) — thin raw-fetch client on the proven
// 01-02 gateway contract. NO supabase-js: login already uses raw fetch and
// supabase-js session handling would fight our foreign (verify-pin) JWT.
//
// EVERY call sends BOTH headers — apikey (gateway auth) and
// Authorization: Bearer <session.access_token> (RLS reads the member/role
// claims from this JWT). Missing Authorization -> empty results (RLS sees no
// claims); missing apikey -> 401.
import type { NeoFootSession } from '../features/auth/session'

export class ApiError extends Error {
  status: number
  kind: 'network' | 'unauthorized' | 'server'

  constructor(status: number, kind: 'network' | 'unauthorized' | 'server', message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.kind = kind
  }
}

export interface StatCatalogEntry {
  stat_key: string
  label: string
  group_name: 'general' | 'quasi' | 'special'
  value_type: 'flat' | 'percentual'
}

export interface MemberRow {
  id: string
  discord_handle: string
  display_name: string
  role: 'member' | 'officer' | 'owner'
  char_class: string | null
  char_function: 'tank' | 'dps'
}

export interface SubmissionRow {
  id: string
  status: 'pending' | 'validated' | 'rejected'
  submitted_at: string
}

/** Shared fetch: both gateway headers + JSON content type on every call. */
async function restFetch(session: NeoFootSession, path: string, init?: RequestInit): Promise<Response> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    throw new ApiError(0, 'network', 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }
  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
      ...init,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
  } catch (err) {
    throw new ApiError(0, 'network', err instanceof Error ? err.message : 'network error')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const kind = res.status === 401 ? 'unauthorized' : 'server'
    throw new ApiError(res.status, kind, `HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  return res
}

/** Parse a 2xx response body ('' -> undefined; else JSON). */
async function parseBody<T>(res: Response): Promise<T> {
  const text = await res.text()
  return (text === '' ? undefined : JSON.parse(text)) as T
}

export async function fetchCatalog(session: NeoFootSession): Promise<StatCatalogEntry[]> {
  const res = await restFetch(
    session,
    '/stat_catalog?select=stat_key,label,group_name,value_type&order=stat_key',
  )
  return parseBody<StatCatalogEntry[]>(res)
}

export async function fetchClasses(session: NeoFootSession): Promise<string[]> {
  const res = await restFetch(session, '/classes?select=class_name&order=class_name')
  const rows = await parseBody<{ class_name: string }[]>(res)
  return (rows ?? []).map((r) => r.class_name)
}

// fetchMe/fetchMembers use the EXPLICIT column projection below — NEVER a
// star select: pin_hash is ungranted (migration 0005 column-level security),
// so expanding to all columns is permission-denied BY DESIGN. The projection
// is the complete set of client-visible member columns (role included).

export async function fetchMe(session: NeoFootSession): Promise<MemberRow> {
  // RLS: returns only the caller's own row (member_select_own).
  const res = await restFetch(
    session,
    '/members?select=id,discord_handle,display_name,role,char_class,char_function&limit=1',
  )
  const rows = await parseBody<MemberRow[]>(res)
  const row = rows?.[0]
  if (!row) throw new ApiError(401, 'unauthorized', 'no member row visible')
  return row
}

export async function fetchMembers(session: NeoFootSession): Promise<MemberRow[]> {
  // RLS: staff-only (staff_select_all_members); members get just their own row.
  const res = await restFetch(
    session,
    '/members?select=id,discord_handle,display_name,role,char_class,char_function',
  )
  return (await parseBody<MemberRow[]>(res)) ?? []
}

export async function updateCharacter(
  session: NeoFootSession,
  id: string,
  patch: Partial<Pick<MemberRow, 'display_name' | 'char_class' | 'char_function'>>,
): Promise<void> {
  // Column grants allow updating display_name/char_class/char_function ONLY —
  // role/pin_hash are ungranted and fail server-side. RLS: staff policy.
  await restFetch(session, `/members?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export async function createClass(session: NeoFootSession, className: string): Promise<void> {
  // RLS: staff-only insert (staff_insert_classes).
  await restFetch(session, '/classes', { method: 'POST', body: JSON.stringify({ class_name: className }) })
}

export async function createSubmission(
  session: NeoFootSession,
  stats: { stat_key: string; value: number }[],
): Promise<string> {
  // Atomic append-only RPC (INPT-04): member_id is derived from the JWT
  // server-side; unknown stat keys are rejected server-side.
  const res = await restFetch(session, '/rpc/create_submission', {
    method: 'POST',
    body: JSON.stringify({ p_stats: stats }),
  })
  // PostgREST returns the function result as a JSON-encoded uuid string.
  return parseBody<string>(res)
}

export async function fetchMySubmissions(session: NeoFootSession): Promise<SubmissionRow[]> {
  // RLS: own submissions only (member_select_own_submissions); append-only —
  // there is no update/delete path anywhere in this client.
  const res = await restFetch(session, '/submissions?select=id,status,submitted_at&order=submitted_at.desc')
  return (await parseBody<SubmissionRow[]>(res)) ?? []
}
