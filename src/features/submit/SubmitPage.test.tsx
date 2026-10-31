// Plan 08-04 task 1: identity capture on the member submit path.
//
// The repo ships node-env Vitest only (no DOM): component behavior is tested
// through the exported pure gates/handlers, and the network wrappers through a
// fetch stub — the same pattern as api.test.ts / RequestAccessPage.test.tsx.
// Coverage: mandatory identity gate, OCR prefill that never overwrites a
// typed field, the shared OCR applier, p_identity on create_submission and
// the anonymous catalog read.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NeoFootSession } from '../auth/session'
import {
  ApiError,
  createSubmission,
  fetchPublicCatalog,
  type StatCatalogEntry,
} from '../../lib/api'
import type { OcrFieldOutcome } from './ocr'
import { applyOcrOutcomes } from './ocr/apply'
import type { SubmissionIdentity } from './identity'
import { prefillIdentity } from '../request/requestFlow'
import {
  DUPLICATE_CHAR_ID_COPY,
  identitySubmitBlock,
  submitErrorFor,
} from './SubmitPage'

const session: NeoFootSession = {
  access_token: 'test-token',
  member_id: '11111111-1111-1111-1111-111111111111',
  display_name: 'TestMember',
  member_role: 'member',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
}

const IDENTITY: SubmissionIdentity = {
  char_id: '32980',
  nickname: 'Ahrya',
  char_class: 'Gypsy',
  char_function: 'dps',
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

describe('identitySubmitBlock — ID/Nick are mandatory before Enviar', () => {
  it('accepts a complete identity', () => {
    expect(identitySubmitBlock(IDENTITY)).toBe(null)
  })

  it('blocks with the first offending field in visual order', () => {
    expect(identitySubmitBlock({ ...IDENTITY, char_id: '' })).toMatchObject({ field: 'char_id' })
    expect(identitySubmitBlock({ ...IDENTITY, char_id: 'abc' })).toMatchObject({
      field: 'char_id',
    })
    expect(identitySubmitBlock({ ...IDENTITY, nickname: '  ' })).toMatchObject({
      field: 'nickname',
    })
    expect(identitySubmitBlock({ ...IDENTITY, char_class: 'Ninja' })).toMatchObject({
      field: 'char_class',
    })
  })

  it('never lets a 13-digit ID through (same rule as create_submission)', () => {
    expect(identitySubmitBlock({ ...IDENTITY, char_id: '1234567890123' })).toMatchObject({
      field: 'char_id',
    })
    expect(identitySubmitBlock({ ...IDENTITY, char_id: '123456789012' })).toBe(null)
  })
})

describe('submitErrorFor — duplicate ID stays inline, wizard state kept', () => {
  it('maps duplicate_char_id to the char_id field with pt-BR copy', () => {
    const mapped = submitErrorFor(
      new ApiError(500, 'server', 'HTTP 500: {"message":"duplicate_char_id"}'),
    )
    expect(mapped).toEqual({ field: 'char_id', message: DUPLICATE_CHAR_ID_COPY })
    expect(DUPLICATE_CHAR_ID_COPY).toContain('ID já está cadastrado')
  })

  it('maps unknown_class to the class field', () => {
    expect(
      submitErrorFor(new ApiError(500, 'server', 'HTTP 500: {"message":"unknown_class"}')),
    ).toMatchObject({ field: 'char_class' })
  })

  it('keeps the safe generic copy for anything else', () => {
    const mapped = submitErrorFor(new ApiError(0, 'network', 'network error'))
    expect(mapped.field).toBe(undefined)
    expect(mapped.message).toContain('Não foi possível enviar')
  })
})

describe('profile prefill — human edits always win (D-06 parity)', () => {
  const read = { char_id: '32980', nickname: 'Ahrya', char_class: 'Gypsy' }

  it('fills only untouched fields', () => {
    const prefilled = prefillIdentity(
      { char_id: '', nickname: 'MeuNick', char_class: 'Gypsy' },
      read,
      { nickname: true },
    )
    expect(prefilled).toEqual({ char_id: '32980', nickname: 'MeuNick', char_class: 'Gypsy' })
  })

  it('a failed/empty profile read changes nothing', () => {
    const current = { char_id: '1', nickname: 'N', char_class: 'Gypsy' }
    expect(
      prefillIdentity(current, { char_id: null, nickname: null, char_class: null }, {}),
    ).toEqual(current)
  })
})

describe('applyOcrOutcomes — one read replaces exactly its step', () => {
  const outcomes: OcrFieldOutcome[] = [
    { stat_key: 'patk', status: 'filled', raw: '1.234', value: 1234 },
    { stat_key: 'pdef', status: 'failed' },
  ]

  it('writes every displayed key and reports filled/failed', () => {
    const writes: Array<[string, string]> = []
    const result = applyOcrOutcomes(['patk', 'pdef'], outcomes, (key, raw) => {
      writes.push([key, raw])
    })
    expect(writes).toEqual([
      ['patk', '1.234'],
      ['pdef', ''],
    ])
    expect([...result.filled]).toEqual(['patk'])
    expect([...result.failed]).toEqual(['pdef'])
  })

  it('never touches a key displayed by another step', () => {
    const writes: Array<[string, string]> = []
    applyOcrOutcomes(
      ['patk'],
      [...outcomes, { stat_key: 'crit', status: 'filled', raw: '10', value: 10 }],
      (key, raw) => {
        writes.push([key, raw])
      },
    )
    expect(writes).toEqual([['patk', '1.234']])
  })
})

describe('createSubmission — p_identity with the typed values', () => {
  it('sends the validated identity object', async () => {
    nextResponse = () => res(200, JSON.stringify('22222222-2222-2222-2222-222222222222'))
    await createSubmission(session, [{ stat_key: 'crit', value: 16 }], IDENTITY)
    const body = JSON.parse(calls[0].init.body as string)
    expect(body.p_stats).toEqual([{ stat_key: 'crit', value: 16 }])
    expect(body.p_identity).toEqual(IDENTITY)
  })

  it('old call sites still compile and send p_identity null', async () => {
    nextResponse = () => res(200, JSON.stringify('22222222-2222-2222-2222-222222222222'))
    await createSubmission(session, [{ stat_key: 'crit', value: 16 }])
    const body = JSON.parse(calls[0].init.body as string)
    expect(body.p_identity).toBe(null)
    expect(body.p_provenance).toBe(null)
  })

  it('sends the OCR audit trail as p_provenance (0046)', async () => {
    nextResponse = () => res(200, JSON.stringify('22222222-2222-2222-2222-222222222222'))
    await createSubmission(session, [{ stat_key: 'pdef', value: 5200 }], IDENTITY, [
      { input_key: 'pdef', source: 'ocr_edited', ocr_value: 4100, final_value: 5200 },
    ])
    const body = JSON.parse(calls[0].init.body as string)
    expect(body.p_provenance).toEqual([
      { input_key: 'pdef', source: 'ocr_edited', ocr_value: 4100, final_value: 5200 },
    ])
  })
})

describe('fetchPublicCatalog — anon label projection only', () => {
  it('reads the five public columns with the anon bearer', async () => {
    const rows: StatCatalogEntry[] = [
      {
        stat_key: 'patk',
        label: 'ATQ FÍSICO',
        label_short: 'PAT',
        group_name: 'general',
        value_type: 'flat',
      },
    ]
    nextResponse = () => res(200, JSON.stringify(rows))
    await expect(fetchPublicCatalog()).resolves.toEqual(rows)
    expect(calls[0].url).toBe(
      'https://test-project.supabase.co/rest/v1/stat_catalog?select=stat_key,label,label_short,group_name,value_type&order=stat_key',
    )
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.apikey).toBe('test-anon-key')
    expect(headers.Authorization).toBe('Bearer test-anon-key')
  })

  it('maps an empty 2xx body to [] and throws ApiError on failure', async () => {
    nextResponse = () => res(200, '')
    await expect(fetchPublicCatalog()).resolves.toEqual([])

    nextResponse = () => res(503, 'unavailable')
    const error = await fetchPublicCatalog().catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(503)
  })
})

import { AntiCheatWarnings } from './AntiCheatWarnings'

describe('AntiCheatWarnings render', () => {
  it('renders a curve warning without throwing', () => {
    const html = renderToStaticMarkup(
      <AntiCheatWarnings
        warnings={[
          {
            stat_key: 'rpdef',
            label: 'RPDEF',
            value_type: 'flat',
            value: 9000,
            median: 3900,
            mad: 100,
            z: 4.1,
            sample_size: 6,
          },
        ]}
      />,
    )
    expect(html).toContain('RPDEF')
    expect(html).toContain('4,1σ')
  })
})