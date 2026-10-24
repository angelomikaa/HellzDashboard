// NeoFoot REST data layer (plan 02-01) — thin raw-fetch client on the proven
// 01-02 gateway contract. NO supabase-js: login already uses raw fetch and
// supabase-js session handling would fight our foreign (verify-pin) JWT.
//
// EVERY call sends BOTH headers — apikey (gateway auth) and
// Authorization: Bearer <session.access_token> (RLS reads the member/role
// claims from this JWT). Missing Authorization -> empty results (RLS sees no
// claims); missing apikey -> 401.
import {
  isValidSession,
  clearSession,
  type NeoFootSession,
} from '../features/auth/session'
import { computeDeviceFingerprintClient } from '../features/auth/session'
import type { SubmissionIdentity } from '../features/submit/identity'

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
  label_short: string // 3-letter pt-BR abbreviation (07.2 D-11, migration 0013)
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
  char_function: 'dps' | 'mdps' | 'suporte'
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
  // D-17: compute device fingerprint once per page load and send it on every
  // authenticated request so the server can enforce session-device binding.
  const deviceFp = await computeDeviceFingerprintClient()
  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
      ...init,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'X-Device-Fingerprint': deviceFp,
        ...init?.headers,
      },
    })
  } catch (err) {
    throw new ApiError(0, 'network', err instanceof Error ? err.message : 'network error')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // A device-mismatched session will keep failing — discard it client-side
    // so the user is bounced to login with the existing session-expired copy,
    // instead of looping on failed saves. The server is the real enforcer
    // (assert_device_bound, migration 0024).
    if (body.includes('device_mismatch')) {
      clearSession()
      throw new ApiError(401, 'unauthorized', 'device_mismatch')
    }
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
    '/stat_catalog?select=stat_key,label,label_short,group_name,value_type&order=stat_key',
  )
  // parseBody maps an empty 2xx body to undefined (WR-03) — same ?? [] guard
  // as every other list wrapper; a shape the client can't control must not
  // crash the render path.
  return (await parseBody<StatCatalogEntry[]>(res)) ?? []
}

/**
 * Session-less catalog read for the prospect application wizard (08-04,
 * WHIT-08): the SAME five public columns as fetchCatalog, but with the anon
 * bearer. Migration 0014 grants anon SELECT only on this label projection
 * (stat_key/label/label_short/group_name/value_type) — key-stat CONFIG lives
 * in class_key_stats and stays unreachable (T-08-29).
 */
