import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FunctionError } from '../../lib/api'
import {
  CLASS_ERROR,
  HANDLE_ERROR,
  ID_ERROR,
  NETWORK_ERROR,
  NICKNAME_ERROR,
  PIN_ERROR,
  PIN_MISMATCH,
  REQUEST_ALREADY_PENDING,
  REQUEST_SENT,
  SERVER_REFUSED,
  STATUS_ERROR,
  canRequestClaim,
  canRequestRegistration,
  claimRequestInput,
  firstAccessProblem,
  firstAccessProblemMessage,
  registrationRequestInput,
  requestErrorCopy,
  statusBackToLogin,
  statusMessage,
  submitFirstAccessRequest,
  type FirstAccessDraft,
} from './firstAccess'
import { FirstAccessPage } from './FirstAccessPage'

// 0034 manual first access: the print is GONE. The player types the identity
// (handle, nick, ID, class) + PIN in one form and every first access becomes an
// officer-validated request — the admins carry the identity check until the
// Phase 11 Discord OAuth link replaces it.
const VALID: FirstAccessDraft = {
  handle: ' ahrya ',
  nickname: 'Ahrya',
  char_id: '32980',
  char_class: 'Gypsy',
  pin: '1234',
  confirmPin: '1234',
  status: 'ready',
}

const UNKNOWN: FirstAccessDraft = { ...VALID, status: 'unknown' }

describe('FirstAccessPage — structure (0034 manual fill)', () => {
  it('renders the typed identity fields and NO print capture', () => {
    const html = renderToStaticMarkup(
      <FirstAccessPage initialHandle="ahrya" onBack={() => {}} />,
    )
    expect(html).toContain('Primeiro acesso')
    expect(html).toContain('first-access-handle')
    expect(html).toContain('first-access-nickname')
    expect(html).toContain('first-access-char-id')
    expect(html).toContain('first-access-class')
    // The print/OCR era is over: no capture, no example, no OCR copy.
    expect(html).not.toContain('Comprovante')
    expect(html).not.toContain('type="file"')
    expect(html).not.toContain('Básico')
  })

  it('prefills the handle from the request-access probe', () => {
    const html = renderToStaticMarkup(
      <FirstAccessPage initialHandle="Ahrya#1234" onBack={() => {}} />,
    )
    expect(html).toContain('value="Ahrya#1234"')
  })

  it('has a back path and no auto-submit', () => {
    const html = renderToStaticMarkup(<FirstAccessPage onBack={() => {}} />)
    expect(html).toContain('Voltar')
    expect(html).not.toContain('type="submit" hidden')
  })
})

describe('registry status gates the flow', () => {
  it('only an unclaimed registry row offers the claim request', () => {
    expect(canRequestClaim('ready')).toBe(true)
    for (const status of [
      'pin_set',
      'pending',
      'unknown',
      'identity_mismatch',
      'ambiguous_identity',
      'handle_claimed',
      'handle_registered',
    ] as const) {
      expect(canRequestClaim(status)).toBe(false)
    }
    expect(canRequestClaim(null)).toBe(false)
  })

  it('only an unknown character offers the registration request', () => {
    expect(canRequestRegistration('unknown')).toBe(true)
    expect(canRequestRegistration('ready')).toBe(false)
    expect(canRequestRegistration(null)).toBe(false)
  })

  it('explains every status without minting anything', () => {
    expect(statusMessage('pin_set')).toContain('já tem PIN')
    expect(statusMessage('handle_claimed')).toContain('Discord já tem personagem com PIN')
    expect(statusMessage('pending')).toContain('Aguarde a decisão')
    expect(statusMessage('unknown')).toContain(
      'Será necessário a autorização de um oficial para concluir esse cadastro.',
    )
    expect(statusMessage('identity_mismatch')).toContain('não confere')
    expect(statusMessage('ambiguous_identity')).toContain('Mais de um cadastro')
    expect(statusMessage('ready')).toContain('um oficial vai confirmar')
  })

  it('offers the back-to-login affordance only for claimable logins', () => {
    expect(statusBackToLogin('pin_set')).toBe(true)
    expect(statusBackToLogin('handle_claimed')).toBe(true)
    expect(statusBackToLogin('ready')).toBe(false)
  })
})

