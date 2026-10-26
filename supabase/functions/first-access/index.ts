// NeoFoot first-access Edge Function (Phase 10, owner decision 2026-10-23)
//
// Three actions, one contract:
//
//   POST { action: 'lookup', nickname, char_id, discord_handle? }
//     -> 200 { status }
//        'ready'             registry row exists, no PIN yet -> PIN setter
//        'pin_set'           registry row already claimed -> login instead
//        'handle_claimed'    the typed Discord handle belongs to a claimed
//                            account -> the PIN system is refused entirely
//        'handle_registered' the typed handle exists but the print nickname does
//                            not match it -> officer, never a new registration
//        'pending'           a registration request awaits an officer
//        'unknown'           no registry row and no pending request
//        'identity_mismatch' registry row holds a DIFFERENT char_id
//        'ambiguous_identity' more than one registry row uses the nickname
//
//   POST { action: 'identify', discord_handle }
//     -> 200 { status: 'claimed' | 'unclaimed' | 'none' }
//        Handle-only probe for the request-access identification step.
//        'claimed' (account with a PIN) refuses the PIN system entirely: no
//        relink form, no PIN boxes — log in instead or ask staff for a reset.
//        'unclaimed' has a registry row without a PIN -> first-access claim.
//
//   POST { action: 'request', discord_handle, char_id, nickname, char_class,
//          pin?, confirm_pin?, proof_data_url }
//     -> 200 { request_id, status: 'pending', duplicate }
//        Stores the handle + print identity + proof + the OPTIONAL player-chosen
//        PIN (0033 one-go registration) as a pending 'registration' request.
//        An officer approval registers the character WITH that PIN already
//        active, so the player logs in right away — no second visit to a PIN
//        setter. A request without a PIN (cached pre-0033 bundle) keeps the
//        0020 behaviour: the approval creates the character unclaimed and the
//        PIN is set at the next first access.
//
// The proof upload is server-generated and service-role written; every
// non-success exit removes the orphan object. No session is ever minted here.
// The PIN and pin_hash are never logged and never appear in any response path.
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
} from '../_shared/session.ts'

const MAX_BODY_BYTES = 3_500_000
const ACTIONS = new Set(['lookup', 'request', 'identify'])

type LookupStatus =
  | 'ready'
  | 'pin_set'
  | 'pending'
  | 'unknown'
  | 'identity_mismatch'
  | 'ambiguous_identity'
  | 'handle_claimed'
  | 'handle_registered'

interface MemberRow {
  id: string
  pin_hash: string | null
  active: boolean
  char_id: string | null
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

  const action = typeof body.action === 'string' ? body.action : ''
  if (!ACTIONS.has(action)) return json({ error: 'invalid_request' }, 400)

  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : ''
  const charId = typeof body.char_id === 'string' ? body.char_id.trim() : ''
  const handle = typeof body.discord_handle === 'string' ? body.discord_handle.trim() : ''

  if (handle.length > 64) return json({ error: 'invalid_request' }, 400)

  const cfg = envConfig()
  if (!cfg) return json({ error: 'server_misconfigured' }, 500)
  const admin = createClient(cfg.supabaseUrl, cfg.serviceRoleKey)

  const key = nickname.toLowerCase()

  async function memberByHandle(): Promise<MemberRow | null> {
    if (handle.length === 0) return null
    const { data, error } = await admin
      .from('members')
      .select('id, pin_hash, active, char_id')
      .eq('active', true)
      .ilike('discord_handle', escapeLike(handle))
      .limit(2)
    if (error) throw new Error('handle lookup failed')
    const rows = (data ?? []) as MemberRow[]
    // discord_handle is UNIQUE; two hits mean a broken registry, which must
    // never be guessed.
    if (rows.length > 1) throw new Error('ambiguous handle')
    return rows[0] ?? null
  }

  // Handle-only probe used by the request-access "Identificação" step. Owner
  // rule (2026-10-23): an account that already has a PIN must refuse the PIN
  // system entirely, so the probe never opens a PIN form for it.
  if (action === 'identify') {
    if (handle.length === 0) return json({ error: 'invalid_request' }, 400)
    try {
      const member = await memberByHandle()
      if (member === null) return json({ status: 'none' })
      return json({ status: member.pin_hash === null ? 'unclaimed' : 'claimed' })
    } catch {
      return json({ error: 'server_error' }, 500)
    }
  }

  if (nickname.length === 0 || nickname.length > 80) {
    return json({ error: 'invalid_request' }, 400)
  }
  if (!/^\d{1,12}$/.test(charId)) return json({ error: 'invalid_request' }, 400)

