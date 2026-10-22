// First-access claim logic (08-03 task 3, D-03).
//
// PURE orchestration: the page is a thin renderer over these functions, so the
// rules that matter (no typed identity, no guessing when OCR is incomplete, one
// save, one onDone) are unit-testable in the node test environment.
import type { NeoFootSession } from './session'
import { FunctionError, type SetupPinInput } from '../../lib/api'
import type { BasicProfileFields } from '../submit/identity'

export const HANDLE_ERROR = 'Informe seu usuário do Discord.'
export const PIN_ERROR = 'Informe um PIN de 4 dígitos.'
export const PIN_MISMATCH = 'Os PINs não conferem.'
export const PROOF_ERROR = 'Envie o print do personagem.'
export const PROFILE_ERROR = 'Não conseguimos ler o ID, o nick e a classe. Envie outro print.'
export const NETWORK_ERROR = 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'

/** pt-BR natural list: ['o ID', 'a classe'] -> "o ID e a classe". */
function joinPt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

/**
 * Retry copy for an incomplete OCR profile that names exactly what is missing
 * (08.10): the generic PROFILE_ERROR claimed the ID, nick AND class all failed
 * even when only the class was unreadable — which is what a pt-BR client
 * produced before the localized labels were supported. Kept pure so the page
 * stays a thin renderer.
 */
export function profileProblemMessage(profile: BasicProfileFields | null): string {
  if (profile === null) return PROFILE_ERROR
  const missing: string[] = []
  if (!profile.char_id) missing.push('o ID')
  if (!profile.nickname) missing.push('o nick')
  if (!profile.char_class) missing.push('a classe')
  if (missing.length === 0 || missing.length === 3) return PROFILE_ERROR
  return `Não conseguimos ler ${joinPt(missing)} no print. Envie outro print.`
}

export interface FirstAccessDraft {
  handle: string
  pin: string
  confirmPin: string
  /** OCR result for the selected proof (null until read / unreadable). */
  profile: BasicProfileFields | null
  proofDataUrl: string | null
}

export type FirstAccessProblem =
  | 'handle'
  | 'pin'
  | 'mismatch'
  | 'proof'
  | 'profile'

/** The first blocking problem in form order, or null when submittable. */
export function firstAccessProblem(draft: FirstAccessDraft): FirstAccessProblem | null {
  if (draft.handle.trim() === '' || draft.handle.trim().length > 64) return 'handle'
  if (!/^\d{4}$/.test(draft.pin)) return 'pin'
  if (draft.confirmPin !== draft.pin) return 'mismatch'
  if (draft.proofDataUrl === null) return 'proof'
  if (!profileComplete(draft.profile)) return 'profile'
  return null
}

/** pt-BR copy for a blocking problem. */
export function firstAccessProblemMessage(problem: FirstAccessProblem): string {
  switch (problem) {
    case 'handle':
      return HANDLE_ERROR
    case 'pin':
      return PIN_ERROR
    case 'mismatch':
      return PIN_MISMATCH
    case 'proof':
      return PROOF_ERROR
    case 'profile':
      return PROFILE_ERROR
  }
}

/** All three identity fields readable (D-03: never guess a missing one). */
export function profileComplete(profile: BasicProfileFields | null): profile is {
  nickname: string
  char_id: string
  char_class: string
} {
  return (
    profile !== null &&
    typeof profile.nickname === 'string' &&
    profile.nickname.length > 0 &&
    typeof profile.char_id === 'string' &&
    profile.char_id.length > 0 &&
    typeof profile.char_class === 'string' &&
    profile.char_class.length > 0
  )
}

/** "ID 32980 · Ahrya · Gypsy" — the read-only claim identity evidence. */
export function profileSummary(profile: BasicProfileFields | null): string | null {
  if (!profileComplete(profile)) return null
  return `ID ${profile.char_id} · ${profile.nickname} · ${profile.char_class}`
}

