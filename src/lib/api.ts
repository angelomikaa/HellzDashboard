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
  active: boolean // added in Phase 6 — owner Remover/Reativar controls (set_member_active)
  char_class: string | null
  char_function: 'tank' | 'dps'
}

export interface SubmissionRow {
  id: string
  status: 'pending' | 'validated' | 'rejected' | 'discarded'
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
  // parseBody maps an empty 2xx body to undefined (WR-03) — same ?? [] guard
  // as every other list wrapper; a shape the client can't control must not
  // crash the render path.
  return (await parseBody<StatCatalogEntry[]>(res)) ?? []
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
// `active` was added in Phase 6 for the owner Remover/Reativar controls
// (granted for SELECT in 0005; consumed by setMemberActive flows, AUTH-04).

export async function fetchMe(session: NeoFootSession): Promise<MemberRow> {
  // RLS: returns only the caller's own row (member_select_own).
  const res = await restFetch(
    session,
    '/members?select=id,discord_handle,display_name,role,active,char_class,char_function&limit=1',
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
    '/members?select=id,discord_handle,display_name,role,active,char_class,char_function',
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
  // The id is URL-encoded (interpolation hardening, same standard as
  // fetchKeyStats): the signature accepts any string, and a crafted value
  // must not be able to inject PostgREST query operators.
  await restFetch(session, `/members?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
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

export async function fetchKeyStats(session: NeoFootSession, className: string): Promise<string[]> {
  // RLS: staff-only read (staff_select_key_stats, 0009) — a member JWT gets
  // [] from the policy filter, which is NOT an error.
  const res = await restFetch(
    session,
    `/class_key_stats?class_name=eq.${encodeURIComponent(className)}&select=stat_key`,
  )
  const rows = await parseBody<{ stat_key: string }[]>(res)
  return (rows ?? []).map((r) => r.stat_key)
}

export async function setKeyStat(
  session: NeoFootSession,
  className: string,
  statKey: string,
  enabled: boolean,
): Promise<number> {
  // SECURITY DEFINER RPC (0009): staff-only gate is INSIDE the function
  // (member_role claim + active flag) — 'forbidden' / 'key_stat_limit' /
  // 'unknown_class' raise server-side. Returns the class's current count.
  const res = await restFetch(session, '/rpc/set_key_stat', {
    method: 'POST',
    body: JSON.stringify({ p_class: className, p_stat_key: statKey, p_enabled: enabled }),
  })
  return parseBody<number>(res)
}

export interface ClassTop5Row {
  display_name: string
  char_function: 'tank' | 'dps'
  ovr: number | null
}

export async function fetchClassTop5(
  session: NeoFootSession,
  className: string,
): Promise<ClassTop5Row[]> {
  // SECURITY DEFINER RPC (0009): staff-only gate is INSIDE the function —
  // compute-on-read, so the preview reflects the current key-stat config.
  const res = await restFetch(session, '/rpc/class_top5', {
    method: 'POST',
    body: JSON.stringify({ p_class: className }),
  })
  return (await parseBody<ClassTop5Row[]>(res)) ?? []
}

export interface MyReportStat {
  stat_key: string
  label: string
  group_name: 'general' | 'quasi' | 'special'
  value_type: 'flat' | 'percentual'
  own_value: number | null
  class_average: number | null
  best: number | null
  points: number | null // null when data_sufficient=false or own_value=null
  data_sufficient: boolean // cohort n >= 3 (03-CONTEXT D-12)
}

export interface MyReport {
  char_class: string | null
  char_function: 'tank' | 'dps'
  stats: MyReportStat[] // always all 57 catalog entries, ordered group_name, label
  ovr: { value: number | null; data_sufficient: boolean }
}

export async function fetchMyReport(session: NeoFootSession): Promise<MyReport> {
  // SECURITY DEFINER RPC (0009): THE member contract. Identity comes from
  // the JWT only — zero parameters, empty JSON body. The response NEVER
  // carries key-stat identity (RNK-02); render it verbatim.
  const res = await restFetch(session, '/rpc/my_report', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  // parseBody maps an empty 2xx body to undefined (WR-03) — e.g. the RPC
  // returning NULL or a proxy 204. fetchMyReport is typed non-nullable and
  // feeds the render path directly, so a malformed shape must surface as
  // ApiError (enumeration-safe copy) instead of a crash at report.stats.
  const report = await parseBody<MyReport>(res)
  if (!report || !Array.isArray(report.stats)) {
    throw new ApiError(0, 'server', 'malformed my_report response')
  }
  return report
}

// ---------------------------------------------------------------------------
// Phase 6 surfaces (0011) — officer queue / transitions / role / active /
// promotion. All five are SECURITY DEFINER RPCs: the staff or member gate
// lives INSIDE the function (member_role claim + active flag), so the client
// adds NO enforcement — payloads are rendered verbatim by the UI plans
// (06-04/05/06) with guards as UX-only.
// ---------------------------------------------------------------------------

export interface QueueStat {
  stat_key: string
  label: string
  group_name: 'general' | 'quasi' | 'special'
  value_type: 'flat' | 'percentual'
  value: number
}

export interface OfficerQueueRow {
  submission_id: string
  submitted_at: string
  display_name: string
  discord_handle: string
  char_class: string | null
  char_function: 'tank' | 'dps'
  stats: QueueStat[] // all 57 catalog entries, ordered group_name, label
}

export async function fetchOfficerQueue(session: NeoFootSession): Promise<OfficerQueueRow[]> {
  // SECURITY DEFINER RPC (0011): staff-only gate INSIDE the function — a member
  // JWT raises 'forbidden' (HTTP 500). Queue = all pending submissions, newest
  // first; the 0010 one-pending rule caps rows at one per member.
  const res = await restFetch(session, '/rpc/officer_queue', { method: 'POST', body: JSON.stringify({}) })
  return (await parseBody<OfficerQueueRow[]>(res)) ?? []
}

export async function setSubmissionStatus(
  session: NeoFootSession,
  submissionId: string,
  status: 'validated' | 'rejected',
): Promise<number> {
  // SECURITY DEFINER RPC (0011): staff-only; scopes the UPDATE to status='pending'
  // and raises 'not_pending' when another officer already adjudicated the row
  // (two-officer race), 'invalid_status' for anything but validated/rejected.
  const res = await restFetch(session, '/rpc/set_submission_status', {
    method: 'POST',
    body: JSON.stringify({ p_submission: submissionId, p_status: status }),
  })
  return parseBody<number>(res)
}

export async function setMemberRole(
  session: NeoFootSession,
  memberId: string,
  role: 'member' | 'officer',
): Promise<void> {
  // SECURITY DEFINER RPC (0011): POST /rpc/set_member_role body
  // {p_member, p_role} — owner-only gate inside the RPC (AUTH-03); effective
  // at next login (D-10). No 'owner' value is ever sent — owner rows are
  // immutable server-side. Raises 'invalid_role' / 'forbidden' (HTTP 500).
  await restFetch(session, '/rpc/set_member_role', {
    method: 'POST',
    body: JSON.stringify({ p_member: memberId, p_role: role }),
  })
}

export async function setMemberActive(
  session: NeoFootSession,
  memberId: string,
  active: boolean,
): Promise<void> {
  // SECURITY DEFINER RPC (0011): POST /rpc/set_member_active body
  // {p_member, p_active} — staff gate + role-differentiated target rules
  // inside the RPC (AUTH-04/D-08); raises 'forbidden' on self-target,
  // owner-row target, or officer→officer target.
  await restFetch(session, '/rpc/set_member_active', {
    method: 'POST',
    body: JSON.stringify({ p_member: memberId, p_active: active }),
  })
}

export interface PromotionHighlight {
  stat_key: string
  label: string
  value_type: 'flat' | 'percentual'
  value: number
  points: number
}

export interface PromotionCardRow {
  display_name: string
  char_function: 'tank' | 'dps'
  ovr: number // floor-51 value; tier band derived client-side via tierForOvr
  highlights: PromotionHighlight[] // top 6 by points desc — CLOSED field list (RNK-02)
}

export interface PromotionSection {
  class_name: string
  cards: PromotionCardRow[] // top-5 by OVR; classes with insufficient data are OMITTED server-side (D-13)
}

export async function fetchPromotion(session: NeoFootSession): Promise<PromotionSection[]> {
  // SECURITY DEFINER RPC (0011): member-invocable (any active member) — the ONE
  // sanctioned view of top players' individual values (CMP-03 exception).
  // Response NEVER carries key-stat identity (RNK-02): highlights are top-6-BY-
  // POINTS over all 57 stats, fields exactly stat_key/label/value_type/value/points.
  const res = await restFetch(session, '/rpc/get_promotion', { method: 'POST', body: JSON.stringify({}) })
  return (await parseBody<PromotionSection[]>(res)) ?? []
}
