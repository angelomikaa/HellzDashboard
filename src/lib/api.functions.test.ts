import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NeoFootSession } from '../features/auth/session'
import {
  fetchRequestStatus,
  firstAccessIdentify,
  firstAccessLookup,
  requestAccess,
  requestClaim,
  requestFirstAccess,
  requestStepUp,
  type RequestAccessInput,
} from './api'

// Plan 08-03 task 2: the unauthenticated surface. Every call carries the anon
// bearer (never a member JWT) and maps server tokens/counters onto
// FunctionError so pages render pt-BR copy without parsing strings.
const SESSION: NeoFootSession = {
  access_token: 'jwt',
  member_id: '11111111-1111-1111-1111-111111111111',
  display_name: 'Ahrya',
  member_role: 'member',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
}

const REQUEST_INPUT: RequestAccessInput = {
  discord_handle: 'ahrya',
  pin: '1234',
  confirm_pin: '1234',
  request_type: 'member',
  char_id: '32980',
  nickname: 'Ahrya',
  char_class: 'Gypsy',
  char_function: 'dps',
  proof_data_url: 'data:image/jpeg;base64,AAAA',
}

// 0034 manual first access: the typed identity + PIN every claim/registration
// request carries — no print, no proof_data_url.
const CLAIM_INPUT = {
  discord_handle: 'ahrya',
  char_id: '32980',
  nickname: 'Ahrya',
  char_class: 'Gypsy',
  pin: '1234',
  confirm_pin: '1234',
} as const

function res(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => body }
}

let calls: { url: string; init: RequestInit }[] = []
let nextResponse: () => ReturnType<typeof res>

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test-project.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
  calls = []
  nextResponse = () => res(200, JSON.stringify({ session: SESSION }))
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return nextResponse()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function headers(call: { init: RequestInit }): Record<string, string> {
  return call.init.headers as Record<string, string>
}

describe('anon surface — request shape', () => {
  it('targets /functions/v1/<fn> with apikey + Bearer anon and JSON body', async () => {
    nextResponse = () => res(200, JSON.stringify({ request_id: 'req-1', status: 'pending' }))
    await requestAccess(REQUEST_INPUT)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://test-project.supabase.co/functions/v1/request-access')
    expect(calls[0].init.method).toBe('POST')
    expect(headers(calls[0]).apikey).toBe('test-anon-key')
    expect(headers(calls[0]).Authorization).toBe('Bearer test-anon-key')
    expect(headers(calls[0])['Content-Type']).toBe('application/json')
    expect(JSON.parse(String(calls[0].init.body))).toEqual(REQUEST_INPUT)
    // No member session header on the unauthenticated surface.
    expect(headers(calls[0]).Authorization).not.toBe(`Bearer ${SESSION.access_token}`)
  })

  it('targets the request-access function with request_type and no session', async () => {
    nextResponse = () => res(200, JSON.stringify({ request_id: 'req-1', status: 'pending' }))
    await requestAccess(REQUEST_INPUT)

    expect(calls[0].url).toBe('https://test-project.supabase.co/functions/v1/request-access')
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ request_type: 'member' })
    expect(headers(calls[0]).Authorization).toBe('Bearer test-anon-key')
  })

  it('throws a network FunctionError when the env is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    await expect(requestAccess(REQUEST_INPUT)).rejects.toMatchObject({
      name: 'FunctionError',
      code: 'network',
      status: 0,
    })
    expect(calls).toHaveLength(0)
  })

  it('maps a fetch rejection to code network', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    await expect(requestAccess(REQUEST_INPUT)).rejects.toMatchObject({
      name: 'FunctionError',
      code: 'network',
      status: 0,
    })
  })
})