export async function fetchPublicCatalog(): Promise<StatCatalogEntry[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    throw new ApiError(0, 'network', 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }
  let res: Response
  try {
    res = await fetch(
      `${supabaseUrl}/rest/v1/stat_catalog?select=stat_key,label,label_short,group_name,value_type&order=stat_key`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      },
    )
  } catch (err) {
    throw new ApiError(0, 'network', err instanceof Error ? err.message : 'network error')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const kind = res.status === 401 ? 'unauthorized' : 'server'
    throw new ApiError(res.status, kind, `HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
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

export interface MyIdentity {
  display_name: string
  char_id: string | null
  char_class: string | null
  char_function: 'dps' | 'mdps' | 'suporte'
}

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

export async function fetchMyIdentity(session: NeoFootSession): Promise<MyIdentity> {
  const res = await restFetch(session, '/rpc/my_identity', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  const identity = await parseBody<MyIdentity>(res)
  if (!identity || typeof identity.display_name !== 'string' || !('char_function' in identity)) {
    throw new ApiError(0, 'server', 'malformed my_identity response')
  }
  return identity
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
  // RLS: owner-only insert (staff_insert_classes, 0011) — structural changes
  // are owner territory (D-09); officers are refused server-side.
  await restFetch(session, '/classes', { method: 'POST', body: JSON.stringify({ class_name: className }) })
}

export async function createSubmission(
  session: NeoFootSession,
  stats: { stat_key: string; value: number }[],
  identity?: SubmissionIdentity,
): Promise<string> {
  // Atomic append-only RPC (INPT-04): member_id is derived from the JWT
  // server-side; unknown stat keys are rejected server-side. The optional
  // identity is stored ON the submission and promoted only at validation
  // (0014); old call sites keep compiling and send p_identity: null.
  const res = await restFetch(session, '/rpc/create_submission', {
    method: 'POST',
    body: JSON.stringify({ p_stats: stats, p_identity: identity ?? null }),
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

export async function fetchKeyStats(
  session: NeoFootSession,
  className: string,
  charFunction?: 'dps' | 'mdps' | 'suporte',
): Promise<string[]> {
  // RLS: staff-only read (staff_select_key_stats, 0009) — a member JWT gets
  // [] from the policy filter, which is NOT an error. Reads per
  // (class, char_function) when a function is supplied (Phase 9 KEYU ordered
  // set); single-arg className overload kept for backward-compat transition.
  let path = `/class_key_stats?class_name=eq.${encodeURIComponent(className)}&select=stat_key,selection_order&order=selection_order`
  if (charFunction) {
    path += `&char_function=eq.${charFunction}`
  }
  const res = await restFetch(session, path)
  const rows = await parseBody<{ stat_key: string }[]>(res)
  return (rows ?? []).map((r) => r.stat_key)
}

/**
 * Phase 9 (D-11): set_key_stat v2 — ONE ordered selection set per
 * (class, build-role): first 6 selected = keys, 7th+ = relevants.
 * p_enabled=true appends to the end of the ordered set; p_enabled=false
 * removes and, if the stat was a key, promotes the oldest relevant into
 * the vacated slot. Returns the class's current key-stat count (order ≤ 6).
 * Staff gate + advisory lock inside the RPC; errors: forbidden /
 * unknown_class / unknown_function. Replaces set_key_stat + set_relevant_stat.
 */
export async function setKeyStat(
  session: NeoFootSession,
  className: string,
  charFunction: 'dps' | 'mdps' | 'suporte',
  statKey: string,
  enabled: boolean,
): Promise<number> {
  // SECURITY DEFINER RPC (0018): staff-only gate is INSIDE the function
  // (member_role claim + active flag). 'forbidden' / 'unknown_class' /
  // 'unknown_function' raise server-side. Returns the class's current count.
  const res = await restFetch(session, '/rpc/set_key_stat_v2', {
    method: 'POST',
    body: JSON.stringify({
      p_class: className,
      p_function: charFunction,
      p_stat_key: statKey,
      p_enabled: enabled,
    }),
  })
  return parseBody<number>(res)
}

export interface ClassTop5Row {
  display_name: string
  char_function: 'dps' | 'mdps' | 'suporte'
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
  char_function: 'dps' | 'mdps' | 'suporte'
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
  // 08-01/0014 identity patch (all nullable for legacy rows without identity):
  // the submission's captured ID/nickname. char_class below is the 0014
  // coalesce(submission class, member class).
  char_class: string | null
  char_id: string | null
  nickname: string | null
  char_function: 'dps' | 'mdps' | 'suporte'
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
  stepUpToken?: string,
): Promise<void> {
  // SECURITY DEFINER RPC (0011, step-up enforcement repaired in 0017):
  // POST /rpc/set_member_role body {p_member, p_role} — owner-only gate inside
  // the RPC (AUTH-03); effective at next login (D-10). No 'owner' value is
  // ever sent — owner rows are immutable server-side. The RPC now requires the
  // single-use token from requestStepUp() in the X-Step-Up header and consumes
  // it (missing/stale/foreign token -> 'step_up_required'). Also raises
  // 'invalid_role' / 'invalid_member' / 'forbidden'.
  await restFetch(session, '/rpc/set_member_role', {
    method: 'POST',
    headers: stepUpToken ? { 'X-Step-Up': stepUpToken } : undefined,
    body: JSON.stringify({ p_member: memberId, p_role: role }),
  })
}

/**
 * Step-up re-PIN (D-14/D-15, repaired in 0017): re-authenticates the CALLER's
 * PIN and returns a short-lived, single-use, device-bound token for
 * setMemberRole(). The PIN is checked server-side with bcryptjs (the same
 * library verify-pin uses — the DB cannot read bcryptjs '$2b$' hashes); the
 * token row is written with the service role by the `step-up` Edge Function.
 * The PIN lives only in this request body: never stored, logged or put in a
 * URL (T-08-18).
 */
export async function requestStepUp(
  session: NeoFootSession,
  pin: string,
): Promise<string> {
  const { supabaseUrl, anonKey } = anonEnv()
  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/step-up`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pin }),
    })
  } catch (err) {
    throw new FunctionError(0, 'network', err instanceof Error ? err.message : 'network error')
  }

  const text = await res.text().catch(() => '')
  const parsed = parseJsonObject(text)
  if (!res.ok) {
    const code = typeof parsed?.error === 'string' ? parsed.error : 'server_error'
    const message = typeof parsed?.message === 'string' ? parsed.message : code
    throw new FunctionError(res.status, code, message, {
      attemptsRemaining: optionalNumber(parsed?.attempts_remaining),
      retryAfterSeconds: optionalNumber(parsed?.retry_after_seconds),
    })
  }
  const token = typeof parsed?.token === 'string' ? parsed.token : ''
  // A 2xx without a token is a contract breach, not a usable step-up.
  if (token === '') {
    throw new FunctionError(res.status, 'invalid_response', 'malformed step-up token')
  }
  return token
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
  label_short: string // D-11 3-letter pt-BR label (07.2-01 supersession, D-13)
  value_type: 'flat' | 'percentual'
  value: number
  points: number
}

export interface PromotionCardRow {
  display_name: string
  char_function: 'dps' | 'mdps' | 'suporte'
  ovr: number // floor-51 value; tier band derived client-side via tierForOvr
  // 07.2 D-13 supersession: highlights are the class's KEY STATS (same set as
  // the member's Painel card strip, ordered by label) — no longer top-6-by-
  // points. CLOSED field list {stat_key,label,label_short,value_type,value,
  // points} (RNK-02 re-baselined: key identity is the sanctioned 07.2 D-03
  // reveal; config data is never serialised).
  highlights: PromotionHighlight[]
  // 07.2-05 round 7 photo consistency (owner decision 3): the member's
  // card-photos STORAGE OBJECT PATH (bucket + key, server-composed from the
  // member id — never a public URL; the bucket is private and its RLS grants
  // ACTIVE members read, showcase visibility IS the feature). The client
  // fetches it as a BLOB (T-072-13 canvas-taint discipline — the same rule
  // as the Painel own-card) and falls back to the class portrait when the
  // object doesn't exist (no upload yet → 404). No key-stat/config data
  // rides this field.
  photo_path: string
}

