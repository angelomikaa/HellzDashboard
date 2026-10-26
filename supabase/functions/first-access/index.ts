// NeoFoot first-access Edge Function (Phase 10; 0034 manual first access)
//
// Three actions, one contract — NO PRINT, NO OCR (owner decision 2026-10-26):
// the player TYPES the identity and chooses the PIN; with nothing verifiable
// at the boundary, EVERY first access becomes an officer-validated request.
// The admins carry the identity check until the Phase 11 Discord link lands.
//
//   POST { action: 'lookup', nickname, char_id, discord_handle? }
//     -> 200 { status }
//        'ready'             registry row exists, unclaimed -> send a CLAIM
//                            request (the officer approval activates the PIN)
//        'pin_set'           registry row already claimed -> login instead
//        'handle_claimed'    the typed Discord handle belongs to a claimed
//                            account -> the PIN system is refused entirely
//        'handle_registered' the typed handle exists but the nickname does not
//                            match it -> officer, never a new registration
//        'pending'           a claim/registration request awaits an officer
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
//   POST { action: 'claim', discord_handle, char_id, nickname, char_class,
//          pin, confirm_pin }
//     -> 200 { request_id, status: 'pending', duplicate }
//        0034: queues a first-access CLAIM for the unclaimed registry row the
//        typed nickname resolves to, carrying the player-chosen PIN. An officer
//        approves it in Solicitações; the approval activates the PIN on the
//        row — the player logs in with nickname + PIN. No session is minted.
//
//   POST { action: 'request', discord_handle, char_id, nickname, char_class,
//          pin?, confirm_pin?, proof_data_url? }
//     -> 200 { request_id, status: 'pending', duplicate }
//        Stores the handle + TYPED identity + the OPTIONAL player-chosen PIN
//        (0033 one-go) as a pending 'registration' request. The officer
//        approval registers the character WITH that PIN active. Any
//        proof_data_url a cached pre-0034 bundle still sends is IGNORED.
//
// No proof is uploaded, no session is ever minted here. The PIN and pin_hash
// are never logged and never appear in any response path.
import bcrypt from 'npm:bcryptjs@3'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  corsHeaders,
  envConfig,
  errorMessage,
  json,
} from '../_shared/session.ts'

