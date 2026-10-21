// NeoFoot setup-pin Edge Function (Phase 8, plan 08-02; WHIT-02/03, D-03/D-04/D-05)
// POST { discord_handle, pin, confirm_pin, char_id, nickname, char_class, proof_data_url }
//   -> 200 { session } (the exact verify-pin session shape)
// First-access claim: validates the identity + JPEG proof, uploads the proof to
// the private staff-only `identity-proofs` bucket, claims the PIN atomically via
// the service-role claim_pin RPC and mints the standard 7-day session.
// A second claim is refused (pin_already_set) and any orphan upload is removed.
// The PIN and pin_hash are never logged and never appear in any response path.
import bcrypt from 'npm:bcryptjs@3'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  DUMMY_HASH,
  MAX_PROOF_BYTES,
  corsHeaders,
  decodeProof,
  envConfig,
  errorMessage,
  json,
  mintSession,
  proofByteLength,
  rowToState,
} from '../_shared/session.ts'
import { MAX_ATTEMPTS, isLocked, retryAfterSeconds, resetState } from '../_shared/lockout.ts'

const MAX_BODY_BYTES = 3_500_000 // JPEG proof is <=2 MB; leave room for base64 + JSON

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Bound the body BEFORE parsing: base64 inflates the 2 MB JPEG to ~2.8 MB.
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
  const charId = typeof body.char_id === 'string' ? body.char_id.trim() : ''
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : ''
  const charClass = typeof body.char_class === 'string' ? body.char_class.trim() : ''
  const proofDataUrl = typeof body.proof_data_url === 'string' ? body.proof_data_url.trim() : ''

  // WR-04: trim + bound every text field server-side.
  if (handle.length === 0 || handle.length > 64) return json({ error: 'invalid_request' }, 400)
  if (
    typeof pin !== 'string' || !/^\d{4}$/.test(pin) ||
    typeof confirmPin !== 'string' || confirmPin !== pin
  ) {
    return json({ error: 'invalid_request' }, 400)
  }
  if (!/^\d{1,12}$/.test(charId)) return json({ error: 'invalid_request' }, 400)
  if (nickname.length === 0 || nickname.length > 80) return json({ error: 'invalid_request' }, 400)
  if (charClass.length === 0 || charClass.length > 40) return json({ error: 'invalid_request' }, 400)

  if (proofDataUrl.length === 0) return json({ error: 'invalid_proof' }, 400)
  if (proofByteLength(proofDataUrl) > MAX_PROOF_BYTES) {
    return json({ error: 'proof_too_large' }, 413)
  }
  const proof = decodeProof(proofDataUrl, MAX_PROOF_BYTES)
  if (!proof) return json({ error: 'invalid_proof' }, 400)

  const cfg = envConfig()
  if (!cfg) return json({ error: 'server_misconfigured' }, 500)
  const admin = createClient(cfg.supabaseUrl, cfg.serviceRoleKey)

  const now = new Date()

  // Lockout gate — the SAME pin_login_attempts machinery verify-pin uses (D-04).
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

  async function recordFailure(): Promise<number> {
    const { data: rpcRow, error: rpcErr } = await admin.rpc('record_pin_failure', {
      p_handle: handle,
    })
    if (rpcErr) throw new Error('record_pin_failure RPC failed')
    const row = (Array.isArray(rpcRow) ? rpcRow[0] : rpcRow) as
      | { o_failed_count: number | null; o_locked_until: string | null }
      | null
    if (!row) throw new Error('record_pin_failure RPC returned no row')
    const failedCount = Number(row.o_failed_count ?? 0)
    return Math.max(0, MAX_ATTEMPTS - failedCount)
  }

  const { data: member, error: memberErr } = await admin
    .from('members')
    .select('id, display_name, role, pin_hash, active')
    .eq('discord_handle', handle)
    .maybeSingle()
  if (memberErr) return json({ error: 'server_error' }, 500)

  // Uniform 401 for missing/inactive handles (T-01-07/WR-01): same shape and the
  // same dummy compare as verify-pin, and it counts toward the shared lockout.
  if (!member || member.active === false) {
    bcrypt.compareSync(pin, DUMMY_HASH)
    try {
      const attemptsRemaining = await recordFailure()
      return json({ error: 'invalid_credentials', attempts_remaining: attemptsRemaining }, 401)
    } catch {
      return json({ error: 'server_error' }, 500)
    }
  }

  // D-04: an existing PIN can never be overwritten by a second claim.
  if (member.pin_hash !== null) return json({ error: 'pin_already_set' }, 409)

  const { data: classRow, error: classErr } = await admin
    .from('classes')
    .select('class_name')
    .eq('class_name', charClass)
    .maybeSingle()
  if (classErr) return json({ error: 'server_error' }, 500)
  if (!classRow) return json({ error: 'unknown_class' }, 400)

  // T-08-13: server-generated path, service-role write. Track the path so every
  // non-success exit after this point can remove the orphan object.
  const proofPath = `claims/${member.id}/${crypto.randomUUID()}.jpg`
  let uploaded = false
  const removeUpload = async () => {
    if (!uploaded) return
    try {
      await admin.storage.from('identity-proofs').remove([proofPath])
    } catch {
      // Best effort: an orphan is preferred over masking the real error.
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
  const { data: claimRow, error: claimErr } = await admin.rpc('claim_pin', {
    p_handle: handle,
    p_pin_hash: pinHash,
    p_char_id: charId,
    p_nickname: nickname,
    p_char_class: charClass,
    p_proof_path: proofPath,
  })

  if (claimErr) {
    const msg = errorMessage(claimErr)
    await removeUpload()
    if (msg.includes('already_set')) return json({ error: 'pin_already_set' }, 409)
    if (msg.includes('duplicate_char_id')) return json({ error: 'duplicate_char_id' }, 400)
    if (msg.includes('unknown_class')) return json({ error: 'unknown_class' }, 400)
    if (msg.includes('invalid_identity') || msg.includes('invalid_pin')) {
      return json({ error: 'invalid_request' }, 400)
    }
    if (msg.includes('invalid')) {
      // The RPC re-checked the handle/active/unclaimed state under its row lock.
      bcrypt.compareSync(pin, DUMMY_HASH)
      try {
        const attemptsRemaining = await recordFailure()
        return json({ error: 'invalid_credentials', attempts_remaining: attemptsRemaining }, 401)
      } catch {
        return json({ error: 'server_error' }, 500)
      }
    }
    return json({ error: 'server_error' }, 500)
  }

  const claimed = (Array.isArray(claimRow) ? claimRow[0] : claimRow) as
    | { member_id?: string; display_name?: string; role?: string }
    | null
  if (!claimed?.member_id) {
    // The claim may have committed even if the payload is unreadable. Do NOT
    // delete the proof (identity_proofs would point at a missing object).
    return json({ error: 'server_error' }, 500)
  }

  // Success-path lockout reset must not silently fail (WR-03), mirroring verify-pin.
  const cleared = resetState()
  const { error: clearErr } = await admin.from('pin_login_attempts').upsert({
    discord_handle: handle,
    failed_count: cleared.failedCount,
    locked_until: null,
    updated_at: now.toISOString(),
  })
  if (clearErr) return json({ error: 'server_error' }, 500)

  let session
  try {
    session = await mintSession({
      id: claimed.member_id,
      display_name: claimed.display_name ?? nickname,
      role: claimed.role ?? member.role,
    })
  } catch {
    return json({ error: 'server_error' }, 500)
  }

  return json({ session })
})