export interface PromotionSection {
  class_name: string
  cards: PromotionCardRow[] // top-5 by OVR; classes with insufficient data are OMITTED server-side (D-13)
}

export async function fetchPromotion(session: NeoFootSession): Promise<PromotionSection[]> {
  // SECURITY DEFINER RPC (0011; 0013 D-13 supersession): member-invocable (any
  // active member) — the ONE sanctioned view of top players' individual values
  // (CMP-03 exception). Highlights are the class's KEY STATS per 07.2 D-13
  // (the sanctioned key reveal; RNK-02 re-baselined), fields exactly
  // stat_key/label/label_short/value_type/value/points — key-stat CONFIG
  // (weights/toggles) is never serialised (smoke-card.mjs probe 7d locks the census).
  const res = await restFetch(session, '/rpc/get_promotion', { method: 'POST', body: JSON.stringify({}) })
  return (await parseBody<PromotionSection[]>(res)) ?? []
}

// ---------------------------------------------------------------------------
// Phase 7.2 surfaces (0013) — member card payload / staff officials rank /
// relevant-tier governance / relevant-set read. my_card is member-invocable
// SECURITY DEFINER (gate inside the function); role_rank and set_relevant_stat
// are staff-only SECURITY DEFINER (gate inside the function); class_relevant_stats
// is a staff-only RLS read. The client adds NO enforcement — payloads are
// rendered verbatim by the 07.2-03/04 UI plans with guards as UX-only.
// Types below are CLOSED field lists pinning the 0013 payload censuses exactly
// (compile-time leak block, T-06-05/T-072-05 discipline): no index signatures,
// no optional config-shaped fields — key identity is the sanctioned D-03
// reveal, but key-stat CONFIG (weights/toggles/management data) has NO
// representation in any payload.
// ---------------------------------------------------------------------------

export interface CardKeyStat {
  stat_key: string
  label: string
  label_short: string
  value_type: 'flat' | 'percentual'
  own_value: number | null
  points: number | null
}

export interface MyCard {
  char_class: string | null
  char_function: 'dps' | 'mdps' | 'suporte'
  ovr: { value: number | null; data_sufficient: boolean }
  key_stats: CardKeyStat[]
  relevant_stat_keys: string[]
}

export interface RoleRankStat {
  stat_key: string
  label: string
  label_short: string
  value_type: 'flat' | 'percentual'
  value: number | null
  points: number | null
  class_average: number | null
}

export interface RoleRankRow {
  member_id: string
  display_name: string
  // 08-01/0014: display_name is the newest identity nickname and char_id the
  // newest identity ID (D-21/D-23). Nullable for members without identity yet.
  char_id: string | null
  char_class: string
  char_function: 'dps' | 'mdps' | 'suporte'
  ovr: number | null
  stats: RoleRankStat[]
}

