// Request-access flow logic (08-03 task 4, D-06/D-07/D-08/D-11).
//
// PURE module: chooser -> identity form -> member submit / prospect handoff,
// including the supersede retry (previous PIN) and the status copy. The pages
// render these outcomes; keeping the rules here makes them testable without a
// DOM (the repo ships node-env Vitest only).
import { FunctionError, type RequestAccessInput, type RequestStatus } from '../../lib/api'
import {
  CHAR_FUNCTIONS,
  OFFICIAL_CLASSES,
  validateIdentity,
  type BasicProfileFields,
  type CharFunction,
} from '../submit/identity'

export const REQUEST_HANDLE_ERROR = 'Informe seu usuário do Discord.'
export const REQUEST_PIN_ERROR = 'Informe um PIN de 4 dígitos.'
export const REQUEST_PIN_MISMATCH = 'Os PINs não conferem.'
export const REQUEST_PROOF_ERROR = 'Envie o print do personagem.'
export const REQUEST_NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'

/** Prospect handoff payload: the 08-04 wizard adds stats and submits. */
export interface ProspectDraft {
  handle: string
  pin: string
  char_id: string
  nickname: string
  char_class: string
  char_function: CharFunction
  proof_data_url: string
}

export interface RequestFormDraft {
  handle: string
  pin: string
  confirmPin: string
  /** Editable identity: OCR-prefilled, never overwritten once touched. */
  char_id: string
  nickname: string
  char_class: string
  charFunction: CharFunction | ''
  proofDataUrl: string | null
}

export type RequestProblem =
  | 'handle'
  | 'pin'
  | 'mismatch'
  | 'proof'
  | 'char_id'
  | 'nickname'
  | 'char_class'
  | 'char_function'

/** First blocking problem in form order, or null when submittable. */
export function requestFormProblem(draft: RequestFormDraft): RequestProblem | null {
  if (draft.handle.trim() === '' || draft.handle.trim().length > 64) return 'handle'
  if (!/^\d{4}$/.test(draft.pin)) return 'pin'
  if (draft.confirmPin !== draft.pin) return 'mismatch'
  if (draft.proofDataUrl === null) return 'proof'
  if (draft.charFunction === '') return 'char_function'
  const identity = validateIdentity({
    char_id: draft.char_id.trim(),
    nickname: draft.nickname.trim(),
    char_class: draft.char_class,
    char_function: draft.charFunction,
  })
  if (!identity.ok) {
    const field = identity.field
    if (field === 'char_id' || field === 'nickname' || field === 'char_class') return field
    return 'char_function'
  }
  return null
}

export function requestProblemMessage(problem: RequestProblem): string {
  switch (problem) {
    case 'handle':
      return REQUEST_HANDLE_ERROR
    case 'pin':
      return REQUEST_PIN_ERROR
    case 'mismatch':
      return REQUEST_PIN_MISMATCH
    case 'proof':
      return REQUEST_PROOF_ERROR
    case 'char_id':
      return 'Informe o ID do personagem (1 a 12 dígitos).'
    case 'nickname':
      return 'Informe o nick do personagem.'
    case 'char_class':
      return 'Escolha uma classe oficial.'
    case 'char_function':
      return 'Escolha a função do personagem.'
  }
}

/** Normalize an OCR read into the form's editable identity fields. */
export function identityFromProfile(profile: BasicProfileFields | null): {
  char_id: string
  nickname: string
  char_class: string
} {
  return {
    char_id: profile?.char_id ?? '',
    nickname: profile?.nickname ?? '',
    char_class: profile?.char_class ?? '',
  }
}

export type IdentityField = 'char_id' | 'nickname' | 'char_class'
export type TouchedFields = Partial<Record<IdentityField, boolean>>

/**
 * OCR prefill that never overwrites a field the applicant already edited
 * (D-06: staff reviews the application, so the human's value wins).
 */
export function prefillIdentity(
  current: { char_id: string; nickname: string; char_class: string },
  read: BasicProfileFields | null,
  touched: TouchedFields,
): { char_id: string; nickname: string; char_class: string } {
  return {
    char_id: touched.char_id ? current.char_id : (read?.char_id ?? current.char_id),
    nickname: touched.nickname ? current.nickname : (read?.nickname ?? current.nickname),
    char_class: touched.char_class ? current.char_class : (read?.char_class ?? current.char_class),
  }
}

/** Build the member payload: request_type 'member', identity only, NO stats. */
export function buildMemberRequest(
  draft: RequestFormDraft,
  previousPin?: string,
): RequestAccessInput {
  const payload: RequestAccessInput = {
    discord_handle: draft.handle.trim(),
    pin: draft.pin,
    confirm_pin: draft.confirmPin,
    request_type: 'member',
    char_id: draft.char_id.trim(),
    nickname: draft.nickname.trim(),
    char_class: draft.char_class,
    char_function: (draft.charFunction === '' ? 'dps' : draft.charFunction) as CharFunction,
    proof_data_url: draft.proofDataUrl as string,
  }
  // Only send previous_pin when the supersede step actually asked for it.
  if (previousPin !== undefined && previousPin !== '') payload.previous_pin = previousPin
  return payload
}

/** Build the prospect handoff (no stats yet — the 08-04 wizard owns them). */
export function prospectDraftFrom(draft: RequestFormDraft): ProspectDraft {
  return {
    handle: draft.handle.trim(),
    pin: draft.pin,
    char_id: draft.char_id.trim(),
    nickname: draft.nickname.trim(),
    char_class: draft.char_class,
    char_function: (draft.charFunction === '' ? 'dps' : draft.charFunction) as CharFunction,
    proof_data_url: draft.proofDataUrl as string,
  }
}

