import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NeoFootSession } from '../features/auth/session'
import {
  ApiError,
  addMember,
  approveRequest,
  correctIdentity,
  createSubmission,
  deleteIdentityProof,
  fetchCatalog,
  fetchClasses,
  fetchClassTop5,
  fetchIdentityHistory,
  fetchIdentityProof,
  fetchIdentityQueue,
  fetchKeyStats,
  fetchMyReport,
  fetchMySubmissions,
  fetchStaffMembers,
  fetchStaffRequests,
  asLineupsPayload,
  fetchLineups,
  setLineupPartyLabel,
  setLineupSlot,
  rejectRequest,
  resetMemberPin,
  reviewIdentity,
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
    nextResponse = () =>
      res(200, JSON.stringify([{ class_name: 'Assassin' }]))
    await fetchCatalog(session)
    await fetchClasses(session)
    await fetchMySubmissions(session)
    await createSubmission(session, [{ stat_key: 'crit', value: 16 }])
    await updateCharacter(session, session.member_id, { char_class: 'Assassin' })

    expect(calls.length).toBe(5)
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
      'https://test-project.supabase.co/rest/v1/stat_catalog?select=stat_key,label,label_short,group_name,value_type&order=stat_key',
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

  it('fetchCatalog maps an empty 2xx body to [] (parseBody guard)', async () => {
    nextResponse = () => res(200, '')
    await expect(fetchCatalog(session)).resolves.toEqual([])
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
    const err = await fetchMyReport(session).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.kind).toBe('unauthorized')
  })

  it('marks network failures as kind network', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    const err = await fetchMySubmissions(session).catch((e) => e)
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
      'https://test-project.supabase.co/rest/v1/class_key_stats?class_name=eq.Assassin&select=stat_key,selection_order&order=selection_order',
    )
    expect(calls[0].init.method).toBeUndefined() // GET
    expect(keys).toEqual(['crit', 'atk'])
  })

  it('fetchKeyStats URL-encodes the class name (interpolation hardening)', async () => {
    nextResponse = () => res(200, '[]')
    await fetchKeyStats(session, 'Soul Fighter') // space must not break the filter
    expect(calls[0].url).toContain(
      'class_key_stats?class_name=eq.Soul%20Fighter&select=stat_key,selection_order&order=selection_order',
    )
  })

  it('fetchKeyStats includes char_function filter when a build role is supplied', async () => {
    nextResponse = () => res(200, JSON.stringify([{ stat_key: 'crit' }]))
    await fetchKeyStats(session, 'Assassin', 'dps')
    expect(calls[0].url).toContain(
      'class_key_stats?class_name=eq.Assassin&select=stat_key,selection_order&order=selection_order&char_function=eq.dps',
    )
  })

  it('fetchKeyStats maps an RLS-empty member response to [] without throwing', async () => {
    nextResponse = () => res(200, '[]')
    await expect(fetchKeyStats(session, 'Assassin')).resolves.toEqual([])
  })

  it('setKeyStat posts to set_key_stat_v2 with p_class/p_function/p_stat_key/p_enabled and unwraps the count', async () => {
    nextResponse = () => res(200, JSON.stringify(4))
    const count = await setKeyStat(session, 'Assassin', 'dps', 'crit', true)
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/set_key_stat_v2')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      p_class: 'Assassin',
      p_function: 'dps',
      p_stat_key: 'crit',
      p_enabled: true,
    })
    expect(count).toBe(4)
  })

  it('setKeyStat sends p_enabled false for a removal', async () => {
    nextResponse = () => res(200, JSON.stringify(5))
    await setKeyStat(session, 'Assassin', 'mdps', 'crit', false)
    expect(JSON.parse(calls[0].init.body as string).p_enabled).toBe(false)
  })

  it('fetchClassTop5 posts p_class and returns the row shape', async () => {
    const rows = [
      { display_name: 'Alpha', char_function: 'dps', ovr: 87 },
      { display_name: 'Beta', char_function: 'suporte', ovr: null },
    ]
    nextResponse = () => res(200, JSON.stringify(rows))
    const top5 = await fetchClassTop5(session, 'Assassin')
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/class_top5')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ p_class: 'Assassin' })
    expect(top5).toEqual(rows)
  })

  it('surfaces a 400 unknown_function as ApiError kind server with the marker in the message', async () => {
    nextResponse = () => res(400, 'unknown_function')
    const err = await setKeyStat(session, 'Assassin', 'dps', 'seventh', true).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(400)
    expect(err.kind).toBe('server')
    expect(err.message).toContain('unknown_function')
  })

  it('sends both gateway headers on every rank-engine call', async () => {
    nextResponse = () => res(200, '[]')
    await fetchKeyStats(session, 'Assassin')
    await setKeyStat(session, 'Assassin', 'dps', 'crit', true)
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
    // Minimal VALID report shape — the WR-03 malformed-response guard now
    // rejects empty/array bodies, so this request-level fixture must satisfy it.
    nextResponse = () =>
      res(
        200,
        JSON.stringify({
          char_class: null,
          char_function: 'dps',
          stats: [],
          ovr: { value: null, data_sufficient: false },
        }),
      )
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

  it('throws ApiError kind server on an empty 2xx body (malformed-response guard)', async () => {
    nextResponse = () => res(200, '') // RPC returning NULL -> empty body
    const err = await fetchMyReport(session).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe('server')
    expect(err.message).toContain('malformed my_report response')
  })

  it('throws ApiError kind server when stats is not an array (malformed-response guard)', async () => {
    nextResponse = () =>
      res(
        200,
        JSON.stringify({
          char_class: 'Assassino',
          char_function: 'dps',
          ovr: { value: null, data_sufficient: false },
        }),
      )
    const err = await fetchMyReport(session).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe('server')
    expect(err.message).toContain('malformed my_report response')
  })
})

