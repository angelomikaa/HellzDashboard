import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NeoFootSession } from '../features/auth/session'
import {
  FunctionError,
  fetchRequestStatus,
  requestAccess,
  setupPin,
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

const SETUP_INPUT = {
  discord_handle: 'ahrya',
  pin: '1234',
  confirm_pin: '1234',
  char_id: '32980',
  nickname: 'Ahrya',
  char_class: 'Gypsy',
  proof_data_url: 'data:image/jpeg;base64,AAAA',
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
    await setupPin(SETUP_INPUT)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://test-project.supabase.co/functions/v1/setup-pin')
    expect(calls[0].init.method).toBe('POST')
    expect(headers(calls[0]).apikey).toBe('test-anon-key')
    expect(headers(calls[0]).Authorization).toBe('Bearer test-anon-key')
    expect(headers(calls[0])['Content-Type']).toBe('application/json')
    expect(JSON.parse(String(calls[0].init.body))).toEqual(SETUP_INPUT)
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
    await expect(setupPin(SETUP_INPUT)).rejects.toMatchObject({
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
    await expect(setupPin(SETUP_INPUT)).rejects.toMatchObject({
      name: 'FunctionError',
      code: 'network',
      status: 0,
    })
  })
})

describe('setupPin — session contract', () => {
  it('returns the validated session', async () => {
    await expect(setupPin(SETUP_INPUT)).resolves.toEqual(SESSION)
  })

  it('rejects a malformed 200 session with invalid_response', async () => {
    nextResponse = () => res(200, JSON.stringify({ session: { access_token: 'x' } }))
    const error = await setupPin(SETUP_INPUT).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(FunctionError)
    expect(error).toMatchObject({ status: 200, code: 'invalid_response' })
  })

  it('rejects a 200 without a session key', async () => {
    nextResponse = () => res(200, JSON.stringify({ member_id: 'x' }))
    await expect(setupPin(SETUP_INPUT)).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('maps 409 pin_already_set to the machine token', async () => {
    nextResponse = () => res(409, JSON.stringify({ error: 'pin_already_set' }))
    await expect(setupPin(SETUP_INPUT)).rejects.toMatchObject({
      status: 409,
      code: 'pin_already_set',
    })
  })

  it('maps 401 attempts_remaining onto FunctionError', async () => {
    nextResponse = () =>
      res(401, JSON.stringify({ error: 'invalid_credentials', attempts_remaining: 2 }))
    const error = await setupPin(SETUP_INPUT).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(FunctionError)
    expect(error).toMatchObject({
      status: 401,
      code: 'invalid_credentials',
      attemptsRemaining: 2,
    })
  })

  it('maps 429 locked retry_after_seconds onto FunctionError', async () => {
    nextResponse = () =>
      res(429, JSON.stringify({ error: 'locked', retry_after_seconds: 240 }))
    const error = await setupPin(SETUP_INPUT).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(FunctionError)
    expect(error).toMatchObject({ status: 429, code: 'locked', retryAfterSeconds: 240 })
  })

  it('falls back to server_error for a non-JSON error body', async () => {
    nextResponse = () => res(500, '<html>bad gateway</html>')
    await expect(setupPin(SETUP_INPUT)).rejects.toMatchObject({
      status: 500,
      code: 'server_error',
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
