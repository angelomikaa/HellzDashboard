// First-access claim logic (08-03 task 3, D-03; Phase 10 reproject).
//
// PURE orchestration: the page is a thin renderer over these functions, so the
// rules that matter (print first, no typed identity, no guessing when OCR is
// incomplete, one save, one onDone) are unit-testable in the node environment.
//
// Phase 10 (owner decision 2026-10-23): the Discord handle is no longer the
// identity key. The print is read, the nickname is looked up in the registry
// (`firstAccessLookup`) and only a claimable row unlocks the PIN setter. A
// nickname with no registry row (or a character already claimed) never reaches
// the PIN boxes: it becomes an officer-approved registration request or a
// "log in / contact an officer" message.
import type { NeoFootSession } from './session'
import {
  FunctionError,
  type FirstAccessStatus,
  type SetupPinInput,
} from '../../lib/api'
import type { BasicProfileFields } from '../submit/identity'

export const HANDLE_ERROR = 'Informe seu usuário do Discord.'
export const PIN_ERROR = 'Informe um PIN de 4 dígitos.'
export const PIN_MISMATCH = 'Os PINs não conferem.'
export const PROOF_ERROR = 'Envie o print da aba Básico.'
export const PROFILE_ERROR = 'Não conseguimos ler o ID, o nick e a classe. Envie outro print.'
export const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'

/** pt-BR natural list: ['o ID', 'a classe'] -> "o ID e a classe". */
function joinPt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

/**
 * Retry copy for an incomplete OCR profile that names exactly what is missing
 * (08.10): the generic PROFILE_ERROR claimed the ID, nick AND class all failed
 * even when only the class was unreadable — which is what a pt-BR client
 * produced before the localized labels were supported.
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

/** Registry answers that let the PIN setter open (never anything else). */
export function canSetPin(status: FirstAccessStatus | null): boolean {
  return status === 'ready'
}

/** Registry answers that become an officer-approved registration request. */
export function canRequestRegistration(status: FirstAccessStatus | null): boolean {
  return status === 'unknown'
}

/** Health message for a status that blocks the PIN setter. */
export function statusMessage(status: FirstAccessStatus): string {
  switch (status) {
    case 'pin_set':
      return 'Este personagem já tem PIN. Entre com o nick e o PIN.'
    case 'pending':
      return 'Cadastro enviado. Aguarde a aprovação de um oficial e tente de novo.'
    case 'unknown':
      return 'Não encontramos este personagem na lista da guilda. Você pode enviar o print para aprovação de um oficial.'
    case 'identity_mismatch':
      return 'O ID do print não confere com o cadastro deste nick. Fale com um oficial.'
    case 'ambiguous_identity':
      return 'Mais de um cadastro usa este nick. Fale com um oficial.'
    case 'ready':
      return 'Personagem encontrado. Defina seu PIN.'
  }
}

/** The statuses that should offer the "back to login" action. */
export function statusBackToLogin(status: FirstAccessStatus): boolean {
  return status === 'pin_set'
}

export interface FirstAccessDraft {
  /** Discord handle — contact key for a registration request. */
  handle: string
  pin: string
  confirmPin: string
  /** OCR result for the selected proof (null until read / unreadable). */
  profile: BasicProfileFields | null
  proofDataUrl: string | null
  /** Registry answer for the read nickname (null until looked up). */
  status: FirstAccessStatus | null
}

export type FirstAccessProblem = 'handle' | 'pin' | 'mismatch' | 'proof' | 'profile' | 'status'

export const STATUS_ERROR = 'Verifique o personagem no print antes de criar o PIN.'

/**
 * The first blocking problem in form order, or null when submittable.
 * PIN problems only exist once the registry opened the setter, so an unknown
 * character can never be asked for a PIN — and never reaches setup-pin.
 */
export function firstAccessProblem(draft: FirstAccessDraft): FirstAccessProblem | null {
  if (draft.proofDataUrl === null) return 'proof'
  if (!profileComplete(draft.profile)) return 'profile'
  if (canSetPin(draft.status)) {
    if (!/^\d{4}$/.test(draft.pin)) return 'pin'
    if (draft.confirmPin !== draft.pin) return 'mismatch'
    return null
  }
  // The claim path never needs the Discord handle (it is already on the registry
  // row); only the registration request carries it.
  if (draft.handle.trim() === '' || draft.handle.trim().length > 64) return 'handle'
  // Registry still unknown/unclaimable: the PIN setter must stay closed.
  return 'status'
}

/** The registration request needs the handle + print, never a PIN. */
export type RegistrationProblem = 'handle' | 'proof' | 'profile'

