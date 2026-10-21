// NeoFoot request-access Edge Function (Phase 8, plan 08-02; WHIT-08/09/10)
// POST { discord_handle, pin, confirm_pin, request_type:'member'|'prospect',
//        char_id, nickname, char_class, char_function, proof_data_url,
//        stats?: Array<{stat_key,value}>, previous_pin?: string }
//   -> 200 { request_id, status:'pending' }
// Anon intake for both self-request loops. Never writes members, never mints a
// session, never echoes the PIN/hash. Proof images are uploaded with the service
// role to the private staff-only `identity-proofs` bucket; a superseded request
// is only replaced after its own PIN verifies (bcrypt + the shared lockout).
import bcrypt from 'npm:bcryptjs@3'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  MAX_PROOF_BYTES,
  corsHeaders,
  decodeProof,
  envConfig,
  errorMessage,
  json,
  proofByteLength,
  rowToState,
} from '../_shared/session.ts'
import { MAX_ATTEMPTS, isLocked, retryAfterSeconds, resetState } from '../_shared/lockout.ts'

const MAX_BODY_BYTES = 3_500_000
const FUNCTIONS = new Set(['dps', 'mdps', 'suporte'])
const REQUEST_TYPES = new Set(['member', 'prospect'])

/** Prospect applications carry the full 56-key wizard payload (+optional combat_power). */
function validStats(stats: unknown): stats is Array<{ stat_key: string; value: number }> {
  if (!Array.isArray(stats) || stats.length < 56 || stats.length > 57) return false
  const seen = new Set<string>()
  for (const raw of stats) {
    if (!raw || typeof raw !== 'object') return false
    const row = raw as Record<string, unknown>
    if (typeof row.stat_key !== 'string') return false
    if (row.stat_key.length === 0 || row.stat_key.length > 64) return false
    if (typeof row.value !== 'number' || !Number.isFinite(row.value)) return false
    if (seen.has(row.stat_key)) return false
    seen.add(row.stat_key)
  }
  return true
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const declaredLength = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: 'proof_too_large' }, 413)
  }

  let raw: string
  try {
    raw = await req.text()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'proof_too_large' }, 413)

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_request' }, 400)

  const handle = typeof body.discord_handle === 'string' ? body.discord_handle.trim() : ''
  const pin = body.pin
  const confirmPin = body.confirm_pin
  const requestType = typeof body.request_type === 'string' ? body.request_type : ''
  const charId = typeof body.char_id === 'string' ? body.char_id.trim() : ''
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : ''
  const charClass = typeof body.char_class === 'string' ? body.char_class.trim() : ''
  const charFunction = typeof body.char_function === 'string' ? body.char_function : ''
  const proofDataUrl = typeof body.proof_data_url === 'string' ? body.proof_data_url.trim() : ''
  const previousPin = body.previous_pin
  const stats = body.stats

  if (handle.length === 0 || handle.length > 64) return json({ error: 'invalid_request' }, 400)
  if (
    typeof pin !== 'string' || !/^\d{4}$/.test(pin) ||
    typeof confirmPin !== 'string' || confirmPin !== pin
  ) {
    return json({ error: 'invalid_request' }, 400)
  }
  if (!REQUEST_TYPES.has(requestType)) return json({ error: 'invalid_request' }, 400)
  if (!/^\d{1,12}$/.test(charId)) return json({ error: 'invalid_request' }, 400)
  if (nickname.length === 0 || nickname.length > 80) return json({ error: 'invalid_request' }, 400)
  if (charClass.length === 0 || charClass.length > 40) return json({ error: 'invalid_request' }, 400)
  if (!FUNCTIONS.has(charFunction)) return json({ error: 'invalid_function' }, 400)
  if (previousPin !== undefined && previousPin !== null) {
    if (typeof previousPin !== 'string' || !/^\d{4}$/.test(previousPin)) {
      return json({ error: 'invalid_request' }, 400)
    }
  }

  if (requestType === 'prospect') {
    if (!validStats(stats)) return json({ error: 'invalid_stats' }, 400)
  } else if (stats !== undefined && stats !== null) {
    if (!Array.isArray(stats) || stats.length > 0) return json({ error: 'invalid_stats' }, 400)
  }

  if (proofDataUrl.length === 0) return json({ error: 'invalid_proof' }, 400)
  if (proofByteLength(proofDataUrl) > MAX_PROOF_BYTES) {
    return json({ error: 'proof_too_large' }, 413)
  }
  const proof = decodeProof(proofDataUrl, MAX_PROOF_BYTES)
  if (!proof) return json({ error: 'invalid_proof' }, 400)

  // The dummy-% namespace is a test-fixture sentinel — never a real applicant.
  if (handle.toLowerCase().startsWith('dummy-')) return json({ error: 'dummy_handle' }, 400)

  const cfg = envConfig()
  if (!cfg) return json({ error: 'server_misconfigured' }, 500)
  const admin = createClient(cfg.supabaseUrl, cfg.serviceRoleKey)

  const now = new Date()

  // D-09: an ACTIVE member already has access — they log in instead of asking.
  const { data: member, error: memberErr } = await admin
    .from('members')
    .select('id, active')
    .eq('discord_handle', handle)
    .maybeSingle()
  if (memberErr) return json({ error: 'server_error' }, 500)
  if (member && member.active === true) return json({ error: 'already_member' }, 409)

  // D-11: exactly one pending request per handle. Replacing it requires that
  // request's PIN — verified here, before any proof upload.
  const { data: pendingRows, error: pendingErr } = await admin
    .from('membership_requests')
    .select('id, discord_handle, pin_hash')
    .eq('status', 'pending')
  if (pendingErr) return json({ error: 'server_error' }, 500)
  const pending = (Array.isArray(pendingRows) ? pendingRows : []).find(
    (row) => typeof row.discord_handle === 'string' &&
      row.discord_handle.toLowerCase() === handle.toLowerCase(),
  )

  let supersedeId: string | null = null
  if (pending) {
    if (previousPin === undefined || previousPin === null) {
      return json({ error: 'request_pending' }, 409)
    }

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

    const matches = pending.pin_hash
      ? bcrypt.compareSync(previousPin as string, pending.pin_hash as string)
      : false
    if (!matches) {
      const { data: rpcRow, error: rpcErr } = await admin.rpc('record_pin_failure', {
        p_handle: handle,
      })
      if (rpcErr) return json({ error: 'server_error' }, 500)
      const row = (Array.isArray(rpcRow) ? rpcRow[0] : rpcRow) as
        | { o_failed_count: number | null }
        | null
      const failedCount = Number(row?.o_failed_count ?? 0)
      return json(
        { error: 'invalid_previous_pin', attempts_remaining: Math.max(0, MAX_ATTEMPTS - failedCount) },
        401,
      )
    }

    // Correct previous PIN: clear the counter, then let the RPC supersede.
    const cleared = resetState()
    const { error: clearErr } = await admin.from('pin_login_attempts').upsert({
      discord_handle: handle,
      failed_count: cleared.failedCount,
      locked_until: null,
      updated_at: now.toISOString(),
    })
    if (clearErr) return json({ error: 'server_error' }, 500)
    supersedeId = pending.id as string
  }

  // T-08-13: server-generated path + service-role write; track for cleanup.
  const proofPath = `requests/pending/${crypto.randomUUID()}.jpg`
  let uploaded = false
  const removeUpload = async () => {
    if (!uploaded) return
    try {
      await admin.storage.from('identity-proofs').remove([proofPath])
    } catch {
      // Best effort — never mask the real error.
    }
    uploaded = false
  }

  const { error: uploadErr } = await admin.storage
    .from('identity-proofs')
    .upload(proofPath, new Blob([proof.bytes.buffer as ArrayBuffer], { type: proof.mime }), {
      contentType: proof.mime,
      upsert: false,
    })
  if (uploadErr) return json({ error: 'server_error' }, 500)
  uploaded = true

  const pinHash = bcrypt.hashSync(pin, 10)
  const { data: rpcResult, error: rpcError } = await admin.rpc('create_membership_request', {
    p_handle: handle,
    p_pin_hash: pinHash,
    p_request_type: requestType,
    p_char_id: charId,
    p_nickname: nickname,
    p_char_class: charClass,
    p_char_function: charFunction,
    p_proof_path: proofPath,
    p_stats: requestType === 'prospect' ? stats : null,
    p_supersede_request: supersedeId,
  })

  if (rpcError) {
    const msg = errorMessage(rpcError)
    await removeUpload()
    if (msg.includes('request_pending')) return json({ error: 'request_pending' }, 409)
    if (msg.includes('duplicate_char_id')) return json({ error: 'duplicate_char_id' }, 400)
    if (msg.includes('dummy_handle')) return json({ error: 'dummy_handle' }, 400)
    if (msg.includes('unknown_class')) return json({ error: 'unknown_class' }, 400)
    if (msg.includes('invalid_function')) return json({ error: 'invalid_function' }, 400)
    if (msg.includes('invalid_stats')) return json({ error: 'invalid_stats' }, 400)
    if (msg.includes('invalid_proof')) return json({ error: 'invalid_proof' }, 400)
    if (msg.includes('invalid')) return json({ error: 'invalid_request' }, 400)
    return json({ error: 'server_error' }, 500)
  }

  const result = (Array.isArray(rpcResult) ? rpcResult[0] : rpcResult) as
    | { request_id?: string; superseded_proof_path?: string | null }
    | null
  if (!result?.request_id) {
    // The request may have committed; keep the proof object it points at.
    return json({ error: 'server_error' }, 500)
  }

  // D-11/D-15: the superseded request's image is purged once the new row exists.
  const oldProof = result.superseded_proof_path
  if (typeof oldProof === 'string' && oldProof.length > 0) {
    try {
      await admin.storage.from('identity-proofs').remove([oldProof])
    } catch {
      // Best effort: the superseded row already has proof_path = null.
    }
  }

  // Status only — no session, no member id, no PIN echo.
  return json({ request_id: result.request_id, status: 'pending' })
})