// Plan 08-05 task 1: the Phase 8 staff surface wrappers. Every call is an
// RPC-only POST with the exact 0014 parameter names; list wrappers reject a
// malformed (non-array) payload; PIN material never appears in any request.
describe('Phase 8 staff API wrappers (0014 RPC census)', () => {
  it('fetchStaffMembers posts an empty body and validates the array shape', async () => {
    const rows = [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        discord_handle: 'ahrya',
        display_name: 'Ahrya',
        role: 'member',
        active: true,
        char_class: 'Gypsy',
        char_function: 'dps',
        char_id: '32980',
        pin_set: false,
        claimed_at: null,
        has_pending_proof: true,
        identity: null,
      },
    ]
    nextResponse = () => res(200, JSON.stringify(rows))
    await expect(fetchStaffMembers(session)).resolves.toEqual(rows)
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/staff_members')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({})
  })

  it('list wrappers throw ApiError on a non-array payload (broken deploy)', async () => {
    nextResponse = () => res(200, JSON.stringify({ not: 'an array' }))
    const err = await fetchStaffMembers(session).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe('server')
    expect(err.message).toContain('malformed staff_members response')

    nextResponse = () => res(200, '')
    await expect(fetchIdentityQueue(session)).rejects.toThrow(/malformed staff_identity_queue/)
    await expect(fetchStaffRequests(session)).rejects.toThrow(/malformed staff_requests/)
    await expect(fetchIdentityHistory(session, session.member_id)).rejects.toThrow(
      /malformed staff_identity_history/,
    )
  })

  it('addMember sends p_handle/p_display_name and unwraps the member id', async () => {
    nextResponse = () => res(200, JSON.stringify('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'))
    await expect(addMember(session, ' ahrya ', ' Ahrya ')).resolves.toBe(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    )
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/add_member')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      p_handle: ' ahrya ',
      p_display_name: ' Ahrya ',
    })

    nextResponse = () => res(200, '')
    await expect(addMember(session, 'x', 'X')).rejects.toThrow(/malformed add_member/)
  })

  it('resetMemberPin sends only p_member (never a PIN or hash)', async () => {
    nextResponse = () => res(200, '')
    await resetMemberPin(session, 'cccccccc-cccc-cccc-cccc-cccccccccccc')
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/reset_member_pin')
    const body = JSON.parse(calls[0].init.body as string)
    expect(body).toEqual({ p_member: 'cccccccc-cccc-cccc-cccc-cccccccccccc' })
    expect(JSON.stringify(body)).not.toContain('pin_hash')
    expect(JSON.stringify(body)).not.toContain('p_pin')
  })

  it('reviewIdentity sends the boolean decision', async () => {
    nextResponse = () => res(200, '')
    await reviewIdentity(session, 'dddddddd-dddd-dddd-dddd-dddddddddddd', true)
    await reviewIdentity(session, 'dddddddd-dddd-dddd-dddd-dddddddddddd', false)
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/review_identity')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      p_proof: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      p_confirm: true,
    })
    expect(JSON.parse(calls[1].init.body as string).p_confirm).toBe(false)
  })

  it('approveRequest sends the chosen function and unwraps the member id', async () => {
    nextResponse = () => res(200, JSON.stringify('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'))
    await expect(
      approveRequest(session, 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'suporte'),
    ).resolves.toBe('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/approve_request')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      p_request: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      p_function: 'suporte',
    })

    nextResponse = () => res(200, '')
    await expect(
      approveRequest(session, 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'dps'),
    ).rejects.toThrow(/malformed approve_request/)
  })

  it('rejectRequest sends only p_request', async () => {
    nextResponse = () => res(200, '')
    await rejectRequest(session, 'ffffffff-ffff-ffff-ffff-ffffffffffff')
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/reject_request')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      p_request: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    })
  })

  it('correctIdentity sends the five 0014 parameter keys', async () => {
    nextResponse = () => res(200, '')
    await correctIdentity(session, session.member_id, {
      char_id: '32980',
      nickname: 'Ahrya',
      char_class: 'Gypsy',
      char_function: 'mdps',
    })
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/correct_identity')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      p_member: session.member_id,
      p_char_id: '32980',
      p_nickname: 'Ahrya',
      p_char_class: 'Gypsy',
      p_char_function: 'mdps',
    })
  })

  it('fetchIdentityHistory scopes to the member', async () => {
    nextResponse = () => res(200, JSON.stringify([]))
    await fetchIdentityHistory(session, session.member_id)
    expect(calls[0].url).toBe(
      'https://test-project.supabase.co/rest/v1/rpc/staff_identity_history',
    )
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ p_member: session.member_id })
  })
})

