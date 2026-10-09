import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NeoFootSession } from '../features/auth/session'
import {
  ApiError,
  createClass,
  createSubmission,
  fetchCatalog,
  fetchClasses,
  fetchMe,
  fetchMembers,
  fetchMySubmissions,
  updateCharacter,
} from './api'

// Plan 02-01 task 3: the REST data layer rides the proven 01-02 gateway
// contract — BOTH apikey and Authorization: Bearer <session.access_token>
// headers on every call. RLS reads identity from the JWT; the anon key alone
// returns nothing.

const session: NeoFootSession = {
  access_token: 'test-token',
  member_id: '11111111-1111-1111-1111-111111111111',
  display_name: 'TestMember',
  member_role: 'member',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
}

/** Minimal Response-like stub: restFetch uses ok, status, text(). */
function res(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => body }
}

let calls: { url: string; init: RequestInit }[] = []
let nextResponse: () => ReturnType<typeof res>

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test-project.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
  calls = []
  nextResponse = () => res(200, '[]')
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return nextResponse()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('REST client gateway contract (both headers, every call)', () => {
  it('sends apikey AND Authorization: Bearer <session.access_token> on every call', async () => {
    nextResponse = () => res(200, '[]')
    await fetchCatalog(session)
    await fetchClasses(session)
    await fetchMe(session)
    await fetchMembers(session)
    await fetchMySubmissions(session)
    await createClass(session, 'Ninja')
    await createSubmission(session, [{ stat_key: 'crit', value: 16 }])
    await updateCharacter(session, session.member_id, { char_class: 'Assassin' })

    expect(calls.length).toBe(8)
    for (const call of calls) {
      const headers = call.init.headers as Record<string, string>
      expect(headers.apikey).toBe('test-anon-key')
      expect(headers.Authorization).toBe('Bearer test-token')
      expect(call.url.startsWith('https://test-project.supabase.co/rest/v1')).toBe(true)
    }
  })

  it('targets the right paths and methods', async () => {
    nextResponse = () => res(200, '[]')
    await fetchCatalog(session)
    expect(calls[0].url).toBe(
      'https://test-project.supabase.co/rest/v1/stat_catalog?select=stat_key,label,group_name,value_type&order=stat_key',
    )

    await createSubmission(session, [{ stat_key: 'crit', value: 16 }])
    expect(calls[1].url).toBe('https://test-project.supabase.co/rest/v1/rpc/create_submission')
    expect(calls[1].init.method).toBe('POST')

    await updateCharacter(session, session.member_id, { char_class: 'Assassin' })
    expect(calls[2].url).toBe(
      `https://test-project.supabase.co/rest/v1/members?id=eq.${session.member_id}`,
    )
    expect(calls[2].init.method).toBe('PATCH')
  })

  it('parses catalog entries and maps classes to string[]', async () => {
    nextResponse = () =>
      res(
        200,
        JSON.stringify([{ stat_key: 'crit', label: 'CRIT', group_name: 'quasi', value_type: 'flat' }]),
      )
    const catalog = await fetchCatalog(session)
    expect(catalog).toEqual([{ stat_key: 'crit', label: 'CRIT', group_name: 'quasi', value_type: 'flat' }])

    nextResponse = () => res(200, JSON.stringify([{ class_name: 'Assassin' }, { class_name: 'Knight' }]))
    const classes = await fetchClasses(session)
    expect(classes).toEqual(['Assassin', 'Knight'])
  })

  it('unwraps the uuid from create_submission', async () => {
    nextResponse = () => res(200, JSON.stringify('22222222-2222-2222-2222-222222222222'))
    const uuid = await createSubmission(session, [{ stat_key: 'crit', value: 16 }])
    expect(uuid).toBe('22222222-2222-2222-2222-222222222222')
  })
})

describe('REST client error handling', () => {
  it('throws ApiError with .status on non-2xx (server)', async () => {
    nextResponse = () => res(500, 'boom')
    const err = await fetchCatalog(session).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(500)
    expect(err.kind).toBe('server')
  })

  it('marks 401 as kind unauthorized', async () => {
    nextResponse = () => res(401, 'unauthorized')
    const err = await fetchMe(session).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.kind).toBe('unauthorized')
  })

  it('marks network failures as kind network', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    const err = await fetchMembers(session).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe('network')
  })
})