export async function fetchMyCard(session: NeoFootSession): Promise<MyCard> {
  // SECURITY DEFINER RPC (0013): member-invocable — identity from the JWT only,
  // zero parameters, empty JSON body. Carries the SANCTIONED 07.2 D-03 key
  // reveal (which stats are key) plus the relevant identity for the D-07 foco
  // rule (zero-config census: weights/toggles/management data are never
  // serialised — T-072-05 closed type above is the compile-time half).
  const res = await restFetch(session, '/rpc/my_card', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  // parseBody maps an empty 2xx body to undefined (WR-03) — fetchMyReport
  // precedent: fetchMyCard is typed non-nullable and feeds the render path
  // directly, so a malformed shape must surface as ApiError (enumeration-safe
  // copy) instead of a crash at card.key_stats.
  const card = await parseBody<MyCard>(res)
  if (!card || !Array.isArray(card.key_stats)) {
    throw new ApiError(0, 'server', 'malformed my_card response')
  }
  return card
}

export async function fetchRoleRank(
  session: NeoFootSession,
  charFunction: 'dps' | 'mdps' | 'suporte',
  className?: string,
): Promise<RoleRankRow[]> {
  // SECURITY DEFINER RPC (0013): staff-only gate INSIDE the function (member_role
  // claim + active flag) — a member JWT raises 'forbidden' (HTTP 500); also
  // raises 'invalid_function' (whitelist, pinned before other checks) and
  // 'unknown_class'. D-18/D-20: per-stat value + points + class_average is the
  // sanctioned officials visibility expansion. Rows arrive SERVER-ORDERED
  // (ovr desc nulls last, display_name) — never re-sort client-side; filter
  // only (HighlightsPage discipline). Composite React keys use member_id
  // (display_name has no unique constraint).
  const res = await restFetch(session, '/rpc/role_rank', {
    method: 'POST',
    body: JSON.stringify({ p_function: charFunction, p_class: className ?? null }),
  })
  return (await parseBody<RoleRankRow[]>(res)) ?? []
}

export async function fetchKeyRelevantStats(
  session: NeoFootSession,
  className: string,
): Promise<string[]> {
  // RLS: staff-only read (staff_select_relevant_stats, 0013) — a member JWT
  // gets [] from the policy filter, which is NOT an error. LEGACY surface:
  // class_relevant_stats was never re-keyed per build role (0018 kept it
  // class-level for rollback safety), so there is NO char_function column —
  // never add a `char_function=eq.` filter here (PostgREST 400s). Phase 9
  // KEYU reads relevants from class_key_stats positions 7+ instead.
  const path = `/class_relevant_stats?class_name=eq.${encodeURIComponent(className)}&select=stat_key`
  const res = await restFetch(session, path)
  const rows = await parseBody<{ stat_key: string }[]>(res)
  return (rows ?? []).map((r) => r.stat_key)
}

// ---------------------------------------------------------------------------
// Phase 8 staff surfaces (08-05) — the staff operating layer built on
// screenshot — clipped into the photo-crop layer of their crest card.
// Supabase Storage (private bucket, RLS on storage.objects): a member can
// write ONLY their own path (top-level folder = the JWT member_id claim);
// every ACTIVE member can read (screenshots appear on showcase cards in
// Destaques — that visibility IS the feature). Closed wrappers only — the
// UI never builds storage URLs itself.
//
// IMPORTANT (T-072-13 canvas-taint): fetchCardPhoto returns a BLOB the UI
// turns into an object URL — the member screenshot NEVER crosses into the
// app as a cross-origin URL, so the JPEG export's toBlob can never be
// tainted. No key-stat/config data touches this surface (identity comes
// from the JWT server-side; the path is derived from session.member_id).
// ---------------------------------------------------------------------------

const CARD_PHOTO_BUCKET = 'card-photos'
const CARD_PHOTO_OBJECT = 'card.jpg' // inside the member's own folder

function cardPhotoPath(session: NeoFootSession): string {
  return `${CARD_PHOTO_BUCKET}/${encodeURIComponent(session.member_id)}/${CARD_PHOTO_OBJECT}`
}

/** Storage fetch: same two gateway headers as restFetch, but the Storage
 *  API path and pass-through body/content-type (uploads are raw image
 *  bytes, not JSON). */
async function storageFetch(session: NeoFootSession, path: string, init?: RequestInit): Promise<Response> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    throw new ApiError(0, 'network', 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }
  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/storage/v1/object/${path}`, {
      ...init,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        ...init?.headers,
      },
    })
  } catch (err) {
    throw new ApiError(0, 'network', err instanceof Error ? err.message : 'network error')
  }
  return res
}

/** The member's own character screenshot, or null when none uploaded yet
 *  (the 404 is the designed no-photo state — never an error). The blob is
 *  same-origin-safe material for an object URL (canvas export). */
export async function fetchCardPhoto(session: NeoFootSession): Promise<Blob | null> {
  const res = await storageFetch(session, cardPhotoPath(session))
  if (res.status === 404) return null
  if (!res.ok) {
    const kind = res.status === 401 ? 'unauthorized' : 'server'
    throw new ApiError(res.status, kind, `HTTP ${res.status} fetching card photo`)
  }
  return await res.blob()
}

/** Upload/replace the member's screenshot (client-compressed JPEG — see
 *  CardPhotoUpload). x-upsert makes re-uploads replace the object; RLS
 *  refuses any path outside the member's own folder server-side. */
export async function uploadCardPhoto(session: NeoFootSession, image: Blob): Promise<void> {
  const res = await storageFetch(session, cardPhotoPath(session), {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: image,
  })
  if (!res.ok) {
    const kind = res.status === 401 ? 'unauthorized' : 'server'
    throw new ApiError(res.status, kind, `HTTP ${res.status} uploading card photo`)
  }
}

/** Remove the member's screenshot (a 404 — nothing stored — is success). */
export async function deleteCardPhoto(session: NeoFootSession): Promise<void> {
  const res = await storageFetch(session, cardPhotoPath(session), { method: 'DELETE' })
  if (res.ok || res.status === 404) return
  const kind = res.status === 401 ? 'unauthorized' : 'server'
  throw new ApiError(res.status, kind, `HTTP ${res.status} removing card photo`)
}

/** ANOTHER member's card photo, by the STORAGE PATH the get_promotion RPC
 *  composes (07.2-05 round 7 photo consistency). Same blob discipline as
 *  fetchCardPhoto (T-072-13): the blob becomes an object URL in the UI, so
 *  the canvas export can never be tainted. The bucket RLS grants ACTIVE
 *  members read (showcase visibility IS the feature — card-photos-storage
 *  seed); a 404 is the designed no-photo state. ANY failure resolves null —
 *  showcase cards degrade to the class portrait, never break the page.
 *  Defense in depth: the path arrives server-composed from the SECURITY
 *  DEFINER RPC, but only bucket-internal single-segment keys pass through —
 *  anything else (foreign bucket, traversal, query junk) resolves null. */
export async function fetchCardPhotoByPath(
  session: NeoFootSession,
  path: string,
): Promise<Blob | null> {
  if (
    !path.startsWith('card-photos/') ||
    path.includes('..') ||
    path.includes('?') ||
    path.includes('#') ||
    path.includes('//')
  ) {
    return null
  }
  try {
    const res = await storageFetch(session, path)
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Phase 8 (08-03) — the unauthenticated Edge/RPC surface.
//
// These are the ONLY pre-session data paths. Both headers ride every call —
// apikey (gateway auth) and Authorization: Bearer <anon> (no member JWT yet).
// The PIN, confirmation and proof image live only in component state and this
// request body: they are never persisted, logged or put in a URL (T-08-18).
// FunctionError carries the server's machine token plus lockout counters so
// pages render pt-BR copy without parsing message strings. Nothing here mints
// data access: setup-pin returns only the standard session shape, and a
// request stays staff-gated (T-08-20).
// ---------------------------------------------------------------------------

/** 'registration' (0020): a first-access print with no registry match, approved
 *  by an officer without a PIN so the player can set it on the next attempt. */
export type RequestType = 'member' | 'prospect' | 'registration'
export type RequestState = 'pending' | 'approved' | 'rejected' | 'superseded'

export interface FunctionErrorExtras {
  attemptsRemaining?: number
  retryAfterSeconds?: number
}

export class FunctionError extends Error {
  status: number
  code: string
  attemptsRemaining?: number
  retryAfterSeconds?: number

  constructor(status: number, code = 'network', message = code, extras?: FunctionErrorExtras) {
    super(message)
    this.name = 'FunctionError'
    this.status = status
    this.code = code
    this.attemptsRemaining = extras?.attemptsRemaining
    this.retryAfterSeconds = extras?.retryAfterSeconds
  }
}

export interface SetupPinInput {
  /** Character nickname read from the print — the login key since 0020. */
  nickname: string
  pin: string
  confirm_pin: string
  char_id: string
  char_class: string
  proof_data_url: string
}

/** first-access lookup answer (0020). The page renders one state per status. */
export type FirstAccessStatus =
  | 'ready'
  | 'pin_set'
  | 'pending'
  | 'unknown'
  | 'identity_mismatch'
  | 'ambiguous_identity'
  /** The typed Discord handle already belongs to a claimed account. */
  | 'handle_claimed'
  /** The typed handle exists (no PIN yet) but the print nickname does not match. */
  | 'handle_registered'

export interface FirstAccessLookupInput {
  nickname: string
  char_id: string
  /** Discord handle — only used to find a pending registration for this person. */
  discord_handle?: string
}

export interface FirstAccessRequestInput {
  discord_handle: string
  char_id: string
  nickname: string
  char_class: string
  proof_data_url: string
}

export interface RequestAccessInput {
  discord_handle: string
  /** Required for `member`; omitted for `prospect` (PIN is chosen at first
   *  access after approval — owner decision 2026-10-23). */
  pin?: string
  confirm_pin?: string
  request_type: RequestType
  char_id: string
  nickname: string
  char_class: string
  char_function: 'dps' | 'mdps' | 'suporte'
  proof_data_url: string
  stats?: { stat_key: string; value: number }[]
  previous_pin?: string
}

export interface RequestStatus {
  status: RequestState
  request_type: RequestType
  created_at: string
  decided_at: string | null
}

const REQUEST_STATES: readonly RequestState[] = ['pending', 'approved', 'rejected', 'superseded']
const REQUEST_TYPES: readonly RequestType[] = ['member', 'prospect', 'registration']

/** Env for the anon surface: same project URL/anon key as REST. */
function anonEnv(): { supabaseUrl: string; anonKey: string } {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    throw new FunctionError(
      0,
      'network',
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY',
    )
  }
  return { supabaseUrl, anonKey }
}

/** JSON object or null (empty body, JSON null, arrays and junk all -> null). */
function parseJsonObject(text: string): Record<string, unknown> | null {
  if (text.trim() === '') return null
  try {
    const value = JSON.parse(text) as unknown
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * POST to /functions/v1/<fn> with the anon bearer (never a session).
 * Non-2xx -> FunctionError with the server's `error` token; a 2xx body that
 * is not a JSON object is `invalid_response` (shape drift must not reach the
 * render path).
 */
async function edgeFetch<T>(
  fn: 'setup-pin' | 'request-access' | 'verify-pin' | 'first-access',
  body: unknown,
): Promise<T> {
  const { supabaseUrl, anonKey } = anonEnv()
  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new FunctionError(0, 'network', err instanceof Error ? err.message : 'network error')
  }

  const text = await res.text().catch(() => '')
  const parsed = parseJsonObject(text)
  if (!res.ok) {
    const code = typeof parsed?.error === 'string' ? parsed.error : 'server_error'
    const message = typeof parsed?.message === 'string' ? parsed.message : code
    throw new FunctionError(res.status, code, message, {
      attemptsRemaining: optionalNumber(parsed?.attempts_remaining),
      retryAfterSeconds: optionalNumber(parsed?.retry_after_seconds),
    })
  }
  if (parsed === null) {
    throw new FunctionError(res.status, 'invalid_response', 'empty or non-JSON response')
  }
  return parsed as T
}

/**
 * First-access claim: validates the print identity + PIN server-side and
 * returns the standard session. The caller persists it with saveSession.
 */
export async function setupPin(input: SetupPinInput): Promise<NeoFootSession> {
  const body = await edgeFetch<{ session?: unknown }>('setup-pin', input)
  // A 2xx without a well-formed session is a contract breach, not a login.
  if (!isValidSession(body.session)) {
    throw new FunctionError(200, 'invalid_response', 'malformed session')
  }
  return body.session
}

const FIRST_ACCESS_STATUSES: readonly FirstAccessStatus[] = [
  'ready',
  'pin_set',
  'pending',
  'unknown',
  'identity_mismatch',
  'ambiguous_identity',
  'handle_claimed',
  'handle_registered',
]

/**
 * Ask the registry what the print's nickname resolves to (0020). God-mode:
 * this call mints nothing and stores nothing — it only decides whether the
 * page opens the PIN setter, the login hint or the approval request.
 */
export async function firstAccessLookup(
  input: FirstAccessLookupInput,
): Promise<FirstAccessStatus> {
  const body = await edgeFetch<{ status?: unknown }>('first-access', {
    action: 'lookup',
    ...input,
  })
  if (
    typeof body.status !== 'string' ||
    !FIRST_ACCESS_STATUSES.includes(body.status as FirstAccessStatus)
  ) {
    throw new FunctionError(200, 'invalid_response', 'malformed first-access status')
  }
  return body.status as FirstAccessStatus
}

/**
 * Handle-only probe for the request-access "Identificação" step (0020). It
 * answers whether the typed handle already owns an account and, decisively,
 * whether that account already has a PIN: a claimed account must never reach a
 * PIN form again (owner rule 2026-10-23) — only staff can reset it.
 */
export type FirstAccessIdentifyStatus = 'claimed' | 'unclaimed' | 'none'

export async function firstAccessIdentify(handle: string): Promise<FirstAccessIdentifyStatus> {
  const body = await edgeFetch<{ status?: unknown }>('first-access', {
    action: 'identify',
    discord_handle: handle,
  })
  const status = body.status
  if (status !== 'claimed' && status !== 'unclaimed' && status !== 'none') {
    throw new FunctionError(200, 'invalid_response', 'malformed identify status')
  }
  return status
}

/**
 * Queue a 'registration' request (handle + print identity + proof). The officer
 * approval registers the character WITHOUT a PIN, so the player retries the
 * first-access flow and sets it there.
 */
export async function requestFirstAccess(
  input: FirstAccessRequestInput,
): Promise<{ request_id: string; status: 'pending'; duplicate: boolean }> {
  const body = await edgeFetch<{
    request_id?: unknown
    status?: unknown
    duplicate?: unknown
  }>('first-access', { action: 'request', ...input })
  if (typeof body.request_id !== 'string' || body.request_id.length === 0) {
    throw new FunctionError(200, 'invalid_response', 'malformed request_id')
  }
  if (body.status !== 'pending') {
    throw new FunctionError(200, 'invalid_response', 'unexpected request status')
  }
  return {
    request_id: body.request_id,
    status: 'pending',
    duplicate: body.duplicate === true,
  }
}

/**
 * Submit a membership/relink request. Returns the pending request id only —
 * no session, no PIN echo, no member data.
 */
export async function requestAccess(
  input: RequestAccessInput,
): Promise<{ request_id: string; status: 'pending' }> {
  const body = await edgeFetch<{ request_id?: unknown; status?: unknown }>(
    'request-access',
    input,
  )
  if (typeof body.request_id !== 'string' || body.request_id.length === 0) {
    throw new FunctionError(200, 'invalid_response', 'malformed request_id')
  }
  if (body.status !== 'pending') {
    throw new FunctionError(200, 'invalid_response', 'unexpected request status')
  }
  return { request_id: body.request_id, status: 'pending' }
}

/** Narrow the four-key status payload; anything else is a contract breach. */
function asRequestStatus(value: unknown): RequestStatus {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new FunctionError(200, 'invalid_response', 'malformed request_status')
  }
  const row = value as Record<string, unknown>
  const status = row.status
  const requestType = row.request_type
  const createdAt = row.created_at
  const decidedAt = row.decided_at
  if (
    typeof status !== 'string' ||
    !REQUEST_STATES.includes(status as RequestState) ||
    typeof requestType !== 'string' ||
    !REQUEST_TYPES.includes(requestType as RequestType) ||
    typeof createdAt !== 'string' ||
    createdAt.length === 0 ||
    (decidedAt !== null && typeof decidedAt !== 'string')
  ) {
    throw new FunctionError(200, 'invalid_response', 'malformed request_status')
  }
  // Build a closed four-key object: extra columns can never reach the UI
  // (T-08-21 — status lookup is identity-free by contract).
  return {
    status: status as RequestState,
    request_type: requestType as RequestType,
    created_at: createdAt,
    decided_at: decidedAt as string | null,
  }
}

/**
 * Handle-only status lookup (anon RPC). `null` means no request exists.
 * Returns exactly status/type/created_at/decided_at — never identity fields.
 */
export async function fetchRequestStatus(discordHandle: string): Promise<RequestStatus | null> {
  const { supabaseUrl, anonKey } = anonEnv()
  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/rest/v1/rpc/request_status`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_handle: discordHandle }),
    })
  } catch (err) {
    throw new FunctionError(0, 'network', err instanceof Error ? err.message : 'network error')
  }

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    const parsed = parseJsonObject(text)
    const code = typeof parsed?.error === 'string' ? parsed.error : 'server_error'
    const message = typeof parsed?.message === 'string' ? parsed.message : code
    throw new FunctionError(res.status, code, message, {
      retryAfterSeconds: optionalNumber(parsed?.retry_after_seconds),
    })
  }
  // PostgREST returns an empty body or JSON null when no request exists.
  if (text.trim() === '' || text.trim() === 'null') return null
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new FunctionError(res.status, 'invalid_response', 'malformed request_status')
  }
  if (payload === null) return null
  return asRequestStatus(payload)
}


