// Request-access flow logic (08-03 task 4, D-06/D-07/D-08/D-11).
//
// PURE module: chooser -> identity form -> member submit / prospect handoff,
// including the supersede retry (previous PIN) and the status copy. The pages
// render these outcomes; keeping the rules here makes them testable without a
// DOM (the repo ships node-env Vitest only).
import {
  FunctionError,
  type RequestAccessInput,
  type RequestStatus,
  type StatCatalogEntry,
} from '../../lib/api'
import {
  CHAR_FUNCTIONS,
  OFFICIAL_CLASSES,
  validateIdentity,
  type BasicProfileFields,
  type CharFunction,
  type SubmissionIdentity,
} from '../submit/identity'
import {
  WIZARD_GROUPS,
  buildStatsPayload,
  groupComplete,
  type GroupInputs,
  type StatPayloadItem,
  type WizardGroup,
} from '../submit/wizard'
import { isRawDefenseStat } from '../submit/rawDefense'

export const REQUEST_HANDLE_ERROR = 'Informe seu usuário do Discord.'
export const REQUEST_PIN_ERROR = 'Informe um PIN de 4 dígitos.'
export const REQUEST_PIN_MISMATCH = 'Os PINs não conferem.'
export const REQUEST_PROOF_ERROR = 'Envie o print do personagem.'
export const REQUEST_NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'

// Server-side rejections that used to fall into the dead-end "tente novamente"
// fallback (owner report 2026-10-23: a submit failed with no way to tell what
// was wrong). Each code now names the actual problem so the applicant can act.
export const REQUEST_PROOF_REJECTED =
  'O servidor não aceitou o comprovante. Envie de novo o print em JPEG da tela Básico.'
export const REQUEST_STATS_REJECTED =
  'Os status enviados não conferem com a lista oficial. Recarregue a página e refaça a captura.'
export const REQUEST_FIELDS_REJECTED =
  'Algum dado do formulário foi recusado (ID, nick ou classe). Revise e envie de novo.'
export const REQUEST_FUNCTION_REJECTED = 'Função inválida: escolha DPS, MDPS ou Suporte.'
export const REQUEST_CLASS_REJECTED = 'Classe não reconhecida pelo servidor. Escolha a classe na lista.'
export const REQUEST_SERVER_ERROR =
  'O servidor não conseguiu registrar a solicitação agora. Tente novamente em instantes.'

/** Prospect handoff payload: the 08-04 wizard adds stats and submits.
 *  Owner decision 2026-10-23: no PIN here — a prospect is not a member yet, so
 *  there is no credential to choose. Staff approval creates the row unclaimed
 *  and the PIN is defined on the first login (print-first claim). */