describe('first-access — lookup + registration (0020)', () => {
  it('posts action lookup with the typed identity and no session', async () => {
    nextResponse = () => res(200, JSON.stringify({ status: 'ready' }))
    await expect(
      firstAccessLookup({ nickname: 'Ahrya', char_id: '32980', discord_handle: 'ahrya' }),
    ).resolves.toBe('ready')

    expect(calls[0].url).toBe('https://test-project.supabase.co/functions/v1/first-access')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      action: 'lookup',
      nickname: 'Ahrya',
      char_id: '32980',
      discord_handle: 'ahrya',
    })
    expect(headers(calls[0]).Authorization).toBe('Bearer test-anon-key')
  })

  it('accepts every documented status, including the claimed-handle refusals', async () => {
    for (const status of [
      'ready',
      'pin_set',
      'pending',
      'unknown',
      'identity_mismatch',
      'ambiguous_identity',
      'handle_claimed',
      'handle_registered',
    ] as const) {
      nextResponse = () => res(200, JSON.stringify({ status }))
      await expect(
        firstAccessLookup({ nickname: 'Ahrya', char_id: '32980' }),
      ).resolves.toBe(status)
    }
  })

  it('rejects an unknown lookup status as invalid_response', async () => {
    nextResponse = () => res(200, JSON.stringify({ status: 'maybe' }))
    await expect(
      firstAccessLookup({ nickname: 'Ahrya', char_id: '32980' }),
    ).rejects.toMatchObject({ code: 'invalid_response' })

    nextResponse = () => res(200, JSON.stringify({}))
    await expect(
      firstAccessLookup({ nickname: 'Ahrya', char_id: '32980' }),
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('posts action identify with only the handle and maps the three answers', async () => {
    for (const status of ['claimed', 'unclaimed', 'none'] as const) {
      nextResponse = () => res(200, JSON.stringify({ status }))
      await expect(firstAccessIdentify('satturne')).resolves.toBe(status)
    }
    expect(calls[calls.length - 1].url).toBe(
      'https://test-project.supabase.co/functions/v1/first-access',
    )
    expect(JSON.parse(String(calls[calls.length - 1].init.body))).toEqual({
      action: 'identify',
      discord_handle: 'satturne',
    })

    nextResponse = () => res(200, JSON.stringify({ status: 'ready' }))
    await expect(firstAccessIdentify('satturne')).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('posts action request with handle + typed identity + the chosen PIN (no proof)', async () => {
    nextResponse = () =>
      res(200, JSON.stringify({ request_id: 'req-9', status: 'pending', duplicate: false }))
    await expect(requestFirstAccess({ ...CLAIM_INPUT })).resolves.toEqual({
      request_id: 'req-9',
      status: 'pending',
      duplicate: false,
    })

    expect(calls[0].url).toBe('https://test-project.supabase.co/functions/v1/first-access')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      action: 'request',
      discord_handle: 'ahrya',
      char_id: '32980',
      nickname: 'Ahrya',
      char_class: 'Gypsy',
      pin: '1234',
      confirm_pin: '1234',
    })
  })

  it('keeps the duplicate flag and maps server refusals', async () => {
    nextResponse = () =>
      res(200, JSON.stringify({ request_id: 'req-9', status: 'pending', duplicate: true }))
    await expect(requestFirstAccess({ ...CLAIM_INPUT })).resolves.toMatchObject({
      duplicate: true,
    })

    nextResponse = () => res(409, JSON.stringify({ error: 'already_registered' }))
    await expect(requestFirstAccess({ ...CLAIM_INPUT })).rejects.toMatchObject({
      status: 409,
      code: 'already_registered',
    })

    nextResponse = () => res(200, JSON.stringify({ status: 'pending' }))
    await expect(requestFirstAccess({ ...CLAIM_INPUT })).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  // 0034: the claim request — officer-validated activation of the PIN on an
  // unclaimed registry row. Same envelope as the registration, action 'claim'.
  it('posts action claim with the typed identity + PIN and maps its refusals', async () => {
    nextResponse = () =>
      res(200, JSON.stringify({ request_id: 'req-7', status: 'pending', duplicate: false }))
    await expect(requestClaim({ ...CLAIM_INPUT })).resolves.toEqual({
      request_id: 'req-7',
      status: 'pending',
      duplicate: false,
    })

    expect(calls[0].url).toBe('https://test-project.supabase.co/functions/v1/first-access')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      action: 'claim',
      discord_handle: 'ahrya',
      char_id: '32980',
      nickname: 'Ahrya',
      char_class: 'Gypsy',
      pin: '1234',
      confirm_pin: '1234',
    })

    nextResponse = () => res(409, JSON.stringify({ error: 'pin_already_set' }))
    await expect(requestClaim({ ...CLAIM_INPUT })).rejects.toMatchObject({
      status: 409,
      code: 'pin_already_set',
    })

    nextResponse = () => res(404, JSON.stringify({ error: 'not_registered' }))
    await expect(requestClaim({ ...CLAIM_INPUT })).rejects.toMatchObject({
      status: 404,
      code: 'not_registered',
    })

    nextResponse = () => res(200, JSON.stringify({ status: 'pending' }))
    await expect(requestClaim({ ...CLAIM_INPUT })).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })
})

describe('requestAccess — shape', () => {
  it('returns the pending request id', async () => {
    nextResponse = () => res(200, JSON.stringify({ request_id: 'req-1', status: 'pending' }))
    await expect(requestAccess(REQUEST_INPUT)).resolves.toEqual({
      request_id: 'req-1',
      status: 'pending',
    })
  })

  it('rejects a missing/empty request_id with invalid_response', async () => {
    nextResponse = () => res(200, JSON.stringify({ status: 'pending' }))
    await expect(requestAccess(REQUEST_INPUT)).rejects.toMatchObject({
      code: 'invalid_response',
    })

    nextResponse = () => res(200, JSON.stringify({ request_id: '', status: 'pending' }))
    await expect(requestAccess(REQUEST_INPUT)).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('maps 409 request_pending for the supersede flow', async () => {
    nextResponse = () => res(409, JSON.stringify({ error: 'request_pending' }))
    await expect(requestAccess(REQUEST_INPUT)).rejects.toMatchObject({
      status: 409,
      code: 'request_pending',
    })
  })

  it('maps 401 invalid_previous_pin with attempts remaining', async () => {
    nextResponse = () =>
      res(401, JSON.stringify({ error: 'invalid_previous_pin', attempts_remaining: 0 }))
    await expect(
      requestAccess({ ...REQUEST_INPUT, previous_pin: '0000' }),
    ).rejects.toMatchObject({ code: 'invalid_previous_pin', attemptsRemaining: 0 })
  })
})

describe('fetchRequestStatus — anon RPC, four keys only', () => {
  it('posts {p_handle} to /rest/v1/rpc/request_status with anon headers', async () => {
    nextResponse = () =>
      res(
        200,
        JSON.stringify({
          status: 'pending',
          request_type: 'member',
          created_at: '2026-10-21T12:00:00Z',
          decided_at: null,
        }),
      )
    await fetchRequestStatus('Ahrya')

    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/request_status')
    expect(calls[0].init.method).toBe('POST')
    expect(headers(calls[0]).apikey).toBe('test-anon-key')
    expect(headers(calls[0]).Authorization).toBe('Bearer test-anon-key')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ p_handle: 'Ahrya' })
  })

  it('returns null for an empty body and for JSON null (no request)', async () => {
    nextResponse = () => res(200, '')
    await expect(fetchRequestStatus('ahrya')).resolves.toBe(null)

    nextResponse = () => res(200, 'null')
    await expect(fetchRequestStatus('ahrya')).resolves.toBe(null)
  })

  it('returns exactly the four keys, dropping extras', async () => {
    nextResponse = () =>
      res(
        200,
        JSON.stringify({
          status: 'approved',
          request_type: 'prospect',
          created_at: '2026-10-20T10:00:00Z',
          decided_at: '2026-10-20T11:00:00Z',
          nickname: 'Ahrya',
          char_id: '32980',
        }),
      )
    const status = await fetchRequestStatus('ahrya')
    expect(status).toEqual({
      status: 'approved',
      request_type: 'prospect',
      created_at: '2026-10-20T10:00:00Z',
      decided_at: '2026-10-20T11:00:00Z',
    })
    expect(status !== null && Object.keys(status).sort()).toEqual([
      'created_at',
      'decided_at',
      'request_type',
      'status',
    ])
  })

  it('rejects an unknown status token as invalid_response', async () => {
    nextResponse = () =>
      res(
        200,
        JSON.stringify({
          status: 'maybe',
          request_type: 'member',
          created_at: '2026-10-20T10:00:00Z',
          decided_at: null,
        }),
      )
    await expect(fetchRequestStatus('ahrya')).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('rejects a non-string created_at as invalid_response', async () => {
    nextResponse = () =>
      res(
        200,
        JSON.stringify({
          status: 'pending',
          request_type: 'member',
          created_at: 123,
          decided_at: null,
        }),
      )
    await expect(fetchRequestStatus('ahrya')).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })
})

// 0017 repair: the step-up token is the ONLY way a role change can pass the
// RPC's step-up gate, so the wrapper's request shape and error mapping are
// pinned here.
describe('step-up re-PIN', () => {
  it('posts the PIN with the member session bearer and returns the token id', async () => {
    nextResponse = () => res(200, JSON.stringify({ token: 'tok-1' }))
    await expect(requestStepUp(SESSION, '1234')).resolves.toBe('tok-1')

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://test-project.supabase.co/functions/v1/step-up')
    expect(calls[0].init.method).toBe('POST')
    expect(headers(calls[0]).apikey).toBe('test-anon-key')
    // Unlike the anon surface, step-up presents the member's own session.
    expect(headers(calls[0]).Authorization).toBe(`Bearer ${SESSION.access_token}`)
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ pin: '1234' })
  })

  it('maps a wrong PIN to invalid_pin with remaining attempts', async () => {
    nextResponse = () =>
      res(401, JSON.stringify({ error: 'invalid_pin', attempts_remaining: 4 }))
    await expect(requestStepUp(SESSION, '0000')).rejects.toMatchObject({
      name: 'FunctionError',
      code: 'invalid_pin',
      status: 401,
      attemptsRemaining: 4,
    })
  })

  it('maps a lockout to locked with retry_after_seconds', async () => {
    nextResponse = () =>
      res(429, JSON.stringify({ error: 'locked', retry_after_seconds: 120 }))
    await expect(requestStepUp(SESSION, '1234')).rejects.toMatchObject({
      code: 'locked',
      status: 429,
      retryAfterSeconds: 120,
    })
  })

  it('rejects a 2xx without a token as invalid_response', async () => {
    nextResponse = () => res(200, JSON.stringify({ token: 42 }))
    await expect(requestStepUp(SESSION, '1234')).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('maps a fetch rejection to network', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    await expect(requestStepUp(SESSION, '1234')).rejects.toMatchObject({
      code: 'network',
      status: 0,
    })
  })
})