// ---------------------------------------------------------------------------
// Phase 8 staff surfaces (08-05) — the staff operating layer built on
// migration 0014. Every wrapper is an RPC-only call: the staff/owner gate lives
// INSIDE the SECURITY DEFINER function (member_role in officer|owner AND the
// caller's active row), so this client adds NO enforcement — the UI gating is
// UX-only (house pattern). PINs never cross this boundary: staff_members
// serialises `pin_set` (pin_hash is not null) and NO wrapper selects or sends a
// hash (T-08-31/T-08-32). Payload types are the CLOSED 0014 census, field for
// field (see supabase/migrations/0014_whitelist_requests_identity.sql §6).
// ---------------------------------------------------------------------------

export interface StaffIdentitySnapshot {
  id: number
  created_at: string
  char_id: string
  nickname: string
  char_class: string | null
  char_function: 'dps' | 'mdps' | 'suporte' | null
  source: 'submission' | 'correction' | 'claim' | 'request'
}

/** staff_members() row: MemberRow + the D-18 PIN/claim state and the newest
 *  identity record. `identity` is null until the member's first identity
 *  (claim, validated submission, request approval or staff correction). */
export interface StaffMember extends MemberRow {
  char_id: string | null
  pin_set: boolean
  claimed_at: string | null
  has_pending_proof: boolean
  identity: StaffIdentitySnapshot | null
}