export function registrationProblem(
  draft: Pick<FirstAccessDraft, 'handle' | 'proofDataUrl' | 'profile'>,
): RegistrationProblem | null {
  if (draft.handle.trim() === '' || draft.handle.trim().length > 64) return 'handle'
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
    case 'status':
      return STATUS_ERROR
  }
}

export function registrationProblemMessage(problem: RegistrationProblem): string {
  return firstAccessProblemMessage(problem)
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
  /** Offer the "Voltar para o login" action. */
  backToLogin: boolean
}

/** Server machine token -> pt-BR copy (never leaks internals). */
export function setupErrorCopy(error: FunctionError): SetupErrorCopy {
  switch (error.code) {
    case 'pin_already_set':
      return {
        message: 'PIN já criado. Entre com seu nick e seu PIN.',
        clearPin: true,
        backToLogin: true,
      }
    case 'not_registered':
      return {
        message:
          'Este personagem não está mais na lista da guilda. Envie o print de novo para solicitar o cadastro.',
        clearPin: true,
        backToLogin: false,
      }
    case 'identity_mismatch':
      return {
        message: 'O ID do print não confere com o cadastro deste nick. Fale com um oficial.',
        clearPin: false,
        backToLogin: true,
      }
    case 'ambiguous_identity':
      return {
        message: 'Mais de um cadastro usa este nick. Fale com um oficial.',
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
            ? 'Nick ou PIN incorreto — 1 tentativa restante.'
            : `Nick ou PIN incorreto — ${remaining} tentativas restantes.`
          : 'Nick ou PIN incorreto.'
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
  | {
      ok: false
      problem: FirstAccessProblem | 'setup'
      message: string
      clearPin: boolean
      backToLogin: boolean
    }

export interface FirstAccessDeps {
  setupPin: (input: SetupPinInput) => Promise<NeoFootSession>
  saveSession: (session: NeoFootSession) => void
}

/**
 * Validate -> POST setup-pin with the print-derived identity -> persist the
 * session exactly once. The caller invokes onDone only when `ok` (so a failure
 * can never advance the guard).
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
      nickname: profile.nickname,
      pin: draft.pin,
      confirm_pin: draft.confirmPin,
      char_id: profile.char_id,
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

export type RegistrationOutcome =
  | { ok: true; requestId: string; duplicate: boolean }
  | { ok: false; message: string }

export interface RegistrationDeps {
  requestFirstAccess: (input: {
    discord_handle: string
    char_id: string
    nickname: string
    char_class: string
    proof_data_url: string
  }) => Promise<{ request_id: string; status: 'pending'; duplicate: boolean }>
}

export const REQUEST_SENT = 'Print enviado. Aguarde a aprovação de um oficial e tente de novo.'
export const REQUEST_ALREADY_PENDING =
  'Já existe um cadastro aguardando aprovação para este personagem ou handle.'

/** Server machine token -> pt-BR copy for the registration request. */
export function registrationErrorCopy(error: FunctionError): string {
  switch (error.code) {
    case 'request_pending':
      return REQUEST_ALREADY_PENDING
    case 'already_registered':
      return 'Este personagem já foi cadastrado. Tente de novo: o PIN já pode ser definido.'
    case 'unknown_class':
      return 'A classe lida não foi reconhecida. Envie outro print.'
    case 'ambiguous_identity':
      return 'Mais de um cadastro usa este nick. Fale com um oficial.'
    case 'proof_too_large':
      return 'Comprovante muito grande (máx. 2 MB).'
    case 'invalid_proof':
      return 'O servidor não aceitou o comprovante. Envie de novo o print em JPEG da tela Básico.'
    case 'network':
      return NETWORK_ERROR
    default:
      return 'Não foi possível enviar o print para aprovação. Tente novamente.'
  }
}

/**
 * Queue the officer approval for a print that has no registry match. No session
 * is minted: the player must come back after the approval to set the PIN.
 */
export async function submitRegistration(
  draft: FirstAccessDraft,
  deps: RegistrationDeps,
): Promise<RegistrationOutcome> {
  const problem = registrationProblem(draft)
  if (problem !== null) {
    return { ok: false, message: registrationProblemMessage(problem) }
  }
  const profile = draft.profile as { nickname: string; char_id: string; char_class: string }
  try {
    const result = await deps.requestFirstAccess({
      discord_handle: draft.handle.trim(),
      char_id: profile.char_id,
      nickname: profile.nickname,
      char_class: profile.char_class,
      proof_data_url: draft.proofDataUrl as string,
    })
    return { ok: true, requestId: result.request_id, duplicate: result.duplicate }
  } catch (err) {
    if (err instanceof FunctionError) {
      return { ok: false, message: registrationErrorCopy(err) }
    }
    return { ok: false, message: NETWORK_ERROR }
  }
}
