// First-access request logic (08-03 task 3, D-03; Phase 10 reproject; 0034).
//
// PURE orchestration: the page is a thin renderer over these functions, so the
// rules that matter (manual fill, no print, officer-validated requests, one
// submit, one message) are unit-testable in the node environment.
//
// 0034 manual first access (owner decision 2026-10-26): the PRINT is gone and
// the player TYPES the identity (handle, nick, char ID, class) plus the PIN in
// one form. With nothing verifiable at the boundary, EVERY first access becomes
// an officer-validated request and the admins carry the identity check until
// the Phase 11 Discord OAuth link replaces it:
//
//   * 'ready'   -> the typed nick matches an UNCLAIMED registry row -> the
//                  claim request (requestClaim) queues an officer decision;
//                  the approval ACTIVATES the PIN on that row.
//   * 'unknown' -> no registry row -> the registration request
//                  (requestFirstAccess) carries the same typed identity + PIN;
//                  the approval registers the character WITH the PIN active.
//   * anything else -> the page explains and never submits.
import {
  FunctionError,
  type FirstAccessClaimInput,
  type FirstAccessRequestInput,
  type FirstAccessStatus,
} from '../../lib/api'
import { OFFICIAL_CLASSES } from '../submit/identity'

export const HANDLE_ERROR = 'Informe seu usuário do Discord.'
export const NICKNAME_ERROR = 'Informe o nick do personagem (até 80 caracteres).'
export const ID_ERROR = 'Informe o ID do personagem (somente números, até 12 dígitos).'
export const CLASS_ERROR = 'Selecione a classe do personagem.'
export const PIN_ERROR = 'Informe um PIN de 4 dígitos.'
export const PIN_MISMATCH = 'Os PINs não conferem.'
export const STATUS_ERROR = 'Verifique os dados do personagem antes de enviar.'
export const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'

/** Registry answers that offer the CLAIM request (an unclaimed row exists). */
export function canRequestClaim(status: FirstAccessStatus | null): boolean {
  return status === 'ready'
}

/** Registry answers that offer the REGISTRATION request (no registry row). */
export function canRequestRegistration(status: FirstAccessStatus | null): boolean {
  return status === 'unknown'
}

/** Health message for a status. */
export function statusMessage(status: FirstAccessStatus): string {
  switch (status) {
    case 'pin_set':
      return 'Este personagem já tem PIN. Entre com o nick e o PIN.'
    case 'handle_claimed':
      return 'Este Discord já tem personagem com PIN. Entre com o nick e o PIN.'
    case 'pending':
      return 'Solicitação enviada. Aguarde a decisão de um oficial.'
    case 'unknown':
      return 'Não encontramos este personagem na lista da guilda. Envie a solicitação para um oficial cadastrar.'
    case 'handle_registered':
      return 'Este Discord já está cadastrado, mas o nick não confere. Fale com um oficial.'
    case 'identity_mismatch':
      return 'O ID não confere com o cadastro deste nick. Fale com um oficial.'
    case 'ambiguous_identity':
      return 'Mais de um cadastro usa este nick. Fale com um oficial.'
    case 'ready':
      return 'Personagem encontrado. Envie a solicitação — um oficial vai confirmar e ativar seu PIN.'
  }
}

/** The statuses that should offer the "back to login" action. */
export function statusBackToLogin(status: FirstAccessStatus): boolean {
  return status === 'pin_set' || status === 'handle_claimed'
}

export interface FirstAccessDraft {
  /** Discord handle — the officer's contact key for the request. */
  handle: string
  nickname: string
  char_id: string
  char_class: string
  pin: string
  confirmPin: string
  /** Registry answer for the typed identity (null until looked up). */
  status: FirstAccessStatus | null
}

export type FirstAccessProblem =
  | 'handle'
  | 'nickname'
  | 'char_id'
  | 'class'
  | 'pin'
  | 'mismatch'
  | 'status'