export interface IdentityQueueRow {
  proof_id: string
  member_id: string
  discord_handle: string
  display_name: string
  char_id: string
  nickname: string
  char_class: string | null
  proof_path: string
  created_at: string
}

export interface IdentityHistoryRow {
  id: number
  created_at: string
  char_id: string
  nickname: string
  char_class: string | null
  char_function: 'dps' | 'mdps' | 'suporte' | null
  source: 'submission' | 'correction' | 'claim' | 'request'
  created_by: string | null
}

export interface StaffRequestStat {
  stat_key: string
  label: string
  label_short: string
  value_type: 'flat' | 'percentual'
  group_name: 'general' | 'quasi' | 'special'
  value: number | null // null when the applicant did not provide the stat
}

/** staff_requests() row (D-14): pending application + server-computed OVR.
 *  `ovr`/`data_sufficient` come from the live class+function cohort; the
 *  applicant's own stats never join it. */
export interface StaffRequestRow {
  request_id: string
  discord_handle: string
  request_type: 'member' | 'prospect' | 'registration'
  char_id: string
  nickname: string
  char_class: string
  char_function: 'dps' | 'mdps' | 'suporte'
  proof_path: string
  created_at: string
  member_id: string | null
  ovr: number | null
  data_sufficient: boolean
  stats: StaffRequestStat[]
}