const lineupPayload = {
  battlefields: [
    {
      battlefield: 'vigrid_field',
      parties: [
        {
          party_index: 1,
          role_label: null,
          filled: 1,
          slots: [
            { slot_index: 1, member_id: 'm1', display_name: 'Lanaya', char_class: 'Bard', char_function: 'dps' },
            { slot_index: 2, member_id: null, display_name: null, char_class: null, char_function: null },
          ],
        },
      ],
    },
    { battlefield: 'ruinscape', parties: [] },
  ],
  roster: [{ member_id: 'm1', display_name: 'Lanaya', char_class: 'Bard', char_function: 'dps' }],
}

describe('lineup RPC wrappers (phase 10.4, LNUP-01..03)', () => {
  it('fetchLineups POSTs /rpc/get_lineups with both gateway headers and returns the validated payload', async () => {
    nextResponse = () => res(200, JSON.stringify(lineupPayload))
    const payload = await fetchLineups(session)
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/get_lineups')
    expect(calls[0].init.method).toBe('POST')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.apikey).toBe('test-anon-key')
    expect(headers.Authorization).toBe('Bearer test-token')
    expect(payload.battlefields[0].battlefield).toBe('vigrid_field')
    expect(payload.roster[0].display_name).toBe('Lanaya')
  })

  it('setLineupSlot sends the p_* body and passes null through for a clear', async () => {
    nextResponse = () => res(200, JSON.stringify(lineupPayload))
    await setLineupSlot(session, 'vigrid_field', 3, 2, 'm1')
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/set_lineup_slot')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      p_battlefield: 'vigrid_field',
      p_party: 3,
      p_slot: 2,
      p_member: 'm1',
    })

    await setLineupSlot(session, 'ruinscape', 1, 5, null)
    expect(JSON.parse(calls[1].init.body as string)).toEqual({
      p_battlefield: 'ruinscape',
      p_party: 1,
      p_slot: 5,
      p_member: null,
    })
  })

  it('setLineupPartyLabel POSTs the label body and maps server errors to ApiError', async () => {
    nextResponse = () => res(200, JSON.stringify(lineupPayload))
    await setLineupPartyLabel(session, 'ruinscape', 4, 'MOBS CIMA/BAIXO')
    expect(calls[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/set_lineup_party_label')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      p_battlefield: 'ruinscape',
      p_party: 4,
      p_label: 'MOBS CIMA/BAIXO',
    })

    nextResponse = () => res(500, 'invalid_lineup_label')
    await expect(setLineupPartyLabel(session, 'ruinscape', 4, 'x')).rejects.toBeInstanceOf(ApiError)
  })

  it('asLineupsPayload rejects a malformed or unknown-battlefield payload', () => {
    expect(() => asLineupsPayload(null)).toThrow(ApiError)
    expect(() => asLineupsPayload({ battlefields: [], roster: 'no' })).toThrow(ApiError)
    expect(() =>
      asLineupsPayload({ battlefields: [{ battlefield: 'mars', parties: [] }], roster: [] }),
    ).toThrow(ApiError)
    expect(asLineupsPayload(lineupPayload).roster).toHaveLength(1)
  })
})

describe('identity proof storage helpers (private bucket, staff-only)', () => {
  it('fetchIdentityProof reads the authenticated object route and degrades to null on any failure', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['jpeg']),
    }))
    const blob = await fetchIdentityProof(session, 'claims/abc/1.jpg')
    expect(blob).toBeInstanceOf(Blob)

    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }))
    await expect(fetchIdentityProof(session, 'claims/abc/1.jpg')).resolves.toBeNull()
    await expect(fetchIdentityProof(session, '../nope')).resolves.toBeNull()
  })

  it('deleteIdentityProof DELETEs the object route and treats 404 as success', async () => {
    nextResponse = () => res(200, '')
    await deleteIdentityProof(session, 'claims/abc/1.jpg')
    expect(calls[0].url).toBe(
      'https://test-project.supabase.co/storage/v1/object/identity-proofs/claims/abc/1.jpg',
    )
    expect(calls[0].init.method).toBe('DELETE')

    nextResponse = () => res(404, 'not found')
    await expect(deleteIdentityProof(session, 'claims/abc/1.jpg')).resolves.toBeUndefined()

    nextResponse = () => res(500, 'boom')
    await expect(deleteIdentityProof(session, 'claims/abc/1.jpg')).rejects.toBeInstanceOf(ApiError)
    // An unsafe key never issues a request.
    const before = calls.length
    await deleteIdentityProof(session, '../escape')
    expect(calls.length).toBe(before)
  })
})
