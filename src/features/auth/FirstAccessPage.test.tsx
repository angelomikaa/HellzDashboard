import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FunctionError } from '../../lib/api'
import type { NeoFootSession } from './session'
import {
  CLAIM_ALREADY_SENT,
  CLAIM_SENT,
  PROFILE_ERROR,
  REQUEST_ALREADY_PENDING,
  canRequestClaim,
  canRequestRegistration,
  canSetPin,
  claimErrorCopy,
  claimProblem,
  firstAccessProblem,
  firstAccessProblemMessage,
  profileComplete,
  profileProblemMessage,
  profileSummary,
  registrationErrorCopy,
  registrationProblem,
  setupErrorCopy,
  statusMessage,
  statusBackToLogin,
  submitClaim,
  submitFirstAccess,
  submitRegistration,
  type FirstAccessDeps,
  type FirstAccessDraft,
} from './firstAccess'
import { FirstAccessPage } from './FirstAccessPage'

const SESSION: NeoFootSession = {
  access_token: 'jwt',
  member_id: '11111111-1111-1111-1111-111111111111',
  display_name: 'Ahrya',
  member_role: 'member',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
}

const READ_PROFILE = { nickname: 'Ahrya', char_id: '32980', char_class: 'Gypsy' }

const VALID: FirstAccessDraft = {
  handle: ' ahrya ',
  pin: '1234',
  confirmPin: '1234',
  profile: READ_PROFILE,
  proofDataUrl: 'data:image/jpeg;base64,AAAA',
  status: 'ready',
}

function deps(overrides?: Partial<FirstAccessDeps>): FirstAccessDeps {
  return {
    setupPin: vi.fn(async () => SESSION),
    saveSession: vi.fn(),
    ...overrides,
  }
}

// Phase 10 (owner decision 2026-10-23): the print is the identity. The first
// paint collects handle + print only; the PIN boxes appear once the registry
// answers `ready` for the read nickname.
describe('FirstAccessPage — structure (Phase 10)', () => {
  it('starts with handle + print only (no typed identity, no PIN yet)', () => {
    const html = renderToStaticMarkup(
      <FirstAccessPage initialHandle="ahrya" onDone={() => {}} onBack={() => {}} />,
    )
    expect(html).toContain('Primeiro acesso')
    expect(html).toContain('first-access-handle')
    expect(html).toContain('Comprovante (print do personagem)')
    // The PIN setter is gated by the registry lookup, never shown upfront.
    expect(html).not.toContain('PIN (4 dígitos)')
    expect(html).not.toContain('Criar meu PIN')
    // No typed char_id/nickname/class inputs anywhere on the claim screen.
    expect(html).not.toContain('id="char_id"')
    expect(html).not.toContain('id="nickname"')
    expect(html).not.toContain('id="char_class"')
    expect(html).not.toContain('<select')
  })

  it('prefills the handle from the request-access probe', () => {
    const html = renderToStaticMarkup(
      <FirstAccessPage initialHandle="Ahrya#1234" onDone={() => {}} onBack={() => {}} />,
    )
    expect(html).toContain('value="Ahrya#1234"')
  })

  it('has a back path and no auto-submit', () => {
    const html = renderToStaticMarkup(
      <FirstAccessPage onDone={() => {}} onBack={() => {}} />,
    )
    expect(html).toContain('Voltar')
    expect(html).not.toContain('type="submit" hidden')
  })
})

describe('registry status gates the flow', () => {
  it('only a claimable row opens the PIN setter', () => {
    expect(canSetPin('ready')).toBe(true)
    for (const status of ['pin_set', 'pending', 'unknown', 'identity_mismatch', 'ambiguous_identity'] as const) {
      expect(canSetPin(status)).toBe(false)
    }
    expect(canSetPin(null)).toBe(false)
  })

  it('only an unknown nickname can become a registration request', () => {
    expect(canRequestRegistration('unknown')).toBe(true)
    expect(canRequestRegistration('ready')).toBe(false)
    expect(canRequestRegistration('pending')).toBe(false)
    expect(canRequestRegistration(null)).toBe(false)
  })

  // 0032 stopgap: the print is public data, so an unclaimed row whose claim no
  // officer authorized never opens the PIN setter.
  it('a print-only claim needs an officer before the PIN setter', () => {
    expect(canSetPin('claim_review')).toBe(false)
    expect(canSetPin('claim_pending')).toBe(false)
    expect(canRequestClaim('claim_review')).toBe(true)
    expect(canRequestClaim('claim_pending')).toBe(false)
    expect(canRequestClaim('ready')).toBe(false)
    expect(canRequestClaim(null)).toBe(false)
    expect(statusMessage('claim_review')).toContain('confirmação de um oficial')
    expect(statusMessage('claim_pending')).toContain('Aguarde a confirmação')
  })

  it('explains every non-ready status without asking for a PIN', () => {
    expect(statusMessage('pin_set')).toContain('já tem PIN')
    expect(statusMessage('handle_claimed')).toContain('Discord já tem personagem com PIN')
    expect(statusMessage('handle_registered')).toContain('nick do print não confere')
    expect(statusMessage('pending')).toContain('aprovação')
    expect(statusMessage('unknown')).toContain('lista da guilda')
    expect(statusMessage('identity_mismatch')).toContain('não confere')
    expect(statusMessage('ambiguous_identity')).toContain('Mais de um cadastro')
  })

  it('refuses the PIN system for a handle that already has one', () => {
    for (const status of ['handle_claimed', 'handle_registered'] as const) {
      expect(canSetPin(status)).toBe(false)
      expect(canRequestRegistration(status)).toBe(false)
    }
    // Claimed handles go straight back to the login.
    expect(statusBackToLogin('handle_claimed')).toBe(true)
    expect(statusBackToLogin('handle_registered')).toBe(false)
  })
})