const MAX_BODY_BYTES = 8_000 // typed identity + PIN JSON; nothing larger is legit
const ACTIONS = new Set(['lookup', 'request', 'identify', 'claim'])

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
    return json({ error: 'invalid_request' }, 400)
  }

  let raw: string
  try {
    raw = await req.text()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'invalid_request' }, 400)

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
    // CLAIMED account refuses the PIN system entirely — no claim request, no
    // registration request, ever. This is checked before the nickname answer so
    // the handle cannot be used to reach another row.
    if (byHandle && byHandle.pin_hash !== null && byNick?.id !== byHandle.id) {
      return 'handle_claimed'
    }
    // The handle belongs to an ACTIVE account without a PIN, but the typed
    // nickname points at a different row: never queue a second registration
    // for it.
    if (byHandle && byNick && byNick.id !== byHandle.id) return 'handle_registered'

    if (byNick) {
      if (byNick.char_id !== null && byNick.char_id !== charId) return 'identity_mismatch'
      // 0034: 'ready' no longer opens a PIN setter — it means the row is
      // unclaimed and a CLAIM REQUEST can be sent for an officer to approve.
      return byNick.pin_hash === null ? 'ready' : 'pin_set'
    }
    // The handle is known without a PIN and the typed nickname matches nothing:
    // the account exists, so an officer fixes the nickname (never a new row).
    if (byHandle) return 'handle_registered'

    if (handle.length > 0) {
      const { data: pending, error: pendingErr } = await admin
        .from('membership_requests')
        .select('id')
        .eq('status', 'pending')
        .in('request_type', ['registration', 'claim'])
        .ilike('discord_handle', escapeLike(handle))
        .limit(1)
      if (pendingErr) throw new Error('pending lookup failed')
      if ((pending ?? []).length > 0) return 'pending'
    }
    const { data: pendingId, error: pendingIdErr } = await admin
      .from('membership_requests')
      .select('id')
      .eq('status', 'pending')
      .in('request_type', ['registration', 'claim'])
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

  if (charClass.length === 0 || charClass.length > 40) {
    return json({ error: 'invalid_request' }, 400)
  }
  if (handle.length === 0) return json({ error: 'invalid_request' }, 400)

  const pin = typeof body.pin === 'string' ? body.pin : ''
  const confirmPin = typeof body.confirm_pin === 'string' ? body.confirm_pin : ''
  if (pin.length > 0 || confirmPin.length > 0) {
    if (!/^\d{4}$/.test(pin) || confirmPin !== pin) {
      return json({ error: 'invalid_request' }, 400)
    }
  }

  // 0034 first-access CLAIM: the unclaimed registry row exists ('ready') —
  // queue the officer-validated claim carrying the player-chosen PIN. The PIN
  // is REQUIRED on this action (the whole point of the request is to activate
  // it); no print, no proof, no session. create_claim_request re-checks the
  // row state under its lock and answers with precise tokens, so no separate
  // pre-check runs here.
  if (action === 'claim') {
    if (!/^\d{4}$/.test(pin) || confirmPin !== pin) {
      return json({ error: 'invalid_request' }, 400)
    }
    const pinHash = bcrypt.hashSync(pin, 10)

    const { data, error } = await admin.rpc('create_claim_request', {
      p_handle: handle,
      p_char_id: charId,
      p_nickname: nickname,
      p_char_class: charClass,
      p_pin_hash: pinHash,
    })

    if (error) {
      const msg = errorMessage(error)
      if (msg.includes('not_registered')) return json({ error: 'not_registered' }, 404)
      if (msg.includes('already_set')) return json({ error: 'pin_already_set' }, 409)
      if (msg.includes('identity_mismatch')) return json({ error: 'identity_mismatch' }, 409)
      if (msg.includes('ambiguous_identity')) return json({ error: 'ambiguous_identity' }, 409)
      if (msg.includes('already_member')) return json({ error: 'handle_claimed' }, 409)
      if (msg.includes('dummy_handle')) return json({ error: 'invalid_request' }, 400)
      if (msg.includes('unknown_class')) return json({ error: 'unknown_class' }, 400)
      if (msg.includes('invalid')) return json({ error: 'invalid_request' }, 400)
      return json({ error: 'server_error' }, 500)
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | { request_id?: string; duplicate?: boolean }
      | null
    if (!row?.request_id) return json({ error: 'server_error' }, 500)
    return json({ request_id: row.request_id, status: 'pending', duplicate: row.duplicate === true })
  }

  // action === 'request': the typed identity must still be unknown — state may
  // have moved between the lookup and this submit, so answer with the status
  // instead of queueing a request that can never be approved.
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

  // (0033 one-go registration, 0034 manual fill): the player-chosen PIN is
  // OPTIONAL here only for a cached pre-0033 bundle — a request without one
  // keeps the member unclaimed (they then claim through a claim request). Any
  // proof_data_url a cached bundle sends is ignored.
  const pinHash = pin.length > 0 ? bcrypt.hashSync(pin, 10) : null

  const { data, error } = await admin.rpc('create_registration_request', {
    p_handle: handle,
    p_char_id: charId,
    p_nickname: nickname,
    p_char_class: charClass,
    p_proof_path: null,
    p_pin_hash: pinHash,
  })

  if (error) {
    const msg = errorMessage(error)
    if (msg.includes('already_member')) return json({ error: 'already_registered' }, 409)
    if (msg.includes('dummy_handle')) return json({ error: 'invalid_request' }, 400)
    if (msg.includes('unknown_class')) return json({ error: 'unknown_class' }, 400)
    if (msg.includes('invalid')) return json({ error: 'invalid_request' }, 400)
    return json({ error: 'server_error' }, 500)
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { request_id?: string; status?: string; duplicate?: boolean }
    | null
  if (!row?.request_id) return json({ error: 'server_error' }, 500)
  const duplicate = row.duplicate === true

  return json({ request_id: row.request_id, status: 'pending', duplicate })
})

/** Escape PostgREST `ilike` wildcards so a handle is compared literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