export interface SetupErrorCopy {
  message: string
  /** The PIN boxes are cleared (wrong/locked/consumed credentials). */
  clearPin: boolean
  /** Offer the "Voltar para o login" action (handle already has a PIN). */
  backToLogin: boolean
}

/** Server machine token -> pt-BR copy (never leaks internals). */
export function setupErrorCopy(error: FunctionError): SetupErrorCopy {
  switch (error.code) {
    case 'pin_already_set':
      return {
        message: 'PIN já criado. Volte e entre com seu PIN.',
        clearPin: true,
        backToLogin: true,
      }
    case 'duplicate_char_id':
      return {
        message: 'Este ID já está cadastrado. Se o personagem é seu, fale com um oficial.',
        clearPin: false,
        backToLogin: false,
      }
    case 'unknown_class':
      return {
        message: 'A classe lida não foi reconhecida. Envie outro print.',
        clearPin: false,
        backToLogin: false,
      }
    case 'proof_too_large':
      return {
        message: 'Comprovante muito grande (máx. 2 MB).',
        clearPin: false,
        backToLogin: false,
      }
    case 'invalid_credentials': {
      const remaining = error.attemptsRemaining
      const message =
        typeof remaining === 'number' && remaining > 0
          ? remaining === 1
            ? 'Discord ou PIN incorreto — 1 tentativa restante.'
            : `Discord ou PIN incorreto — ${remaining} tentativas restantes.`
          : 'Discord ou PIN incorreto.'
      return { message, clearPin: true, backToLogin: false }
    }
    case 'locked': {
      const seconds = error.retryAfterSeconds
      const minutes =
        typeof seconds === 'number' && seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 1
      return {
        message: `Muitas tentativas incorretas. Tente novamente em ${minutes} minutos.`,
        clearPin: true,
        backToLogin: false,
      }
    }
    case 'network':
      return { message: NETWORK_ERROR, clearPin: false, backToLogin: false }
    default:
      return {
        message: 'Não foi possível concluir o primeiro acesso. Tente novamente.',
        clearPin: false,
        backToLogin: false,
      }
  }
}

export type FirstAccessOutcome =
  | { ok: true; session: NeoFootSession }
  | { ok: false; problem: FirstAccessProblem | 'setup'; message: string; clearPin: boolean; backToLogin: boolean }

export interface FirstAccessDeps {
  setupPin: (input: SetupPinInput) => Promise<NeoFootSession>
  saveSession: (session: NeoFootSession) => void
}

/**
 * Validate -> POST setup-pin with the OCR-derived identity -> persist the
 * session exactly once. The caller invokes onDone only when `ok` (so a
 * failure can never advance the guard).
 */
export async function submitFirstAccess(
  draft: FirstAccessDraft,
  deps: FirstAccessDeps,
): Promise<FirstAccessOutcome> {
  const problem = firstAccessProblem(draft)
  if (problem !== null) {
    return {
      ok: false,
      problem,
      message: firstAccessProblemMessage(problem),
      clearPin: false,
      backToLogin: false,
    }
  }
  // firstAccessProblem guarantees these are non-null strings.
  const profile = draft.profile as { nickname: string; char_id: string; char_class: string }
  try {
    const session = await deps.setupPin({
      discord_handle: draft.handle.trim(),
      pin: draft.pin,
      confirm_pin: draft.confirmPin,
      char_id: profile.char_id,
      nickname: profile.nickname,
      char_class: profile.char_class,
      proof_data_url: draft.proofDataUrl as string,
    })
    deps.saveSession(session)
    return { ok: true, session }
  } catch (err) {
    if (err instanceof FunctionError) {
      return { ok: false, problem: 'setup', ...setupErrorCopy(err) }
    }
    return {
      ok: false,
      problem: 'setup',
      message: NETWORK_ERROR,
      clearPin: false,
      backToLogin: false,
    }
  }
}
