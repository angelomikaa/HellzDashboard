import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NeoFootSession } from '../features/auth/session'
import {
  ApiError,
  createClass,
  createSubmission,
  fetchCatalog,
  fetchClasses,
  fetchClassTop5,
  fetchKeyStats,
  fetchMe,
  fetchMembers,
  fetchMyReport,
  fetchMySubmissions,
  setKeyStat,
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
    // fetchMe requires its own row; everything else accepts '[]' or the row body.
    nextResponse = () =>
      res(200, JSON.stringify([{ class_name: 'Assassin' }]))
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

  it('updateCharacter URL-encodes the id (interpolation hardening)', async () => {
    nextResponse = () => res(200, '')
    // A crafted id must not be able to inject PostgREST query operators.
    await updateCharacter(session, 'abc def/1', { char_class: 'Assassin' })
    expect(calls[0].url).toContain('/members?id=eq.abc%20def%2F1')
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

// Plan 03-04 task 1: client wrappers for the three 03-03 rank-engine
// endpoints. Contracts are the LIVE 0009 RPC shapes — exact param names
// (p_class/p_stat_key/p_enabled), and the staff-only REST read on
// class_key_stats (staff_select_key_stats policy; a member JWT simply gets
// [] from RLS, which is NOT an error).
describe('rank engine client functions (03-03 RPC contracts)', () => {
  it('fetchKeyStats reads class_key_stats with the encoded class filter and maps to string[]', async () => {
    nextResponse = () => res(200, JSON.stringify([{ stat_key: 'crit' }, { stat_key: 'atk' }]))
    const keys = await fetchKeyStats(session, 'Assassin')
    expect(calls[0].url).toBe(
      'https://test-project.supabase.co/rest/v1/class_key_stats?class_name=eq.Assassin&select=stat_key',
    )
    expect(calls[0].init.method).toBeUndefined() // GET
    expect(keys).toEqual(['crit', 'atk'])
  })

  it('fetchKeyStats URL-encodes the class name (interpolation hardening)', async () => {
    nextResponse = () => res(200, '[]')
    await fetchKeyStats(session, 'Soul Fighter') // space must not break the filter
    expect(calls[0].url).toContain(
      'class_key_stats?class_name=eq.Soul%20Fighter&select=stat_key',
    )
  })

  it('fetchKeyStats maps an RLS-empty member response to [] without throwing', async () => {
    nextResponse = () => res(200, '[]')
    await expect(fetchKeyStats(session, 'Assassin')).resolves.toEqual([])
  })

  it('setKeyStat posts the exact RPC param names and unwraps the returned count', async () => {
    nextResponse = () => res(200, JSON.stringify(4))
    const count = await setKeyStat(session, 'Assassin', 'crit', true)
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/set_key_stat')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      p_class: 'Assassin',
      p_stat_key: 'crit',
      p_enabled: true,
    })
    expect(count).toBe(4)
  })

  it('setKeyStat sends p_enabled false for a removal', async () => {
    nextResponse = () => res(200, JSON.stringify(5))
    await setKeyStat(session, 'Assassin', 'crit', false)
    expect(JSON.parse(calls[0].init.body as string).p_enabled).toBe(false)
  })

  it('fetchClassTop5 posts p_class and returns the row shape', async () => {
    const rows = [
      { display_name: 'Alpha', char_function: 'dps', ovr: 87 },
      { display_name: 'Beta', char_function: 'tank', ovr: null },
    ]
    nextResponse = () => res(200, JSON.stringify(rows))
    const top5 = await fetchClassTop5(session, 'Assassin')
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/class_top5')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ p_class: 'Assassin' })
    expect(top5).toEqual(rows)
  })

  it('surfaces a 400 key_stat_limit as ApiError kind server with the marker in the message', async () => {
    nextResponse = () => res(400, 'key_stat_limit')
    const err = await setKeyStat(session, 'Assassin', 'seventh', true).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(400)
    expect(err.kind).toBe('server')
    expect(err.message).toContain('key_stat_limit')
  })

  it('sends both gateway headers on every rank-engine call', async () => {
    nextResponse = () => res(200, '[]')
    await fetchKeyStats(session, 'Assassin')
    await setKeyStat(session, 'Assassin', 'crit', true)
    await fetchClassTop5(session, 'Assassin')
    for (const call of calls) {
      const headers = call.init.headers as Record<string, string>
      expect(headers.apikey).toBe('test-anon-key')
      expect(headers.Authorization).toBe('Bearer test-token')
    }
  })
})

// Plan 04-01 task 1: the Phase 4 member data contract. my_report() takes ZERO
// parameters (identity from the JWT only — T-03-11), so the wrapper posts an
// empty JSON body and unwraps the single jsonb object. RNK-02: the response
// carries no key-stat identity, and the client types cannot represent it.
describe('my_report client contract (Phase 4 data contract)', () => {
  it('fetchMyReport POSTs to /rpc/my_report with an empty JSON body and both gateway headers', async () => {
    nextResponse = () => res(200, '[]')
    await fetchMyReport(session)
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/my_report')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({})
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.apikey).toBe('test-anon-key')
    expect(headers.Authorization).toBe('Bearer test-token')
  })

  it('unwraps the returned jsonb object into the typed MyReport shape', async () => {
    const report = {
      char_class: 'Assassino',
      char_function: 'dps',
      stats: [
        {
          stat_key: 'crit',
          label: 'CRIT',
          group_name: 'quasi',
          value_type: 'flat',
          own_value: 1234,
          class_average: 1000,
          best: 9876,
          points: 72.5,
          data_sufficient: true,
        },
      ],
      ovr: { value: 87.4, data_sufficient: true },
    }
    nextResponse = () => res(200, JSON.stringify(report))
    await expect(fetchMyReport(session)).resolves.toEqual(report)
  })

  it('surfaces a 500 as ApiError kind server (shared restFetch error path)', async () => {
    nextResponse = () => res(500, 'boom')
    const err = await fetchMyReport(session).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(500)
    expect(err.kind).toBe('server')
  })
})