/** A jsonb-array RPC result must be an array; anything else is a broken
 *  deploy, surfaced as ApiError instead of a crash at `.map` (fetchMyReport
 *  precedent). */
function requireArray<T>(value: unknown, rpc: string): T[] {
  if (!Array.isArray(value)) {
    throw new ApiError(0, 'server', `malformed ${rpc} response`)
  }
  return value as T[]
}

/** A single-uuid RPC result must be a non-empty string. */
function requireUuid(value: unknown, rpc: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new ApiError(0, 'server', `malformed ${rpc} response`)
  }
  return value
}

/** Staff roster (WHIT-05/D-18/D-22). RPC gate: staff + active. Ordered by
 *  display_name server-side; the roster carries pin_set/claimed_at/char_id,
 *  has_pending_proof and the newest identity — NEVER pin_hash. */
export async function fetchStaffMembers(session: NeoFootSession): Promise<StaffMember[]> {
  const res = await restFetch(session, '/rpc/staff_members', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return requireArray<StaffMember>(await parseBody<unknown>(res), 'staff_members')
}

/** Handle-only member creation (WHIT-01/06/07). RPC gate: staff + active;
 *  exceptions already_member/dummy_handle/invalid_handle/invalid_display_name.
 *  An inactive handle is reactivated in place. Returns the member id. */
export async function addMember(
  session: NeoFootSession,
  handle: string,
  displayName: string,
): Promise<string> {
  const res = await restFetch(session, '/rpc/add_member', {
    method: 'POST',
    body: JSON.stringify({ p_handle: handle, p_display_name: displayName }),
  })
  return requireUuid(await parseBody<unknown>(res), 'add_member')
}

/** OWNER-only PIN reset (WHIT-06, D-16/D-17): nulls the claim + lockout rows
 *  so the member re-claims via Primeiro acesso. RPC gate: owner +
 *  is_active_owner(); owner targets raise forbidden. No PIN ever crosses here. */
export async function resetMemberPin(session: NeoFootSession, memberId: string): Promise<void> {
  await restFetch(session, '/rpc/reset_member_pin', {
    method: 'POST',
    body: JSON.stringify({ p_member: memberId }),
  })
}

/** Pending identity proofs for the Identidade block (D-05/IDEN-03). Newest
 *  first; proof_path is the private-bucket object key. */
export async function fetchIdentityQueue(session: NeoFootSession): Promise<IdentityQueueRow[]> {
  const res = await restFetch(session, '/rpc/staff_identity_queue', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return requireArray<IdentityQueueRow>(await parseBody<unknown>(res), 'staff_identity_queue')
}

/** Confirmar / Não confere (D-05/D-15). Confirming clears the pending state;
 *  rejecting also deactivates the member and clears the claim. Either decision
 *  clears storage_path server-side, so the caller purges the object. */
export async function reviewIdentity(
  session: NeoFootSession,
  proofId: string,
  confirm: boolean,
): Promise<void> {
  await restFetch(session, '/rpc/review_identity', {
    method: 'POST',
    body: JSON.stringify({ p_proof: proofId, p_confirm: confirm }),
  })
}

/** Pending membership applications (WHIT-09, D-14) with the server-computed
 *  applicant OVR and the full stat payload. */
export async function fetchStaffRequests(session: NeoFootSession): Promise<StaffRequestRow[]> {
  const res = await restFetch(session, '/rpc/staff_requests', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return requireArray<StaffRequestRow>(await parseBody<unknown>(res), 'staff_requests')
}

/** Approve a pending request (WHIT-09/10, D-09). p_function is the
 *  officer-confirmed build role (dps|mdps|suporte) — the ONLY role-assignment
 *  point for self-requesters. Prospect stats become the first validated
 *  submission. Returns the member id. */
export async function approveRequest(
  session: NeoFootSession,
  requestId: string,
  charFunction: 'dps' | 'mdps' | 'suporte',
): Promise<string> {
  const res = await restFetch(session, '/rpc/approve_request', {
    method: 'POST',
    body: JSON.stringify({ p_request: requestId, p_function: charFunction }),
  })
  return requireUuid(await parseBody<unknown>(res), 'approve_request')
}

/** Reject a pending request (WHIT-10, D-10). Pending-only; records the
 *  decision and clears proof_path so the caller purges the image. No reason is
 *  stored or returned. */
export async function rejectRequest(session: NeoFootSession, requestId: string): Promise<void> {
  await restFetch(session, '/rpc/reject_request', {
    method: 'POST',
    body: JSON.stringify({ p_request: requestId }),
  })
}

/** Staff identity correction (IDEN-03, D-21/D-22): APPENDS a history row and
 *  updates the member pointers (char_function is staff-only, D-20). */
export async function correctIdentity(
  session: NeoFootSession,
  memberId: string,
  identity: {
    char_id: string
    nickname: string
    char_class: string
    char_function: 'dps' | 'mdps' | 'suporte'
  },
): Promise<void> {
  await restFetch(session, '/rpc/correct_identity', {
    method: 'POST',
    body: JSON.stringify({
      p_member: memberId,
      p_char_id: identity.char_id,
      p_nickname: identity.nickname,
      p_char_class: identity.char_class,
      p_char_function: identity.char_function,
    }),
  })
}

/** Append-only identity history, newest first (D-22). */
export async function fetchIdentityHistory(
  session: NeoFootSession,
  memberId: string,
): Promise<IdentityHistoryRow[]> {
  const res = await restFetch(session, '/rpc/staff_identity_history', {
    method: 'POST',
    body: JSON.stringify({ p_member: memberId }),
  })
  return requireArray<IdentityHistoryRow>(
    await parseBody<unknown>(res),
    'staff_identity_history',
  )
}

// --- identity proof storage (D-05/D-15) ------------------------------------
// Private `identity-proofs` bucket (0014 storage seed): staff-only SELECT and
// DELETE on storage.objects; no client INSERT/UPDATE (Edge Functions upload
// with the service role). The stored proof_path is the bucket-relative object
// key (`claims/<member_id>/<uuid>.jpg` | `requests/pending/<uuid>.jpg`).

const IDENTITY_PROOF_BUCKET = 'identity-proofs'

/** Bucket-relative object key, or null for anything that is not a plain
 *  bucket-internal key (defense in depth: foreign bucket, traversal, query
 *  junk and empty values never reach a URL). */
function proofStorageKey(path: string): string | null {
  const key = path.trim()
  if (key === '' || key.startsWith('/')) return null
  if (key.includes('..') || key.includes('?') || key.includes('#') || key.includes('//')) {
    return null
  }
  return key
}

/**
 * Authenticated object URL for one proof (private bucket download route).
 * NOTE: an <img> tag cannot send the gateway/apikey/Authorization headers, so
 * the review panels fetch the bytes with fetchIdentityProof below (blob ->
 * object URL) instead of pointing src at this string.
 */
export function identityProofUrl(_session: NeoFootSession, path: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  if (!supabaseUrl) {
    throw new ApiError(0, 'network', 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }
  const key = proofStorageKey(path)
  if (key === null) return ''
  return `${supabaseUrl}/storage/v1/object/authenticated/${IDENTITY_PROOF_BUCKET}/${key}`
}

/**
 * Proof bytes for the staff preview (staff-only object route, T-08-33). Any
 * failure resolves null: the card degrades to the claimed-fields text instead
 * of breaking the queue. Blob discipline matches fetchCardPhotoByPath.
 */
export async function fetchIdentityProof(
  session: NeoFootSession,
  path: string,
): Promise<Blob | null> {
  const key = proofStorageKey(path)
  if (key === null) return null
  try {
    const res = await storageFetch(session, `authenticated/${IDENTITY_PROOF_BUCKET}/${key}`)
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}

/**
 * Best-effort proof purge after a decision (D-15). The decision RPC already
 * cleared proof_path server-side; this removes the object itself. A 404 (gone
 * already) is success; every other failure throws so callers can swallow it.
 * DELETE targets the plain object route (`/object/<bucket>/<key>`) — the
 * `/authenticated` prefix is download-only and would 404 without deleting.
 */
export async function deleteIdentityProof(
  session: NeoFootSession,
  path: string,
): Promise<void> {
  const key = proofStorageKey(path)
  if (key === null) return
  const res = await storageFetch(session, `${IDENTITY_PROOF_BUCKET}/${key}`, { method: 'DELETE' })
  if (res.ok || res.status === 404) return
  const kind = res.status === 401 ? 'unauthorized' : 'server'
  throw new ApiError(res.status, kind, `HTTP ${res.status} removing identity proof`)
}
