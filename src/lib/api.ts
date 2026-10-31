// NeoFoot REST data layer (plan 02-01) — thin raw-fetch client on the proven
// 01-02 gateway contract. NO supabase-js: login already uses raw fetch and
// supabase-js session handling would fight our foreign (verify-pin) JWT.
//
// EVERY call sends BOTH headers — apikey (gateway auth) and
// Authorization: Bearer <session.access_token> (RLS reads the member/role
// claims from this JWT). Missing Authorization -> empty results (RLS sees no
// claims); missing apikey -> 401.
import {
  invalidateSession,
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
    // A device-mismatched session will keep failing — invalidate it client-side
    // so the user lands back on the landing page instead of looping on failed
    // saves. The server is the real enforcer (assert_device_bound, migration 0041).
    if (body.includes('device_mismatch')) {
      // WR-06: drop storage AND the live session (RequireAuth's state), so the
      // user actually lands back on the landing/login screen instead of a dead
      // authenticated shell where every call keeps failing.
      invalidateSession()
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

export interface MyIdentity {
  display_name: string
  char_id: string | null
  char_class: string | null
  char_function: 'dps' | 'mdps' | 'suporte'
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

/**
 * Anti-cheat OCR audit entry (migration 0046). `source` says whether the value
 * the OCR printed was submitted as-is or edited by the player afterwards;
 * `ocr_value` is what the read printed and `final_value` what was submitted.
 * Catalog final values are re-derived server-side from p_stats.
 */
export interface SubmissionProvenanceEntry {
  input_key: string
  source: 'ocr' | 'ocr_edited'
  ocr_value: number
  final_value: number
}

export async function createSubmission(
  session: NeoFootSession,
  stats: { stat_key: string; value: number }[],
  identity?: SubmissionIdentity,
  provenance?: SubmissionProvenanceEntry[],
): Promise<string> {
  // Atomic append-only RPC (INPT-04): member_id is derived from the JWT
  // server-side; unknown stat keys are rejected server-side. The optional
  // identity is stored ON the submission and promoted only at validation
  // (0014); optional provenance is the 0046 anti-cheat OCR audit trail. Old
  // call sites keep compiling and send nulls. Deploy migration 0046 BEFORE
  // this bundle: the old 2-arg RPC cannot resolve the p_provenance argument.
  const res = await restFetch(session, '/rpc/create_submission', {
    method: 'POST',
    body: JSON.stringify({
      p_stats: stats,
      p_identity: identity ?? null,
      p_provenance: provenance ?? null,
    }),
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
  last_validated_at: string | null // Phase 9 migration 0018: max(submitted_at) over own validated submissions
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

/** One flagged defense value (0046 ratio; 0049 adds the robust sigma). */
export interface AntiCheatDefenseSpike {
  stat_key: string
  label: string
  value_type: 'flat' | 'percentual'
  value: number
  baseline: number
  ratio: number
  sample_size: number
  /** 0049: cohort median/MAD/sigma (present when n >= 5). */
  median?: number | null
  mad?: number | null
  z?: number | null
  reason?: 'ratio' | 'sigma' | 'both' | null
}

/**
 * 0049: one flat/percent curve verdict for a pending submission.
 * `base = flat / (1 + pct/100)`; the cohort median base defines the expected
 * flat for the submitted pct. `reason = 'impositio'` means the observed
 * percent is a high outlier AND removing the +35%/+35 p.p. buff puts the base
 * back on the curve.
 */
export interface AntiCheatCurveDeviation {
  available: boolean
  flagged: boolean
  reason: 'impositio' | 'curve' | null
  flat_stat: string
  pct_stat: string
  flat_label: string | null
  pct_label: string | null
  flat_value_type: 'flat' | 'percentual' | null
  pct_value_type: 'flat' | 'percentual' | null
  flat_value: number | null
  pct_value: number | null
  base_value?: number | null
  median_base?: number | null
  median_pct?: number | null
  mad_base?: number | null
  mad_pct?: number | null
  z_base?: number | null
  z_pct?: number | null
  expected_flat?: number | null
  curve_deviation_pct?: number | null
  base_debuff?: number | null
  z_debuff?: number | null
  sample_size: number
}

/** One input the OCR read filled and the player changed afterwards (0046). */
export interface AntiCheatOcrOverride {
  input_key: string
  label: string
  value_type: 'flat' | 'percentual'
  source: 'ocr' | 'ocr_edited'
  ocr_value: number | null
  final_value: number | null
  delta_pct: number | null
}

/** OVR before the pending submission vs OVR if it is validated (0046). */
export interface AntiCheatOvrSwing {
  previous: number | null
  projected: number | null
  delta: number | null
  class_changed: boolean
  function_changed: boolean
}

export interface AntiCheatFlags {
  flagged: boolean
  defense_spikes: AntiCheatDefenseSpike[]
  /** 0049: PATK/MATK curve verdicts (always two entries; `available` says whether n >= 5). */
  curve_deviations?: AntiCheatCurveDeviation[]
  ocr_overrides: AntiCheatOcrOverride[]
  ocr_filled_count: number
  ocr_edited_count: number
  ovr_swing: AntiCheatOvrSwing
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
  stats: QueueStat[] // all catalog entries, ordered group_name, label
  // 0046 anti-cheat review flags. Optional so an in-flight bundle keeps
  // rendering against the previous server during the deploy window.
  anti_cheat?: AntiCheatFlags | null
}

/** One stats-cohort curve baseline used by the pre-submit warning (0046/0050). */
export interface DefenseBaseline {
  stat_key: string
  /** Kept for backward compatibility; the warning uses the median/MAD sigma. */
  average: number | null
  median: number | null
  mad: number | null
  sample_size: number
}

export async function fetchOfficerQueue(session: NeoFootSession): Promise<OfficerQueueRow[]> {
  // SECURITY DEFINER RPC (0011): staff-only gate INSIDE the function — a member
  // JWT raises 'forbidden' (HTTP 500). Queue = all pending submissions, newest
  // first; the 0010 one-pending rule caps rows at one per member. 0046 adds
  // the additive anti_cheat object.
  const res = await restFetch(session, '/rpc/officer_queue', { method: 'POST', body: JSON.stringify({}) })
  return (await parseBody<OfficerQueueRow[]>(res)) ?? []
}

/**
 * Anti-cheat pre-submit baselines (0046): aggregates-only averages for the
 * four defense stats over the caller's own class+build-role cohort. Used by
 * the submit wizard to warn BEFORE sending; the server re-computes the
 * authoritative flag on the pending submission. A failure here must never
 * block submission — callers treat it as "no baselines".
 */
export async function fetchDefenseBaselines(session: NeoFootSession): Promise<DefenseBaseline[]> {
  const res = await restFetch(session, '/rpc/defense_cohort_baselines', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return (await parseBody<DefenseBaseline[]>(res)) ?? []
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

// --- Round 9 (owner 2026-10-25): the Validações tab badge counts all THREE
//     pending queues without dragging their payloads. 0031 added `requests`
//     after the owner reported requests never lit the badge. ---

export interface PendingValidationCount {
  submissions: number
  identity_proofs: number
  requests: number
}

/** Three integers from pending_validation_count (0031). Any failure resolves
 *  null — a member session raises 'forbidden' (the badge hides, never
 *  errors), and a network hiccup keeps the last known state instead of
 *  blanking the badge. Server gate: officer/owner + active (never UI-only). */
export async function fetchPendingValidationCount(
  session: NeoFootSession,
): Promise<PendingValidationCount | null> {
  try {
    const res = await restFetch(session, '/rpc/pending_validation_count', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const body = await parseBody<PendingValidationCount>(res)
    if (
      body === null ||
      typeof body.submissions !== 'number' ||
      typeof body.identity_proofs !== 'number' ||
      typeof body.requests !== 'number'
    ) {
      return null
    }
    return {
      submissions: body.submissions,
      identity_proofs: body.identity_proofs,
      requests: body.requests,
    }
  } catch {
    return null
  }
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
  // The raw own_value is CREDENTIAL-GATED (owner 2026-10-30): the server only
  // serialises it for an authenticated active member. Anonymous callers get
  // null and the card's value line renders '—' (never a guess, never a 0).
  value: number | null
  points: number
}

export interface PromotionCardRow {
  display_name: string
  char_function: 'dps' | 'mdps' | 'suporte'
  // 0039: the member's OWN registry class (catalog key). A merged group section
  // (Artista) carries Bard and Gypsy cards, so each card names its class for the
  // job line and the class-art fallback. Optional: a payload from before 0039
  // omits it, and the card falls back to the section's class.
  char_class?: string
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
  // ACTIVE members read, plus anon read for the public landing in 0029 —
  // showcase visibility IS the feature). The client fetches it as a BLOB
  // (T-072-13 canvas-taint discipline — the same rule as the Painel own-card)
  // and falls back to the class portrait when the object doesn't exist (no
  // upload yet → 404). No key-stat/config data rides this field.
  photo_path: string
}

export interface PromotionSection {
  class_name: string
  // The build this section carries. Present on the body currently deployed
  // live (one section per meta cohort, verified 2026-10-29); the repo's 0037
  // body (one section per class) omits it — so it stays OPTIONAL and the
  // client never depends on it (builds are derived from the CARDS, which
  // always carry char_function). See highlights/buildGroups.mergeCohortSections.
  char_function?: 'dps' | 'mdps' | 'suporte'
  // 0037 (owner decision 2026-10-28): the TOP 3 by OVR of each META
  // (class, function) cohort — non-viable cohorts never appear, and a class
  // with several meta cohorts (e.g. Assassin Cross dps + mdps) keeps ONE
  // section carrying up to 3 cards per cohort, ordered by OVR desc. Classes
  // with insufficient data are OMITTED server-side (D-13). The client still
  // drops non-platinum cards (tierForOvr), so Início only ever shows the
  // "Impecáveis".
  //
  // 10.2 client half: the section's cards are split by `char_function` at
  // render time (highlights/buildGroups.groupCardsByBuild) so each build owns
  // its own carousel. That grouping is DISPLAY-ONLY over a field the payload
  // already carries — the wire shape, the card order and the closed field
  // list are unchanged, so no RPC change rides along with this split.
  cards: PromotionCardRow[]
}

/**
 * Public landing showcase (0029, owner decision 2026-10-24; 0037 2026-10-28;
 * credential-gated stats 2026-10-30): the anon-callable twin of
 * get_promotion — Início is the guild's landing page, visible to visitors
 * before login. The server ranks the TOP 3 by OVR of each META (class,
 * function) cohort only (class_cohorts.meta; non-viable combos and classes
 * without enough data never appear). Same closed payload (display_name,
 * char_function, ovr, photo_path, the 6 key stats with stat_key/label/
 * label_short/value_type/value/points); key-stat CONFIG and the cohort flags
 * are still never serialised.
 *
 * The RAW stat values (`value`) are only serialised to a caller holding a
 * valid member JWT — an anonymous request receives `value: null` and the card
 * renders '—' (owner 2026-10-30). So the app passes the live session when the
 * viewer is signed in (same RPC, member Authorization header) and passes
 * nothing on the public landing (anon key only).
 */
export async function fetchPromotionPublic(
  session?: NeoFootSession,
): Promise<PromotionSection[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    throw new ApiError(0, 'network', 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }
  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_promotion_public`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session?.access_token ?? anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
  } catch (err) {
    throw new ApiError(0, 'network', err instanceof Error ? err.message : 'network error')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const kind = res.status === 401 ? 'unauthorized' : 'server'
    throw new ApiError(res.status, kind, `HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
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

/** One member in the cross-cohort stat inspector (0047). */
export interface StatOverviewRow {
  member_id: string
  display_name: string
  char_id: string | null
  char_class: string | null
  char_function: 'dps' | 'mdps' | 'suporte' | null
  value: number | null
  submitted_at: string | null
  /** Same stats-cohort average, self excluded (null when n < 3). */
  class_average: number | null
  /** 0049: cohort median (n >= 3) and MAD (n >= 5). */
  class_median: number | null
  class_mad: number | null
  class_sample_size: number | null
  /** 0049: robust sigma vs the cohort median (n >= 5, positive median/MAD). */
  class_z: number | null
  class_sigma_outlier: boolean
  cohort_ratio: number | null
  guild_ratio: number | null
  cohort_outlier: boolean
  guild_outlier: boolean
}

export interface StatOverview {
  stat_key: string
  label: string
  label_short: string
  group_name: 'general' | 'quasi' | 'special'
  value_type: 'flat' | 'percentual'
  stat_direction: 'higher' | 'lower'
  guild: {
    sample_size: number
    average: number | null
    median: number | null
    max: number | null
    min: number | null
  }
  rows: StatOverviewRow[]
}

/**
 * Cross-cohort stat inspector (0047): ONE stat across every active real
 * member, independent of class/cohort. Staff-only gate inside the RPC — a
 * member JWT raises 'forbidden'. Rows arrive ordered by raw value descending
 * (nulls last); the client only reverses the array for the ascending view
 * (T-072-11 view-aid discipline, no rank math in the browser).
 */
export async function fetchStatOverview(
  session: NeoFootSession,
  statKey: string,
): Promise<StatOverview> {
  const res = await restFetch(session, '/rpc/stat_overview', {
    method: 'POST',
    body: JSON.stringify({ p_stat_key: statKey }),
  })
  const overview = await parseBody<StatOverview>(res)
  if (!overview || !Array.isArray(overview.rows)) {
    throw new ApiError(0, 'server', 'malformed stat_overview response')
  }
  return overview
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
  // only (PromotionShowcase discipline). Composite React keys use member_id
  // (display_name has no unique constraint).
  const res = await restFetch(session, '/rpc/role_rank', {
    method: 'POST',
    body: JSON.stringify({ p_function: charFunction, p_class: className ?? null }),
  })
  return (await parseBody<RoleRankRow[]>(res)) ?? []
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

/** Defense in depth for a server-composed showcase photo path: only
 *  bucket-internal, single-segment keys pass — anything else (foreign bucket,
 *  traversal, query junk) is refused before a network call. */
function isSafeCardPhotoPath(path: string): boolean {
  return (
    path.startsWith('card-photos/') &&
    !path.includes('..') &&
    !path.includes('?') &&
    !path.includes('#') &&
    !path.includes('//')
  )
}

/** In-flight/settled photo requests, keyed by storage path. The looping
 *  showcase (UAT round 2) renders each logical card three times, so without
 *  this every card would download its photo 3×. Sharing the promise keeps one
 *  network request per path; each consumer still makes its own object URL.
 *  A null result is evicted so a transient failure can retry on remount. */
const publicCardPhotoCache = new Map<string, Promise<Blob | null>>()

/** Public landing photo fetch by storage path (0029): the anon key is the
 *  only credential, so the showcase renders for visitors and members alike.
 *  Migration 0029 grants anon SELECT on card-photos objects whose folder is an
 *  ACTIVE member id — exactly the path the showcase payload carries. Same
 *  blob/same-origin discipline and the same null-degrades-to-portrait rule. */
export function fetchCardPhotoByPathPublic(path: string): Promise<Blob | null> {
  if (!isSafeCardPhotoPath(path)) return Promise.resolve(null)
  const cached = publicCardPhotoCache.get(path)
  if (cached) return cached

  const request = (async (): Promise<Blob | null> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) return null
    try {
      const res = await fetch(`${supabaseUrl}/storage/v1/object/${path}`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      })
      if (!res.ok) return null
      return await res.blob()
    } catch {
      return null
    }
  })()

  publicCardPhotoCache.set(path, request)
  void request.then((blob) => {
    if (blob === null && publicCardPhotoCache.get(path) === request) {
      publicCardPhotoCache.delete(path)
    }
  })
  return request
}

// ---------------------------------------------------------------------------
// Phase 8 (08-03) — the unauthenticated Edge/RPC surface.
//
// These are the ONLY pre-session data paths. Both headers ride every call —
// apikey (gateway auth) and Authorization: Bearer <anon> (no member JWT yet).
// The PIN and confirmation live only in component state and this request
// body: they are never persisted, logged or put in a URL (T-08-18).
// FunctionError carries the server's machine token plus lockout counters so
// pages render pt-BR copy without parsing message strings. Nothing here mints
// data access: since 0034 every first access is an officer-validated REQUEST
// (claim or registration) — the login happens only after the approval.
// ---------------------------------------------------------------------------

/** 'registration' (0020): a typed first access with no registry match, approved
 *  by an officer (with the PIN active since 0033). 'claim' (0034): a typed
 *  first access for an unclaimed registry row — the approval activates the
 *  PIN on the existing row. */
export type RequestType = 'member' | 'prospect' | 'registration' | 'claim'
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

/** first-access lookup answer (0020; 0034 manual fill). One state per status.
 *  'ready' means an unclaimed registry row exists — a CLAIM REQUEST can be
 *  sent for an officer to approve; no PIN setter opens on the client. */
export type FirstAccessStatus =
  | 'ready'
  | 'pin_set'
  | 'pending'
  | 'unknown'
  | 'identity_mismatch'
  | 'ambiguous_identity'
  /** The typed Discord handle already belongs to a claimed account. */
  | 'handle_claimed'
  /** The typed handle exists (no PIN yet) but the typed nickname does not match. */
  | 'handle_registered'

export interface FirstAccessLookupInput {
  nickname: string
  char_id: string
  /** Discord handle — only used to find a pending request for this person. */
  discord_handle?: string
}

/** 0034 manual first access — the typed identity every request carries. */
export interface FirstAccessIdentityInput {
  discord_handle: string
  char_id: string
  nickname: string
  char_class: string
}

/** 'claim' (0034): officer-validated activation of the PIN on an unclaimed
 *  registry row. The PIN is mandatory — the approval activates it. */
export interface FirstAccessClaimInput extends FirstAccessIdentityInput {
  pin: string
  confirm_pin: string
}

/** 'request' (0033 one-go / 0034 manual fill): officer-approved registration of
 *  a character the registry does not hold. */
export interface FirstAccessRequestInput extends FirstAccessIdentityInput {
  pin: string
  confirm_pin: string
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
const REQUEST_TYPES: readonly RequestType[] = ['member', 'prospect', 'registration', 'claim']

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
  fn: 'request-access' | 'verify-pin' | 'first-access',
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
 * First-access claims and registrations are officer-validated requests since
 * 0034 — the setup-pin auto-claim Edge Function and its RPCs are retired.
 */
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
 * Ask the registry what the TYPED nickname resolves to (0020; 0034 manual
 * fill). God-mode: this call mints nothing and stores nothing — it only
 * decides whether the page offers the claim request ('ready'), the
 * registration request ('unknown') or an explanation.
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

/** Narrow the pending-request answer shared by the claim/registration calls. */
function asPendingRequest(
  body: { request_id?: unknown; status?: unknown; duplicate?: unknown },
): { request_id: string; status: 'pending'; duplicate: boolean } {
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
 * Queue a 'claim' request (0034 manual first access): the officer approval
 * activates the player-chosen PIN on the unclaimed registry row. No session,
 * no PIN echo — the player logs in after the approval.
 */
export async function requestClaim(
  input: FirstAccessClaimInput,
): Promise<{ request_id: string; status: 'pending'; duplicate: boolean }> {
  const body = await edgeFetch<{
    request_id?: unknown
    status?: unknown
    duplicate?: unknown
  }>('first-access', { action: 'claim', ...input })
  return asPendingRequest(body)
}

/**
 * Queue a 'registration' request (handle + TYPED identity + the chosen PIN).
 * The officer approval registers the character with that PIN active (0033
 * one-go), so the player logs in right away.
 */
export async function requestFirstAccess(
  input: FirstAccessRequestInput,
): Promise<{ request_id: string; status: 'pending'; duplicate: boolean }> {
  const body = await edgeFetch<{
    request_id?: unknown
    status?: unknown
    duplicate?: unknown
  }>('first-access', { action: 'request', ...input })
  return asPendingRequest(body)
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
 *  applicant's own stats never join it. `proof_path` is null for the 0034
 *  manual-fill requests (claim/registration) — the officer judges from the
 *  typed identity. */
export interface StaffRequestRow {
  request_id: string
  discord_handle: string
  request_type: 'member' | 'prospect' | 'registration' | 'claim'
  char_id: string
  nickname: string
  char_class: string
  char_function: 'dps' | 'mdps' | 'suporte'
  proof_path: string | null
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
 * Proof bytes for the staff preview (staff-only object route, T-08-33). An
 * <img> tag cannot send the gateway/apikey/Authorization headers, so the bytes
 * are fetched here and shown as an object URL. Any failure resolves null: the
 * card degrades to the claimed-fields text instead of breaking the queue.
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

// ---------------------------------------------------------------------------
// Phase 10.4 (LNUP-01..03) — battlefield lineups. Three SECURITY DEFINER RPCs
// from migration 0040 (get_lineups read; set_lineup_slot and
// set_lineup_party_label officer/owner writes, device-bound). The server gates
// everything; these wrappers add NO enforcement. The payload is a CLOSED field
// list: display-only roster fields, never stats, points, OVR, key-stat config
// or pin_hash. Each wrapper validates the shape so a broken deploy surfaces as
// ApiError instead of a crash in the grid render path.
// ---------------------------------------------------------------------------

export type BattlefieldId = 'vigrid_field' | 'ruinscape'

export interface LineupRosterMember {
  member_id: string
  display_name: string
  char_class: string | null
  char_function: 'dps' | 'mdps' | 'suporte'
}

export interface LineupSlot {
  slot_index: number
  member_id: string | null
  display_name: string | null
  char_class: string | null
  char_function: 'dps' | 'mdps' | 'suporte' | null
}

export interface LineupParty {
  party_index: number
  role_label: string | null
  filled: number
  slots: LineupSlot[]
}

export interface BattlefieldLineup {
  battlefield: BattlefieldId
  parties: LineupParty[]
}

export interface LineupsPayload {
  battlefields: BattlefieldLineup[]
  roster: LineupRosterMember[]
}

const BATTLEFIELD_IDS: readonly BattlefieldId[] = ['vigrid_field', 'ruinscape']

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function asLineupSlot(value: unknown): LineupSlot {
  if (
    !isRecord(value) ||
    typeof value.slot_index !== 'number' ||
    !nullableString(value.member_id) ||
    !nullableString(value.display_name) ||
    !nullableString(value.char_class)
  ) {
    throw new ApiError(0, 'server', 'malformed get_lineups slot')
  }
  return {
    slot_index: value.slot_index,
    member_id: value.member_id,
    display_name: value.display_name,
    char_class: value.char_class,
    char_function: (value.char_function ?? null) as LineupSlot['char_function'],
  }
}

function asLineupParty(value: unknown): LineupParty {
  if (
    !isRecord(value) ||
    typeof value.party_index !== 'number' ||
    typeof value.filled !== 'number' ||
    !nullableString(value.role_label) ||
    !Array.isArray(value.slots)
  ) {
    throw new ApiError(0, 'server', 'malformed get_lineups party')
  }
  return {
    party_index: value.party_index,
    role_label: value.role_label,
    filled: value.filled,
    slots: value.slots.map(asLineupSlot),
  }
}

/** Narrow the get_lineups / set_* jsonb payload; anything else is a broken deploy. */
export function asLineupsPayload(value: unknown): LineupsPayload {
  if (!isRecord(value) || !Array.isArray(value.battlefields) || !Array.isArray(value.roster)) {
    throw new ApiError(0, 'server', 'malformed lineups response')
  }
  const battlefields: BattlefieldLineup[] = value.battlefields.map((bf) => {
    if (
      !isRecord(bf) ||
      typeof bf.battlefield !== 'string' ||
      !BATTLEFIELD_IDS.includes(bf.battlefield as BattlefieldId) ||
      !Array.isArray(bf.parties)
    ) {
      throw new ApiError(0, 'server', 'malformed get_lineups battlefield')
    }
    return {
      battlefield: bf.battlefield as BattlefieldId,
      parties: bf.parties.map(asLineupParty),
    }
  })
  const roster: LineupRosterMember[] = value.roster.map((m) => {
    if (
      !isRecord(m) ||
      typeof m.member_id !== 'string' ||
      typeof m.display_name !== 'string' ||
      !nullableString(m.char_class)
    ) {
      throw new ApiError(0, 'server', 'malformed get_lineups roster')
    }
    return {
      member_id: m.member_id,
      display_name: m.display_name,
      char_class: m.char_class,
      char_function: m.char_function as LineupRosterMember['char_function'],
    }
  })
  return { battlefields, roster }
}

/** Read both battlefields + the assignable roster (any active member). */
export async function fetchLineups(session: NeoFootSession): Promise<LineupsPayload> {
  const res = await restFetch(session, '/rpc/get_lineups', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return asLineupsPayload(await parseBody<unknown>(res))
}

/**
 * Set or clear (memberId = null) one slot (officer/owner). The server moves a
 * seated player out of their old slot and swaps when the target was occupied.
 * Errors surface as ApiError: invalid_lineup_member, forbidden, device_mismatch.
 */
export async function setLineupSlot(
  session: NeoFootSession,
  battlefield: BattlefieldId,
  partyIndex: number,
  slotIndex: number,
  memberId: string | null,
): Promise<LineupsPayload> {
  const res = await restFetch(session, '/rpc/set_lineup_slot', {
    method: 'POST',
    body: JSON.stringify({
      p_battlefield: battlefield,
      p_party: partyIndex,
      p_slot: slotIndex,
      p_member: memberId,
    }),
  })
  return asLineupsPayload(await parseBody<unknown>(res))
}

/** Edit or clear (roleLabel = null or blank) a party role label (officer/owner). */
export async function setLineupPartyLabel(
  session: NeoFootSession,
  battlefield: BattlefieldId,
  partyIndex: number,
  roleLabel: string | null,
): Promise<LineupsPayload> {
  const res = await restFetch(session, '/rpc/set_lineup_party_label', {
    method: 'POST',
    body: JSON.stringify({
      p_battlefield: battlefield,
      p_party: partyIndex,
      p_label: roleLabel,
    }),
  })
  return asLineupsPayload(await parseBody<unknown>(res))
}
