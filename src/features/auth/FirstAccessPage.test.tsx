import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FunctionError } from '../../lib/api'
import type { NeoFootSession } from './session'
import {
  PROFILE_ERROR,
  firstAccessProblem,
  firstAccessProblemMessage,
  profileComplete,
  profileSummary,
  setupErrorCopy,
  submitFirstAccess,
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
}

function deps(overrides?: Partial<FirstAccessDeps>): FirstAccessDeps {
  return {
    setupPin: vi.fn(async () => SESSION),
    saveSession: vi.fn(),
    ...overrides,
  }
}

// Plan 08-03 task 3 (D-03): identity comes ONLY from the screenshot, and the
// claim is blocked — not guessed — when OCR is incomplete. Node-env tests
// cover the pure submit orchestration; static markup proves there is no typed
// identity field.
describe('FirstAccessPage — structure (D-03)', () => {
  it('collects only handle + PIN + confirmation + proof (no typed identity)', () => {
    const html = renderToStaticMarkup(
      <FirstAccessPage initialHandle="ahrya" onDone={() => {}} onBack={() => {}} />,
    )
    expect(html).toContain('Primeiro acesso')
    expect(html).toContain('first-access-handle')
    expect(html).toContain('PIN (4 dígitos)')
    expect(html).toContain('Confirme o PIN')
    expect(html).toContain('Comprovante (print do personagem, JPEG)')
    expect(html).toContain('Criar meu PIN')
    // No typed char_id/nickname/class inputs anywhere on the claim screen.
    expect(html).not.toContain('id="char_id"')
    expect(html).not.toContain('id="nickname"')
    expect(html).not.toContain('id="char_class"')
    expect(html).not.toContain('<select')
  })

  it('prefills the handle from the login screen', () => {
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

describe('firstAccessProblem — submit blocking order', () => {
  it('accepts a complete draft', () => {
    expect(firstAccessProblem(VALID)).toBe(null)
  })

  it('blocks an empty or over-long handle', () => {
    expect(firstAccessProblem({ ...VALID, handle: '   ' })).toBe('handle')
    expect(firstAccessProblem({ ...VALID, handle: 'x'.repeat(65) })).toBe('handle')
  })

  it('blocks a non-4-digit PIN and a mismatch', () => {
    expect(firstAccessProblem({ ...VALID, pin: '123' })).toBe('pin')
    expect(firstAccessProblem({ ...VALID, pin: '12a4' })).toBe('pin')
    expect(firstAccessProblem({ ...VALID, confirmPin: '4321' })).toBe('mismatch')
  })

  it('blocks a missing proof and an incomplete OCR profile', () => {
    expect(firstAccessProblem({ ...VALID, proofDataUrl: null })).toBe('proof')
    expect(firstAccessProblem({ ...VALID, profile: null })).toBe('profile')
    expect(
      firstAccessProblem({ ...VALID, profile: { ...READ_PROFILE, char_class: null } }),
    ).toBe('profile')
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

  it('sends the OCR-derived identity (never typed values) and saves once', async () => {
    const d = deps()
    const outcome = await submitFirstAccess(VALID, d)

    expect(outcome).toEqual({ ok: true, session: SESSION })
    expect(d.setupPin).toHaveBeenCalledTimes(1)
    expect(d.setupPin).toHaveBeenCalledWith({
      discord_handle: 'ahrya',
      pin: '1234',
      confirm_pin: '1234',
      char_id: '32980',
      nickname: 'Ahrya',
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