describe('firstAccessProblem — blocking order (form order)', () => {
  it('accepts a complete draft for both paths', () => {
    expect(firstAccessProblem(VALID)).toBe(null)
    expect(firstAccessProblem(UNKNOWN)).toBe(null)
  })

  it('blocks each typed field in order', () => {
    expect(firstAccessProblem({ ...VALID, handle: '   ' })).toBe('handle')
    expect(firstAccessProblem({ ...VALID, handle: 'x'.repeat(65) })).toBe('handle')
    expect(firstAccessProblem({ ...VALID, nickname: '' })).toBe('nickname')
    expect(firstAccessProblem({ ...VALID, nickname: 'x'.repeat(81) })).toBe('nickname')
    expect(firstAccessProblem({ ...VALID, char_id: '12a4' })).toBe('char_id')
    expect(firstAccessProblem({ ...VALID, char_id: '' })).toBe('char_id')
    expect(firstAccessProblem({ ...VALID, char_class: 'não-existe' })).toBe('class')
    expect(firstAccessProblem({ ...VALID, char_class: '' })).toBe('class')
    expect(firstAccessProblem({ ...VALID, pin: '123' })).toBe('pin')
    expect(firstAccessProblem({ ...VALID, pin: '12a4' })).toBe('pin')
    expect(firstAccessProblem({ ...VALID, confirmPin: '4321' })).toBe('mismatch')
    expect(firstAccessProblemMessage('mismatch')).toContain('não conferem')
  })

  it('keeps every non-actionable registry answer blocked', () => {
    for (const status of [
      'pin_set',
      'pending',
      'identity_mismatch',
      'ambiguous_identity',
      'handle_claimed',
      'handle_registered',
      null,
    ] as const) {
      expect(firstAccessProblem({ ...VALID, status })).toBe('status')
    }
    expect(firstAccessProblemMessage('status')).toBe(STATUS_ERROR)
    expect(firstAccessProblemMessage('handle')).toBe(HANDLE_ERROR)
    expect(firstAccessProblemMessage('nickname')).toBe(NICKNAME_ERROR)
    expect(firstAccessProblemMessage('char_id')).toBe(ID_ERROR)
    expect(firstAccessProblemMessage('class')).toBe(CLASS_ERROR)
    expect(firstAccessProblemMessage('pin')).toBe(PIN_ERROR)
    expect(PIN_MISMATCH).toContain('não conferem')
  })
})

describe('submitFirstAccessRequest — officer-validated paths', () => {
  it('never reaches the server when a field blocks', async () => {
    const send = vi.fn(async () => ({ duplicate: false }))
    const outcome = await submitFirstAccessRequest({ ...VALID, pin: '12' }, { send })
    expect(outcome.ok).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('reports the pending duplicate without failing', async () => {
    const outcome = await submitFirstAccessRequest(VALID, {
      send: vi.fn(async () => ({ duplicate: true })),
    })
    expect(outcome).toEqual({ ok: true, duplicate: true })
    expect(REQUEST_ALREADY_PENDING).toContain('aguardando análise')
  })

  it('maps server refusals to pt-BR copy without leaking internals', () => {
    expect(requestErrorCopy(new FunctionError(409, 'pin_already_set', 'x'))).toContain('já tem PIN')
    expect(requestErrorCopy(new FunctionError(404, 'not_registered', 'x'))).toContain(
      'lista da guilda',
    )
    expect(requestErrorCopy(new FunctionError(409, 'handle_claimed', 'x'))).toContain(
      'outro personagem',
    )
    expect(requestErrorCopy(new FunctionError(409, 'identity_mismatch', 'x'))).toContain(
      'não confere',
    )
    expect(requestErrorCopy(new FunctionError(409, 'request_pending', 'x'))).toBe(
      REQUEST_ALREADY_PENDING,
    )
    expect(requestErrorCopy(new FunctionError(0, 'network', 'x'))).toBe(NETWORK_ERROR)
  })

  // A pre-0034 backend refuses every printless request with invalid_proof
  // before it reaches the registry (owner report 2026-10-26). That is a deploy
  // mismatch, not a player error: the copy must never dead-end, and an unknown
  // nickname must still be submittable — the officer is the check.
  it('keeps the unknown-name path submittable and every backend failure actionable', () => {
    expect(firstAccessProblem(UNKNOWN)).toBe(null)
    expect(requestErrorCopy(new FunctionError(400, 'invalid_proof', 'x'))).toBe(SERVER_REFUSED)
    expect(requestErrorCopy(new FunctionError(500, 'server_error', 'x'))).toBe(SERVER_REFUSED)
    expect(requestErrorCopy(new FunctionError(500, 'server_misconfigured', 'x'))).toBe(
      SERVER_REFUSED,
    )
    expect(requestErrorCopy(new FunctionError(418, 'never_seen', 'x'))).toBe(SERVER_REFUSED)
    expect(SERVER_REFUSED).toContain('avise um oficial')
    // Nothing internal leaks into the player-facing copy.
    for (const code of ['invalid_proof', 'server_error', 'never_seen']) {
      expect(requestErrorCopy(new FunctionError(500, code, 'internal detail'))).not.toContain(
        'internal detail',
      )
    }
  })

  it('a failed submit keeps the player on the page (no session)', async () => {
    const outcome = await submitFirstAccessRequest(VALID, {
      send: vi.fn(async () => {
        throw new FunctionError(500, 'server_error', 'x')
      }),
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.message).not.toContain('server_error')
  })

  it('the sent copy explains the login after the approval', () => {
    expect(REQUEST_SENT).toContain('Após a aprovação de um oficial')
    expect(REQUEST_SENT).toContain('nick e o PIN')
  })
})

describe('typed request payloads', () => {
  it('claim payload carries the trimmed identity + the PIN', () => {
    expect(claimRequestInput(VALID)).toEqual({
      discord_handle: 'ahrya',
      nickname: 'Ahrya',
      char_id: '32980',
      char_class: 'Gypsy',
      pin: '1234',
      confirm_pin: '1234',
    })
  })

  it('registration payload carries the same contract', () => {
    expect(registrationRequestInput(UNKNOWN)).toEqual({
      discord_handle: 'ahrya',
      nickname: 'Ahrya',
      char_id: '32980',
      char_class: 'Gypsy',
      pin: '1234',
      confirm_pin: '1234',
    })
  })
})
