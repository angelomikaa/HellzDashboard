import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FunctionError, type RequestAccessInput, type RequestStatus } from '../../lib/api'
import { RequestAccessPage } from './RequestAccessPage'
import { RequestStatusPage } from './RequestStatusPage'
import {
  buildMemberRequest,
  formatRequestDate,
  prefillIdentity,
  prospectDraftFrom,
  requestErrorCopy,
  requestFormProblem,
  requestProblemMessage,
  statusView,
  submitMemberRequest,
  type MemberRequestDeps,
  type RequestFormDraft,
} from './requestFlow'

const VALID: RequestFormDraft = {
  handle: ' ahrya ',
  pin: '1234',
  confirmPin: '1234',
  char_id: '32980',
  nickname: 'Ahrya',
  char_class: 'Gypsy',
  charFunction: 'dps',
  proofDataUrl: 'data:image/jpeg;base64,AAAA',
}

function deps(overrides?: Partial<MemberRequestDeps>): MemberRequestDeps {
  return {
    requestAccess: vi.fn(async () => ({ request_id: 'req-1', status: 'pending' as const })),
    ...overrides,
  }
}

function status(overrides: Partial<RequestStatus> = {}): RequestStatus {
  return {
    status: 'pending',
    request_type: 'member',
    created_at: '2026-10-21T12:00:00Z',
    decided_at: null,
    ...overrides,
  }
}

// Plan 08-03 task 4 (D-06/D-11): both entrances, member submission without
// stats, supersede retry with previous_pin, prospect handoff and the
// identity-free status lookup.
describe('RequestAccessPage — chooser structure', () => {
  it('offers both loops and the one-sitting warning', () => {
    const html = renderToStaticMarkup(
      <RequestAccessPage onBack={() => {}} onStartApplication={() => {}} />,
    )
    expect(html).toContain('Já sou da guilda')
    expect(html).toContain('Quero entrar na guilda')
    expect(html).toContain(
      'O envio de status precisa ser concluído de uma vez; nada é salvo antes do envio final.',
    )
    expect(html).toContain('Consultar solicitação')
    // The identity form is behind a choice — not rendered on the chooser.
    expect(html).not.toContain('request-char-id')
  })
})

describe('requestFormProblem — shared identity form', () => {
  it('accepts a complete member draft', () => {
    expect(requestFormProblem(VALID)).toBe(null)
  })

  it('blocks handle, PIN, mismatch, proof and identity in order', () => {
    expect(requestFormProblem({ ...VALID, handle: '  ' })).toBe('handle')
    expect(requestFormProblem({ ...VALID, pin: '12' })).toBe('pin')
    expect(requestFormProblem({ ...VALID, confirmPin: '0000' })).toBe('mismatch')
    expect(requestFormProblem({ ...VALID, proofDataUrl: null })).toBe('proof')
    expect(requestFormProblem({ ...VALID, charFunction: '' })).toBe('char_function')
    expect(requestFormProblem({ ...VALID, char_id: 'abc' })).toBe('char_id')
    expect(requestFormProblem({ ...VALID, nickname: '' })).toBe('nickname')
    expect(requestFormProblem({ ...VALID, char_class: 'Ninja' })).toBe('char_class')
  })

  it('has pt-BR copy for each problem', () => {
    expect(requestProblemMessage('proof')).toContain('print')
    expect(requestProblemMessage('char_function')).toContain('função')
  })
})

describe('OCR prefill never overwrites an edited field', () => {
  const read = { char_id: '32980', nickname: 'Ahrya', char_class: 'Gypsy' }

  it('fills all untouched fields', () => {
    expect(
      prefillIdentity({ char_id: '', nickname: '', char_class: '' }, read, {}),
    ).toEqual(read)
  })

  it('keeps a touched nickname but fills the rest', () => {
    expect(
      prefillIdentity({ char_id: '', nickname: 'MeuNick', char_class: '' }, read, {
        nickname: true,
      }),
    ).toEqual({ char_id: '32980', nickname: 'MeuNick', char_class: 'Gypsy' })
  })

  it('leaves everything alone when OCR read nothing', () => {
    const current = { char_id: '1', nickname: 'N', char_class: 'Gypsy' }
    expect(
      prefillIdentity(current, { char_id: null, nickname: null, char_class: null }, {}),
    ).toEqual(current)
  })
})