/** The first blocking problem in form order, or null when submittable. */
export function firstAccessProblem(draft: FirstAccessDraft): FirstAccessProblem | null {
  if (draft.handle.trim() === '' || draft.handle.trim().length > 64) return 'handle'
  if (draft.nickname.trim().length < 1 || draft.nickname.trim().length > 80) return 'nickname'
  if (!/^\d{1,12}$/.test(draft.char_id.trim())) return 'char_id'
  if (!OFFICIAL_CLASSES.includes(draft.char_class)) return 'class'
  if (!/^\d{4}$/.test(draft.pin)) return 'pin'
  if (draft.confirmPin !== draft.pin) return 'mismatch'
  // Both requests are officer-validated: the page only submits for an
  // unclaimed registry row ('ready' -> claim) or an unknown character
  // ('unknown' -> registration). Every other answer needs an officer.
  if (!canRequestClaim(draft.status) && !canRequestRegistration(draft.status)) return 'status'
  return null
}

/** pt-BR copy for a blocking problem. */
export function firstAccessProblemMessage(problem: FirstAccessProblem): string {
  switch (problem) {
    case 'handle':
      return HANDLE_ERROR
    case 'nickname':
      return NICKNAME_ERROR
    case 'char_id':
      return ID_ERROR
    case 'class':
      return CLASS_ERROR
    case 'pin':
      return PIN_ERROR
    case 'mismatch':
      return PIN_MISMATCH
    case 'status':
      return STATUS_ERROR
  }
}

export const REQUEST_SENT =
  'Solicitação enviada. Após a aprovação de um oficial, entre com o nick e o PIN definidos aqui.'
export const REQUEST_ALREADY_PENDING =
  'Já existe uma solicitação aguardando análise para este personagem ou Discord.'

export type RequestOutcome =
  | { ok: true; duplicate: boolean }
  | { ok: false; message: string }

export interface RequestDeps {
  send: () => Promise<{ duplicate: boolean }>
}

/**
 * Validate -> POST the officer-validated request -> one terminal message. No
 * session is ever minted: the player logs in only after the officer approves.
 */
export async function submitFirstAccessRequest(
  draft: FirstAccessDraft,
  deps: RequestDeps,
): Promise<RequestOutcome> {
  const problem = firstAccessProblem(draft)
  if (problem !== null) {
    return { ok: false, message: firstAccessProblemMessage(problem) }
  }
  try {
    const result = await deps.send()
    return { ok: true, duplicate: result.duplicate }
  } catch (err) {
    if (err instanceof FunctionError) {
      return { ok: false, message: requestErrorCopy(err) }
    }
    return { ok: false, message: NETWORK_ERROR }
  }
}

/** The claim request: the typed nick resolves to an unclaimed registry row. */
export function claimRequestInput(draft: FirstAccessDraft): FirstAccessClaimInput {
  return {
    discord_handle: draft.handle.trim(),
    nickname: draft.nickname.trim(),
    char_id: draft.char_id.trim(),
    char_class: draft.char_class,
    pin: draft.pin,
    confirm_pin: draft.confirmPin,
  }
}

/** The registration request: the typed identity is unknown to the registry. */
export function registrationRequestInput(draft: FirstAccessDraft): FirstAccessRequestInput {
  return {
    discord_handle: draft.handle.trim(),
    nickname: draft.nickname.trim(),
    char_id: draft.char_id.trim(),
    char_class: draft.char_class,
    pin: draft.pin,
    confirm_pin: draft.confirmPin,
  }
}

/** Server machine token -> pt-BR copy (never leaks internals). */
export function requestErrorCopy(error: FunctionError): string {
  switch (error.code) {
    case 'request_pending':
      return REQUEST_ALREADY_PENDING
    case 'already_registered':
      return 'Este personagem ou Discord já está cadastrado. Entre com o nick e o PIN — se o PIN não existir, envie a solicitação de primeiro acesso.'
    case 'not_registered':
      return 'Este personagem não está mais na lista da guilda. Verifique o nick e tente de novo.'
    case 'pin_already_set':
      return 'Este personagem já tem PIN. Entre com o nick e o PIN.'
    case 'handle_claimed':
      return 'Este Discord já pertence a outro personagem. Fale com um oficial.'
    case 'identity_mismatch':
      return 'O ID não confere com o cadastro deste nick. Fale com um oficial.'
    case 'ambiguous_identity':
      return 'Mais de um cadastro usa este nick. Fale com um oficial.'
    case 'unknown_class':
      return 'Selecione uma classe oficial.'
    case 'invalid_request':
      return 'Não foi possível enviar a solicitação. Revise os dados e tente novamente.'
    case 'network':
      return NETWORK_ERROR
    default:
      return 'Não foi possível enviar a solicitação. Tente novamente.'
  }
}