export interface ProspectDraft {
  handle: string
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

/** First blocking problem in form order, or null when submittable.
 *  `requirePin` is false for the recruitment flow only (owner decision
 *  2026-10-23: prospects choose their PIN at first access, not at application). */
export function requestFormProblem(
  draft: RequestFormDraft,
  options: { requirePin?: boolean } = {},
): RequestProblem | null {
  const requirePin = options.requirePin !== false
  if (draft.handle.trim() === '' || draft.handle.trim().length > 64) return 'handle'
  if (requirePin) {
    if (!/^\d{4}$/.test(draft.pin)) return 'pin'
    if (draft.confirmPin !== draft.pin) return 'mismatch'
  }
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

/** Build the prospect handoff (no stats, no PIN yet — the 08-04 wizard owns the
 *  stats and the member sets the PIN on the first login after approval). */
export function prospectDraftFrom(draft: RequestFormDraft): ProspectDraft {
  return {
    handle: draft.handle.trim(),
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
    case 'not_member':
      return {
        message: 'Este handle n\u00e3o tem cadastro na guilda. Use "Recrutamento" para solicitar entrada.',
        needsPreviousPin: false,
        clearPreviousPin: false,
        backToLogin: false,
      }
    case 'proof_too_large':
      return {
        message: 'Comprovante muito grande (máx. 2 MB).',
        needsPreviousPin: false,
        clearPreviousPin: false,
        backToLogin: false,
      }
    case 'invalid_proof':
      return {
        message: REQUEST_PROOF_REJECTED,
        needsPreviousPin: false,
        clearPreviousPin: false,
        backToLogin: false,
      }
    case 'invalid_stats':
      return {
        message: REQUEST_STATS_REJECTED,
        needsPreviousPin: false,
        clearPreviousPin: false,
        backToLogin: false,
      }
    case 'invalid_request':
      return {
        message: REQUEST_FIELDS_REJECTED,
        needsPreviousPin: false,
        clearPreviousPin: false,
        backToLogin: false,
      }
    case 'invalid_function':
      return {
        message: REQUEST_FUNCTION_REJECTED,
        needsPreviousPin: false,
        clearPreviousPin: false,
        backToLogin: false,
      }
    case 'unknown_class':
      return {
        message: REQUEST_CLASS_REJECTED,
        needsPreviousPin: false,
        clearPreviousPin: false,
        backToLogin: false,
      }
    case 'server_error':
    case 'server_misconfigured':
    case 'invalid_response':
      return {
        message: REQUEST_SERVER_ERROR,
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
  const typeLabel =
    result.request_type === 'member'
      ? 'Vínculo de personagem'
      : result.request_type === 'registration'
        ? 'Cadastro de personagem'
        : result.request_type === 'claim'
          ? 'Primeiro acesso'
          : 'Nova entrada'
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

// ---------------------------------------------------------------------------
// Prospect application flow (08-04, WHIT-08/09, IDEN-03)
//
// The wizard page renders these rules; the network call is injected so the
// live request-access contract can be asserted without a DOM. The applicant's
// identity was confirmed on the request form (no second proof) and is sent
// read-only with the stats.
// ---------------------------------------------------------------------------

export const PROSPECT_MISSING_COPY = 'Preencha todos os campos obrigatórios.'
export const PROSPECT_PENDING_COPY = 'Você já tem uma solicitação em análise.'
export const PROSPECT_DUPLICATE_COPY =
  'Este ID já está cadastrado. Confira no jogo ou fale com um oficial.'
export const PROSPECT_CLASS_COPY = 'Selecione uma classe oficial.'
export const PROSPECT_NETWORK_COPY =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
export const PROSPECT_GENERIC_COPY = 'Não foi possível enviar a solicitação. Tente novamente.'
export const PROSPECT_MEMBER_COPY = 'Este handle já pertence a um membro ativo. Entre com seu PIN.'
export const PROSPECT_STATS_COPY =
  'Os status enviados não conferem com a lista oficial. Recarregue a página e refaça as capturas.'
export const PROSPECT_PROOF_COPY =
  'O servidor não aceitou o comprovante. Envie de novo o print em JPEG da tela Básico.'
export const PROSPECT_FIELDS_COPY =
  'Algum dado do formulário foi recusado (ID, nick ou classe). Volte e revise a identificação.'

export type ProspectStep = 1 | 2 | 3 | 4 | 5

/** The single group→step mapping (same as SubmitPage: combat_power is step 1). */
export const PROSPECT_STEP_GROUP: Record<2 | 3 | 4, WizardGroup> = {
  2: 'general',
  3: 'quasi',
  4: 'special',
}

/** Same group→entries rule as SubmitPage: combat_power belongs to step 1.
 * Raw defenses (rpdef/rmdef) are NOT rendered in the special grid —
 * DefenseStep owns them as read-only calculated fields. */
export function prospectGroupEntries(
  catalog: StatCatalogEntry[],
  group: WizardGroup,
): StatCatalogEntry[] {
  return catalog.filter(
    (entry) =>
      entry.group_name === group &&
      !(group === 'general' && entry.stat_key === 'combat_power') &&
      !(group === 'special' && isRawDefenseStat(entry.stat_key)),
  )
}

/**
 * Continuar gate: step 1 (optional combat_power) and step 5 always pass;
 * each stat group requires every required field to parse (wizard rule).
 */
export function prospectCanContinue(
  catalog: StatCatalogEntry[],
  step: ProspectStep,
  inputs: GroupInputs,
): boolean {
  if (step === 1 || step === 5) return true
  const group = PROSPECT_STEP_GROUP[step]
  return groupComplete(prospectGroupEntries(catalog, group), group, inputs)
}

/** The identity the applicant confirmed on the request form (read-only). */
export function prospectIdentity(draft: ProspectDraft): SubmissionIdentity {
  return {
    char_id: draft.char_id,
    nickname: draft.nickname,
    char_class: draft.char_class,
    char_function: draft.char_function,
  }
}

/** The request-access prospect contract: stats ride along with the identity.
 *  Owner decision 2026-10-23: no PIN is sent — the member defines it on the
 *  first login after staff approval. */
export function buildProspectPayload(
  draft: ProspectDraft,
  stats: StatPayloadItem[],
): RequestAccessInput {
  return {
    discord_handle: draft.handle,
    request_type: 'prospect',
    char_id: draft.char_id,
    nickname: draft.nickname,
    char_class: draft.char_class,
    char_function: draft.char_function,
    proof_data_url: draft.proof_data_url,
    stats,
  }
}

export interface ProspectErrorCopy {
  message: string
  /** identity fields are read-only in the wizard — the page shows the message
   *  next to the summary and offers the way back to the request form */
  field?: 'char_id' | 'char_class'
}

export function prospectErrorCopy(error: FunctionError): ProspectErrorCopy {
  switch (error.code) {
    case 'request_pending':
      return { message: PROSPECT_PENDING_COPY }
    case 'duplicate_char_id':
      return { message: PROSPECT_DUPLICATE_COPY, field: 'char_id' }
    case 'unknown_class':
      return { message: PROSPECT_CLASS_COPY, field: 'char_class' }
    case 'already_member':
      return { message: PROSPECT_MEMBER_COPY }
    case 'invalid_stats':
      return { message: PROSPECT_STATS_COPY }
    case 'invalid_proof':
      return { message: PROSPECT_PROOF_COPY }
    case 'invalid_request':
    case 'invalid_function':
      return { message: PROSPECT_FIELDS_COPY }
    case 'server_error':
    case 'server_misconfigured':
    case 'invalid_response':
      return { message: REQUEST_SERVER_ERROR }
    case 'network':
      return { message: PROSPECT_NETWORK_COPY }
    default:
      return { message: PROSPECT_GENERIC_COPY }
  }
}

/** Owning step of the first missing required label (jump-to-fix). */
export function prospectStepForMissing(
  catalog: StatCatalogEntry[],
  labels: string[],
): ProspectStep {
  for (const label of labels) {
    const entry = catalog.find((candidate) => candidate.label === label)
    if (entry === undefined) continue
    if (entry.stat_key === 'combat_power') return 1
    const index = WIZARD_GROUPS.indexOf(entry.group_name)
    if (index >= 0) return (index + 2) as 2 | 3 | 4
  }
  return 5
}

export type ProspectSubmitOutcome =
  | { ok: true; requestId: string }
  | { ok: false; kind: 'missing'; missingRequired: string[] }
  | { ok: false; kind: 'blocked'; message: string; field?: 'char_id' | 'char_class' }

export interface ProspectSubmitDeps {
  requestAccess: (input: RequestAccessInput) => Promise<{ request_id: string; status: 'pending' }>
}

/**
 * Validate the (already confirmed) identity, build the stats payload with the
 * wizard rules, then POST request-access once. The >=58 guard mirrors the
 * live Edge validation; buildStatsPayload already guarantees the 58 required
 * fields, so it is defense in depth, not a UX gate. Never touches
 * create_submission and never mints a session (T-08-28).
 */
export async function submitProspectApplication(
  draft: ProspectDraft,
  catalog: StatCatalogEntry[],
  inputs: GroupInputs,
  deps: ProspectSubmitDeps,
): Promise<ProspectSubmitOutcome> {
  const identity = validateIdentity(prospectIdentity(draft))
  if (!identity.ok) {
    const field =
      identity.field === 'char_id' || identity.field === 'char_class' ? identity.field : undefined
    return { ok: false, kind: 'blocked', message: identity.message, field }
  }

  const built = buildStatsPayload(catalog, inputs)
  if (!built.ok) return { ok: false, kind: 'missing', missingRequired: built.missingRequired }
  if (built.stats.length < 56) {
    return { ok: false, kind: 'blocked', message: PROSPECT_MISSING_COPY }
  }

  try {
    const result = await deps.requestAccess(buildProspectPayload(draft, built.stats))
    return { ok: true, requestId: result.request_id }
  } catch (error) {
    if (error instanceof FunctionError) {
      const copy = prospectErrorCopy(error)
      return { ok: false, kind: 'blocked', message: copy.message, field: copy.field }
    }
    return { ok: false, kind: 'blocked', message: PROSPECT_NETWORK_COPY }
  }
}