export interface RequestErrorCopy {
  message: string
  /** 409 request_pending: reveal the previous-PIN boxes (D-11). */
  needsPreviousPin: boolean
  /** 401 invalid_previous_pin: clear only that PIN, keep everything else. */
  clearPreviousPin: boolean
  backToLogin: boolean
}

export function requestErrorCopy(error: FunctionError): RequestErrorCopy {
  switch (error.code) {
    case 'request_pending':
      return {
        message:
          'Já existe uma solicitação para este handle. Informe o PIN dela para substituir.',
        needsPreviousPin: true,
        clearPreviousPin: false,
        backToLogin: false,
      }
    case 'invalid_previous_pin': {
      const remaining = error.attemptsRemaining
      const message =
        typeof remaining === 'number' && remaining > 0
          ? `PIN da solicitação anterior incorreto — ${remaining} ${
              remaining === 1 ? 'tentativa restante' : 'tentativas restantes'
            }.`
          : 'PIN da solicitação anterior incorreto.'
      return {
        message,
        needsPreviousPin: true,
        clearPreviousPin: true,
        backToLogin: false,
      }
    }
    case 'locked': {
      const seconds = error.retryAfterSeconds
      const minutes =
        typeof seconds === 'number' && seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 1
      return {
        message: `Muitas tentativas incorretas. Tente novamente em ${minutes} minutos.`,
        needsPreviousPin: false,
        clearPreviousPin: true,
        backToLogin: false,
      }
    }
    case 'duplicate_char_id':
      return {
        message: 'Este ID já está cadastrado em outro personagem. Fale com um oficial.',
        needsPreviousPin: false,
        clearPreviousPin: false,
        backToLogin: false,
      }
    case 'already_member':
      return {
        message: 'Este handle já pertence a um membro ativo. Entre com seu PIN.',
        needsPreviousPin: false,
        clearPreviousPin: false,
        backToLogin: true,
      }
    case 'proof_too_large':
      return {
        message: 'Comprovante muito grande (máx. 2 MB).',
        needsPreviousPin: false,
        clearPreviousPin: false,
        backToLogin: false,
      }
    case 'network':
      return {
        message: REQUEST_NETWORK_ERROR,
        needsPreviousPin: false,
        clearPreviousPin: false,
        backToLogin: false,
      }
    default:
      return {
        message: 'Não foi possível enviar a solicitação. Tente novamente.',
        needsPreviousPin: false,
        clearPreviousPin: false,
        backToLogin: false,
      }
  }
}

export type MemberRequestOutcome =
  | { ok: true; requestId: string }
  | {
      ok: false
      problem: RequestProblem | 'setup'
      message: string
      needsPreviousPin: boolean
      clearPreviousPin: boolean
      backToLogin: boolean
    }

export interface MemberRequestDeps {
  requestAccess: (input: RequestAccessInput) => Promise<{ request_id: string; status: 'pending' }>
}

/** Validate -> POST request-access once. No session is minted by design. */
export async function submitMemberRequest(
  draft: RequestFormDraft,
  deps: MemberRequestDeps,
  previousPin?: string,
): Promise<MemberRequestOutcome> {
  const problem = requestFormProblem(draft)
  if (problem !== null) {
    return {
      ok: false,
      problem,
      message: requestProblemMessage(problem),
      needsPreviousPin: false,
      clearPreviousPin: false,
      backToLogin: false,
    }
  }
  try {
    const result = await deps.requestAccess(buildMemberRequest(draft, previousPin))
    return { ok: true, requestId: result.request_id }
  } catch (err) {
    if (err instanceof FunctionError) {
      return { ok: false, problem: 'setup', ...requestErrorCopy(err) }
    }
    return {
      ok: false,
      problem: 'setup',
      message: REQUEST_NETWORK_ERROR,
      needsPreviousPin: false,
      clearPreviousPin: false,
      backToLogin: false,
    }
  }
}

export interface StatusView {
  title: string
  detail: string | null
  tone: 'pending' | 'approved' | 'rejected' | 'none'
}

/**
 * Status copy — ONLY status/type/dates (T-08-21). Identity fields never reach
 * this function because fetchRequestStatus strips them.
 */
export function statusView(result: RequestStatus | null): StatusView {
  if (result === null) {
    return {
      title: 'Nenhuma solicitação encontrada',
      detail: 'Nenhuma solicitação registrada para este handle.',
      tone: 'none',
    }
  }
  const typeLabel = result.request_type === 'member' ? 'Vínculo de personagem' : 'Nova entrada'
  const created = formatRequestDate(result.created_at)
  switch (result.status) {
    case 'pending':
      return {
        title: 'Solicitação pendente',
        detail: `${typeLabel} · enviada em ${created}. Aguarde um oficial.`,
        tone: 'pending',
      }
    case 'approved':
      return {
        title: 'Solicitação aprovada',
        detail: `${typeLabel} · enviada em ${created}${
          result.decided_at !== null ? ` · decidida em ${formatRequestDate(result.decided_at)}` : ''
        }.`,
        tone: 'approved',
      }
    case 'rejected':
      return {
        title: 'Solicitação rejeitada',
        detail: `${typeLabel} · enviada em ${created}${
          result.decided_at !== null ? ` · decidida em ${formatRequestDate(result.decided_at)}` : ''
        }. Você pode enviar uma nova solicitação.`,
        tone: 'rejected',
      }
    case 'superseded':
      return {
        title: 'Solicitação substituída',
        detail: `${typeLabel} · substituída por uma solicitação mais recente.`,
        tone: 'none',
      }
  }
}

export function formatRequestDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Official class options for the applicant's select (15 seeded names). */
export const REQUEST_CLASS_OPTIONS = OFFICIAL_CLASSES
export const REQUEST_FUNCTION_OPTIONS = CHAR_FUNCTIONS