  async function lookupStatus(): Promise<LookupStatus> {
    const { data, error } = await admin
      .from('members')
      .select('id, pin_hash, active, char_id')
      .eq('login_key', key)
      .eq('active', true)
    if (error) throw new Error('member lookup failed')
    const rows = (data ?? []) as MemberRow[]
    if (rows.length > 1) return 'ambiguous_identity'
    const byNick = rows[0]
    let byHandle: MemberRow | null
    try {
      byHandle = await memberByHandle()
    } catch {
      return 'ambiguous_identity'
    }

    // Owner rule (2026-10-23): a Discord handle that already belongs to a
    // CLAIMED account refuses the PIN system entirely — no PIN setter, no
    // registration request, ever. This is checked before the nickname answer so
    // the handle cannot be used to reach another row.
    if (byHandle && byHandle.pin_hash !== null && byNick?.id !== byHandle.id) {
      return 'handle_claimed'
    }
    // The handle belongs to an ACTIVE account without a PIN, but the print
    // points at a different row: never queue a second registration for it.
    if (byHandle && byNick && byNick.id !== byHandle.id) return 'handle_registered'

    if (byNick) {
      if (byNick.char_id !== null && byNick.char_id !== charId) return 'identity_mismatch'
      return byNick.pin_hash === null ? 'ready' : 'pin_set'
    }
    // The handle is known without a PIN and the print nickname matches nothing:
    // the account exists, so an officer fixes the nickname (never a new row).
    if (byHandle) return 'handle_registered'

    if (handle.length > 0) {
      const { data: pending, error: pendingErr } = await admin
        .from('membership_requests')
        .select('id')
        .eq('status', 'pending')
        .eq('request_type', 'registration')
        .ilike('discord_handle', escapeLike(handle))
        .limit(1)
      if (pendingErr) throw new Error('pending lookup failed')
      if ((pending ?? []).length > 0) return 'pending'
    }
    const { data: pendingId, error: pendingIdErr } = await admin
      .from('membership_requests')
      .select('id')
      .eq('status', 'pending')
      .eq('request_type', 'registration')
      .eq('char_id', charId)
      .limit(1)
    if (pendingIdErr) throw new Error('pending lookup failed')
    if ((pendingId ?? []).length > 0) return 'pending'
    return 'unknown'
  }

  if (action === 'lookup') {
    try {
      return json({ status: await lookupStatus() })
    } catch {
      return json({ error: 'server_error' }, 500)
    }
  }

  const charClass = typeof body.char_class === 'string' ? body.char_class.trim() : ''
  const proofDataUrl = typeof body.proof_data_url === 'string' ? body.proof_data_url.trim() : ''

  if (charClass.length === 0 || charClass.length > 40) {
    return json({ error: 'invalid_request' }, 400)
  }
  if (proofDataUrl.length === 0) return json({ error: 'invalid_proof' }, 400)
  if (proofByteLength(proofDataUrl) > MAX_PROOF_BYTES) {
    return json({ error: 'proof_too_large' }, 413)
  }
  const proof = decodeProof(proofDataUrl, MAX_PROOF_BYTES)
  if (!proof) return json({ error: 'invalid_proof' }, 400)

  // action === 'request' (0033 one-go registration): the player picks the PIN
  // in the same form; the officer approval activates it. The PIN is OPTIONAL
  // at this boundary only for a cached pre-0033 bundle — a request without one
  // keeps the 0020 behaviour (approval creates the member unclaimed).
  if (handle.length === 0) return json({ error: 'invalid_request' }, 400)

  const pin = typeof body.pin === 'string' ? body.pin : ''
  const confirmPin = typeof body.confirm_pin === 'string' ? body.confirm_pin : ''
  if (pin.length > 0 || confirmPin.length > 0) {
    if (!/^\d{4}$/.test(pin) || confirmPin !== pin) {
      return json({ error: 'invalid_request' }, 400)
    }
  }

  // State may have moved between the lookup and this submit: answer with the
  // status instead of queueing a request that can never be approved.
  try {
    const status = await lookupStatus()
    if (
      status === 'ready' ||
      status === 'pin_set' ||
      status === 'identity_mismatch' ||
      status === 'handle_claimed' ||
      status === 'handle_registered'
    ) {
      return json({ error: 'already_registered' }, 409)
    }
    if (status === 'ambiguous_identity') return json({ error: 'ambiguous_identity' }, 409)
    if (status === 'pending') return json({ error: 'request_pending' }, 409)
  } catch {
    return json({ error: 'server_error' }, 500)
  }

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

  // Same cost as the claim path (setup-pin): bcryptjs in the Edge, the hash
  // never crosses a response path and is never logged.
  const pinHash = pin.length > 0 ? bcrypt.hashSync(pin, 10) : null

  const { data, error } = await admin.rpc('create_registration_request', {
    p_handle: handle,
    p_char_id: charId,
    p_nickname: nickname,
    p_char_class: charClass,
    p_proof_path: proofPath,
    p_pin_hash: pinHash,
  })

  if (error) {
    const msg = errorMessage(error)
    await removeUpload()
    if (msg.includes('already_member')) return json({ error: 'already_registered' }, 409)
    if (msg.includes('dummy_handle')) return json({ error: 'invalid_request' }, 400)
    if (msg.includes('unknown_class')) return json({ error: 'unknown_class' }, 400)
    if (msg.includes('invalid')) return json({ error: 'invalid_request' }, 400)
    return json({ error: 'server_error' }, 500)
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { request_id?: string; status?: string; duplicate?: boolean }
    | null
  if (!row?.request_id) {
    await removeUpload()
    return json({ error: 'server_error' }, 500)
  }
  const duplicate = row.duplicate === true
  // A duplicate reuses the existing request row, so this upload is an orphan.
  if (duplicate) await removeUpload()

  return json({ request_id: row.request_id, status: 'pending', duplicate })
})

/** Escape PostgREST `ilike` wildcards so a handle is compared literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