describe('member submission — request_type member, no stats', () => {
  it('builds the member payload without stats', () => {
    const payload = buildMemberRequest(VALID)
    expect(payload).toMatchObject({
      discord_handle: 'ahrya',
      request_type: 'member',
      char_id: '32980',
      nickname: 'Ahrya',
      char_class: 'Gypsy',
      char_function: 'dps',
    })
    expect('stats' in payload).toBe(false)
    expect('previous_pin' in payload).toBe(false)
  })

  it('calls requestAccess once and returns the pending id', async () => {
    const d = deps()
    await expect(submitMemberRequest(VALID, d)).resolves.toEqual({
      ok: true,
      requestId: 'req-1',
    })
    expect(d.requestAccess).toHaveBeenCalledTimes(1)
    expect(d.requestAccess).toHaveBeenCalledWith(buildMemberRequest(VALID))
    expect((d.requestAccess as ReturnType<typeof vi.fn>).mock.calls[0][0].stats).toBe(undefined)
  })

  it('blocks invalid drafts before any network call', async () => {
    const d = deps()
    const outcome = await submitMemberRequest({ ...VALID, proofDataUrl: null }, d)
    expect(outcome).toMatchObject({ ok: false, problem: 'proof' })
    expect(d.requestAccess).not.toHaveBeenCalled()
  })
})

describe('supersede flow (D-11)', () => {
  it('409 request_pending asks for the previous PIN and keeps the fields', async () => {
    const d = deps({
      requestAccess: vi.fn(async () => {
        throw new FunctionError(409, 'request_pending', 'request_pending')
      }),
    })
    const outcome = await submitMemberRequest(VALID, d)
    expect(outcome).toMatchObject({
      ok: false,
      problem: 'setup',
      needsPreviousPin: true,
      clearPreviousPin: false,
    })
    expect(outcome.ok === false && outcome.message).toContain('PIN dela para substituir')
  })

  it('retry carries previous_pin and drops nothing else', async () => {
    const d = deps()
    const outcome = await submitMemberRequest(VALID, d, '9876')
    expect(outcome).toEqual({ ok: true, requestId: 'req-1' })
    const sent = (d.requestAccess as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as RequestAccessInput
    expect(sent.previous_pin).toBe('9876')
    expect(sent.request_type).toBe('member')
    expect(sent.char_id).toBe('32980')
  })

  it('401 invalid_previous_pin clears only the previous PIN', async () => {
    const error = new FunctionError(401, 'invalid_previous_pin', 'x', { attemptsRemaining: 2 })
    const copy = requestErrorCopy(error)
    expect(copy.needsPreviousPin).toBe(true)
    expect(copy.clearPreviousPin).toBe(true)
    expect(copy.message).toContain('2 tentativas restantes')
  })

  it('maps duplicate_char_id inline and locked to minutes', () => {
    expect(requestErrorCopy(new FunctionError(400, 'duplicate_char_id', 'x')).message).toContain(
      'ID já está cadastrado',
    )
    expect(
      requestErrorCopy(new FunctionError(429, 'locked', 'x', { retryAfterSeconds: 120 })).message,
    ).toContain('2 minutos')
  })
})

describe('prospect handoff — never submits directly', () => {
  it('builds the full draft with no stats and the chosen function', () => {
    const draft = prospectDraftFrom({ ...VALID, charFunction: 'suporte' })
    expect(draft).toEqual({
      handle: 'ahrya',
      pin: '1234',
      char_id: '32980',
      nickname: 'Ahrya',
      char_class: 'Gypsy',
      char_function: 'suporte',
      proof_data_url: 'data:image/jpeg;base64,AAAA',
    })
    expect('stats' in draft).toBe(false)
    expect('request_type' in draft).toBe(false)
  })
})

describe('RequestStatusPage — status/type/dates only', () => {
  it('renders handle lookup with no identity fields', () => {
    const html = renderToStaticMarkup(
      <RequestStatusPage initialHandle="ahrya" onBack={() => {}} />,
    )
    expect(html).toContain('status-handle')
    expect(html).toContain('Consultar')
    expect(html).not.toContain('char_id')
    expect(html).not.toContain('nickname')
    expect(html).not.toContain('Prévia')
  })

  it('shows pending and the none state', () => {
    expect(statusView(status()).title).toBe('Solicitação pendente')
    expect(statusView(status()).detail).toContain('Aguarde um oficial')

    const none = statusView(null)
    expect(none.title).toBe('Nenhuma solicitação encontrada')
    expect(none.detail).toContain('Nenhuma solicitação')
  })

  it('shows approved/rejected with decision date, and superseded', () => {
    const approved = statusView(
      status({ status: 'approved', decided_at: '2026-10-22T12:00:00Z' }),
    )
    expect(approved.title).toBe('Solicitação aprovada')
    expect(approved.detail).toContain('decidida em')

    expect(statusView(status({ status: 'rejected' })).title).toBe('Solicitação rejeitada')
    expect(statusView(status({ status: 'superseded' })).title).toBe('Solicitação substituída')
  })

  it('formats dates as pt-BR day/month/year and survives junk', () => {
    expect(formatRequestDate('2026-10-21T12:00:00Z')).toBe('21/10/2026')
    expect(formatRequestDate('not-a-date')).toBe('—')
  })
})