describe('firstAccessProblem — submit blocking order', () => {
  it('accepts a complete claim draft', () => {
    expect(firstAccessProblem(VALID)).toBe(null)
  })

  it('blocks a missing proof and an incomplete OCR profile', () => {
    expect(firstAccessProblem({ ...VALID, proofDataUrl: null })).toBe('proof')
    expect(firstAccessProblem({ ...VALID, profile: null })).toBe('profile')
    expect(
      firstAccessProblem({ ...VALID, profile: { ...READ_PROFILE, char_class: null } }),
    ).toBe('profile')
  })

  it('blocks a non-4-digit PIN and a mismatch when the row is claimable', () => {
    expect(firstAccessProblem({ ...VALID, pin: '123' })).toBe('pin')
    expect(firstAccessProblem({ ...VALID, pin: '12a4' })).toBe('pin')
    expect(firstAccessProblem({ ...VALID, confirmPin: '4321' })).toBe('mismatch')
  })

  it('never asks the claim path for a Discord handle', () => {
    expect(firstAccessProblem({ ...VALID, handle: '   ' })).toBe(null)
  })

  it('keeps the PIN setter closed for a non-claimable registry answer', () => {
    for (const status of [
      'unknown',
      'claim_review',
      'claim_pending',
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
    expect(firstAccessProblemMessage('status')).toContain('Verifique o personagem')
  })

  it('requires the handle only for the registration request', () => {
    const unknown = { ...VALID, status: 'unknown' as const }
    expect(registrationProblem({ ...unknown, handle: '   ' })).toBe('handle')
    expect(registrationProblem({ ...unknown, handle: 'x'.repeat(65) })).toBe('handle')
    expect(registrationProblem(unknown)).toBe(null)
    expect(registrationProblem({ ...unknown, proofDataUrl: null })).toBe('proof')
    expect(registrationProblem({ ...unknown, profile: null })).toBe('profile')
    // A registration request never validates PIN digits.
    expect(registrationProblem({ ...unknown, handle: 'ahrya' })).toBe(null)
  })

  it('uses the retry copy for an unreadable profile', () => {
    expect(firstAccessProblemMessage('profile')).toBe(PROFILE_ERROR)
    expect(firstAccessProblemMessage('mismatch')).toContain('não conferem')
  })

  it('profileSummary formats the read-only evidence', () => {
    expect(profileSummary(READ_PROFILE)).toBe('ID 32980 · Ahrya · Gypsy')
    expect(profileSummary({ ...READ_PROFILE, nickname: null })).toBe(null)
    expect(profileComplete({ ...READ_PROFILE, char_id: null })).toBe(false)
  })
})

describe('submitFirstAccess — mocked setupPin', () => {
  it('never calls setupPin when the PIN confirmation differs', async () => {
    const d = deps()
    const outcome = await submitFirstAccess({ ...VALID, confirmPin: '0000' }, d)
    expect(outcome).toMatchObject({ ok: false, problem: 'mismatch' })
    expect(d.setupPin).not.toHaveBeenCalled()
    expect(d.saveSession).not.toHaveBeenCalled()
  })

  it('never calls setupPin when the OCR profile is incomplete', async () => {
    const d = deps()
    const outcome = await submitFirstAccess({ ...VALID, profile: null }, d)
    expect(outcome).toMatchObject({ ok: false, problem: 'profile', message: PROFILE_ERROR })
    expect(d.setupPin).not.toHaveBeenCalled()
  })

  it('sends the OCR-derived identity keyed by nickname (never typed values) and saves once', async () => {
    const d = deps()
    const outcome = await submitFirstAccess(VALID, d)

    expect(outcome).toEqual({ ok: true, session: SESSION })
    expect(d.setupPin).toHaveBeenCalledTimes(1)
    expect(d.setupPin).toHaveBeenCalledWith({
      nickname: 'Ahrya',
      pin: '1234',
      confirm_pin: '1234',
      char_id: '32980',
      char_class: 'Gypsy',
      proof_data_url: 'data:image/jpeg;base64,AAAA',
    })
    expect(d.saveSession).toHaveBeenCalledTimes(1)
    expect(d.saveSession).toHaveBeenCalledWith(SESSION)
  })

  it('maps 409 pin_already_set to copy plus the back-to-login affordance', async () => {
    const d = deps({
      setupPin: vi.fn(async () => {
        throw new FunctionError(409, 'pin_already_set', 'pin_already_set')
      }),
    })
    const outcome = await submitFirstAccess(VALID, d)
    expect(outcome).toMatchObject({ ok: false, problem: 'setup', backToLogin: true })
    expect(outcome.ok === false && outcome.message).toContain('PIN já criado')
    expect(d.saveSession).not.toHaveBeenCalled()
  })

  it('maps 401 attempts remaining and 429 lockout to user copy', async () => {
    const wrong = await submitFirstAccess(
      VALID,
      deps({
        setupPin: vi.fn(async () => {
          throw new FunctionError(401, 'invalid_credentials', 'x', { attemptsRemaining: 1 })
        }),
      }),
    )
    expect(wrong.ok === false && wrong.message).toContain('1 tentativa restante')
    expect(wrong.ok === false && wrong.clearPin).toBe(true)

    const locked = await submitFirstAccess(
      VALID,
      deps({
        setupPin: vi.fn(async () => {
          throw new FunctionError(429, 'locked', 'x', { retryAfterSeconds: 240 })
        }),
      }),
    )
    expect(locked.ok === false && locked.message).toContain('4 minutos')
  })

  it('maps duplicate_char_id and unknown_class to inline copy', () => {
    expect(
      setupErrorCopy(new FunctionError(400, 'duplicate_char_id', 'x')).message,
    ).toContain('ID já está cadastrado')
    expect(setupErrorCopy(new FunctionError(400, 'unknown_class', 'x')).message).toContain(
      'classe lida',
    )
  })

  it('maps a network failure without leaking internals', async () => {
    const outcome = await submitFirstAccess(
      VALID,
      deps({
        setupPin: vi.fn(async () => {
          throw new Error('ECONNREFUSED 10.0.0.5:443')
        }),
      }),
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.message).toContain('conexão')
    expect(outcome.ok === false && outcome.message).not.toContain('ECONNREFUSED')
  })
})

// Phase 10: a print with no registry match becomes an officer-approved
// registration request. It must never mint a session or ask for a PIN.
describe('submitRegistration — officer approval path', () => {
  const UNKNOWN: FirstAccessDraft = { ...VALID, status: 'unknown' }

  function registrationDeps(result?: { request_id: string; status: 'pending'; duplicate: boolean }) {
    return {
      requestFirstAccess: vi.fn(async () => result ?? {
        request_id: '22222222-2222-2222-2222-222222222222',
        status: 'pending' as const,
        duplicate: false,
      }),
    }
  }

  it('sends handle + print identity and never a PIN', async () => {
    const d = registrationDeps()
    const outcome = await submitRegistration(UNKNOWN, d)

    expect(outcome).toMatchObject({ ok: true, duplicate: false })
    expect(d.requestFirstAccess).toHaveBeenCalledWith({
      discord_handle: 'ahrya',
      char_id: '32980',
      nickname: 'Ahrya',
      char_class: 'Gypsy',
      proof_data_url: 'data:image/jpeg;base64,AAAA',
    })
  })

  it('blocks without a handle before reaching the server', async () => {
    const d = registrationDeps()
    const outcome = await submitRegistration({ ...UNKNOWN, handle: '  ' }, d)
    expect(outcome.ok).toBe(false)
    expect(d.requestFirstAccess).not.toHaveBeenCalled()
  })

  it('reports a duplicate pending request without failing', async () => {
    const d = registrationDeps({
      request_id: '22222222-2222-2222-2222-222222222222',
      status: 'pending',
      duplicate: true,
    })
    const outcome = await submitRegistration(UNKNOWN, d)
    expect(outcome).toMatchObject({ ok: true, duplicate: true })
    expect(REQUEST_ALREADY_PENDING).toContain('aguardando aprovação')
  })

  it('maps server refusals to pt-BR copy', async () => {
    expect(registrationErrorCopy(new FunctionError(409, 'already_registered', 'x'))).toContain(
      'já está cadastrado',
    )
    expect(registrationErrorCopy(new FunctionError(400, 'unknown_class', 'x'))).toContain(
      'classe lida',
    )
    expect(registrationErrorCopy(new FunctionError(409, 'request_pending', 'x'))).toBe(
      REQUEST_ALREADY_PENDING,
    )
    expect(registrationErrorCopy(new FunctionError(0, 'network', 'x'))).toContain('conexão')
  })

  it('a failed request never advances the guard', async () => {
    const outcome = await submitRegistration(UNKNOWN, {
      requestFirstAccess: vi.fn(async () => {
        throw new FunctionError(500, 'server_error', 'x')
      }),
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.message).not.toContain('server_error')
  })
})

// 0032 stopgap: an unclaimed registry row whose claim no officer authorized
// yet. The print is queued for officer confirmation — never a PIN, never a
// typed handle (the registry row holds the authoritative one).
describe('submitClaim — officer authorization path (0032)', () => {
  const CLAIM: FirstAccessDraft = { ...VALID, status: 'claim_review' }

  function claimDeps(result?: { status: 'pending'; duplicate: boolean }) {
    return {
      requestClaim: vi.fn(async () => result ?? { status: 'pending' as const, duplicate: false }),
    }
  }

  it('sends the print identity only — no PIN and no typed handle', async () => {
    const d = claimDeps()
    const outcome = await submitClaim(CLAIM, d)

    expect(outcome).toEqual({ ok: true, duplicate: false })
    expect(d.requestClaim).toHaveBeenCalledWith({
      char_id: '32980',
      nickname: 'Ahrya',
      char_class: 'Gypsy',
      proof_data_url: 'data:image/jpeg;base64,AAAA',
    })
  })

  it('blocks without a proof or a complete profile before the server', async () => {
    const d = claimDeps()
    const noProof = await submitClaim({ ...CLAIM, proofDataUrl: null }, d)
    expect(noProof.ok).toBe(false)
    expect(claimProblem({ ...CLAIM, proofDataUrl: null })).toBe('proof')
    expect(claimProblem({ ...CLAIM, profile: null })).toBe('profile')
    expect(d.requestClaim).not.toHaveBeenCalled()
  })

  it('reports a re-sent print without failing', async () => {
    const outcome = await submitClaim(CLAIM, claimDeps({ status: 'pending', duplicate: true }))
    expect(outcome).toMatchObject({ ok: true, duplicate: true })
    expect(CLAIM_SENT).toContain('Aguarde a confirmação')
    expect(CLAIM_ALREADY_SENT).toContain('aguardando confirmação')
  })

  it('maps server refusals to pt-BR copy', async () => {
    expect(claimErrorCopy(new FunctionError(409, 'already_authorized', 'x'))).toContain(
      'já autorizou',
    )
    expect(claimErrorCopy(new FunctionError(404, 'not_registered', 'x'))).toContain(
      'lista da guilda',
    )
    expect(claimErrorCopy(new FunctionError(409, 'identity_mismatch', 'x'))).toContain(
      'não confere',
    )
    expect(claimErrorCopy(new FunctionError(0, 'network', 'x'))).toContain('conexão')
  })

  it('a failed claim never advances the guard', async () => {
    const outcome = await submitClaim(CLAIM, {
      requestClaim: vi.fn(async () => {
        throw new FunctionError(500, 'server_error', 'x')
      }),
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.message).not.toContain('server_error')
  })

  it('a setup-pin refusal for a missing authorization asks for a new print', () => {
    const copy = setupErrorCopy(new FunctionError(409, 'claim_not_authorized', 'x'))
    expect(copy.message).toContain('confirmação de um oficial')
    expect(copy.clearPin).toBe(true)
  })
})

// 08.10 hotfix: the old copy claimed the ID, nick AND class failed when only the
// class was unreadable (the pt-BR client case), sending players to re-shoot a
// perfectly good print.
describe('profileProblemMessage — field-specific retry copy', () => {
  it('names exactly the missing field(s)', () => {
    expect(profileProblemMessage({ ...READ_PROFILE, char_class: null })).toBe(
      'Não conseguimos ler a classe no print. Envie outro print.',
    )
    expect(profileProblemMessage({ ...READ_PROFILE, nickname: null })).toBe(
      'Não conseguimos ler o nick no print. Envie outro print.',
    )
    expect(profileProblemMessage({ ...READ_PROFILE, char_id: null })).toBe(
      'Não conseguimos ler o ID no print. Envie outro print.',
    )
    expect(profileProblemMessage({ ...READ_PROFILE, nickname: null, char_class: null })).toBe(
      'Não conseguimos ler o nick e a classe no print. Envie outro print.',
    )
  })

  it('falls back to the canonical copy when nothing was read', () => {
    expect(profileProblemMessage(null)).toBe(PROFILE_ERROR)
    expect(profileProblemMessage({ nickname: null, char_id: null, char_class: null })).toBe(
      PROFILE_ERROR,
    )
  })
})
