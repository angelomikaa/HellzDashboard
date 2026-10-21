// Character identity parsing + validation (Phase 8, plan 08-03; IDEN-01/02/03).
//
// PURE module: no React, no DOM, no network. It is the single source of truth
// for the 15 official class names, the OCR-side class matcher, the Basic-screen
// text parser and the editable identity validation shared by the first-access,
// request and (08-04) submit flows.
//
// D-03/D-19: the pointed build role is NEVER inferred from the screenshot —
// char_function is always a human choice and only validateIdentity checks it.

export type CharFunction = 'dps' | 'mdps' | 'suporte'

export const CHAR_FUNCTIONS: readonly CharFunction[] = ['dps', 'mdps', 'suporte']

// Exactly the 15 transcendent names in supabase/seeds/classes.sql (REG-02).
// Kept as a client constant so the unauthenticated first-access/request screens
// never need a session-scoped catalog read.
export const OFFICIAL_CLASSES: readonly string[] = [
  'Assassin Cross',
  'Lord Knight',
  'High Wizard',
  'Sniper',
  'High Priest',
  'Mastersmith',
  'Paladin',
  'Professor',
  'Stalker',
  'Biochemist',
  'Champion',
  'Bard',
  'Gypsy',
  'Summoner',
  'Rebellion',
]

/** The OCR-derived identity fields (no role — D-03). */
export interface BasicProfileFields {
  nickname: string | null
  char_id: string | null
  char_class: string | null
}

/** The editable identity carried by submissions (08-04) and requests. */
export interface SubmissionIdentity {
  char_id: string
  nickname: string
  char_class: string
  char_function: CharFunction
}

/** Lowercase a-z0-9 comparison space (accents/punctuation dropped). */
function normalizeClassName(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

/**
 * Map an OCR'd job string to one of the 15 official class names.
 * Exact (normalized) first, then unique containment (handles "Assassin" for
 * "Assassin Cross" and noisy label/value runs), then bounded Levenshtein
 * ("Gypsv" -> "Gypsy"). Ambiguous or unknown input returns null — NEVER a
 * default class (a wrong class would silently corrupt cohorts).
 */
export function matchClassName(observed: string | null | undefined): string | null {
  const o = normalizeClassName(observed)
  if (o.length < 2) return null

  const exact = OFFICIAL_CLASSES.filter((name) => normalizeClassName(name) === o)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null

  const contained = OFFICIAL_CLASSES.filter((name) => {
    const n = normalizeClassName(name)
    return n.includes(o) || o.includes(n)
  })
  if (contained.length === 1) return contained[0]
  if (contained.length > 1) return null

  const candidates: Array<{ name: string; distance: number }> = []
  for (const name of OFFICIAL_CLASSES) {
    const n = normalizeClassName(name)
    const maxDistance = Math.max(1, Math.floor(0.25 * Math.min(o.length, n.length)))
    const distance = levenshtein(o, n)
    if (distance <= maxDistance) candidates.push({ name, distance })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.distance - b.distance)
  if (candidates.length > 1 && candidates[1].distance === candidates[0].distance) return null
  return candidates[0].name
}

// "ID 32980", "ID: 32O8O", "ID.32980" — O is the classic digit-zero OCR slip.
// The negative lookahead keeps a 13+ digit run from being silently truncated.
const ID_PATTERN = /\bID\b\s*[:.]?\s*([0-9O]{3,12})(?![0-9O])/i
// "Job Gypsy" / "Job: Lord Knight" — the value must start with a letter so a
// bare digits run never matches.
const JOB_PATTERN = /\bJob\b\s*[:.]?\s*([A-Za-z][A-Za-z ]{1,30})/i

// Lines that are labels/values around the nickname band, never the nickname.
const NICKNAME_KEYWORDS = [
  'job',
  'id',
  'power',
  'guild',
  'level',
  'base',
  'hp',
  'sp',
  'exp',
  'class',
  'atk',
  'def',
  'name',
  'nick',
  'rank',
  'status',
]

/**
 * Parse the full-canvas OCR text of a Basic screenshot into identity fields.
 * The real sample reads:
 *
 *   Ahrya
 *   Job  Gypsy
 *   ID 32980
 *   Power  288115
 *
 * Anything missing/ambiguous stays null — the first-access UI then refuses to
 * submit instead of guessing (D-03).
 */
export function parseBasicProfileText(text: string): BasicProfileFields {
  const raw = String(text ?? '')

  let char_id: string | null = null
  const idMatch = ID_PATTERN.exec(raw)
  if (idMatch) {
    const digits = idMatch[1].replace(/O/gi, '0')
    if (/^\d{3,12}$/.test(digits)) char_id = digits
  }

  let char_class: string | null = null
  const jobMatch = JOB_PATTERN.exec(raw)
  if (jobMatch) {
    // Trailing spaces are common (the next row starts on the same band).
    char_class = matchClassName(jobMatch[1].trim())
  }

  let nickname: string | null = null
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 5)
  for (const line of lines) {
    const candidate = line.replace(/[|_]+$/g, '').trim()
    if (candidate.length < 2 || candidate.length > 20) continue
    if (/[0-9]/.test(candidate)) continue
    if (!/[A-Za-z]/.test(candidate)) continue
    const lower = candidate.toLowerCase()
    if (NICKNAME_KEYWORDS.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(lower))) continue
    if (matchClassName(candidate) !== null) continue
    nickname = candidate
    break
  }

  return { nickname, char_id, char_class }
}

const ID_ERROR = 'Informe o ID do personagem (somente números, até 12 dígitos).'
const NICKNAME_ERROR = 'Informe o nick do personagem (até 80 caracteres).'
const CLASS_ERROR = 'Selecione a classe do personagem.'
const FUNCTION_ERROR = 'Selecione a função do personagem.'

function identityProblems(value: Partial<SubmissionIdentity>): Array<{
  field: 'char_id' | 'nickname' | 'char_class' | 'char_function'
  message: string
}> {
  const problems: Array<{
    field: 'char_id' | 'nickname' | 'char_class' | 'char_function'
    message: string
  }> = []

  const charId = String(value.char_id ?? '').trim()
  if (!/^\d{1,12}$/.test(charId)) problems.push({ field: 'char_id', message: ID_ERROR })

  const nickname = String(value.nickname ?? '').trim()
  if (nickname.length < 1 || nickname.length > 80) {
    problems.push({ field: 'nickname', message: NICKNAME_ERROR })
  }

  const charClass = String(value.char_class ?? '').trim()
  if (!OFFICIAL_CLASSES.includes(charClass)) {
    problems.push({ field: 'char_class', message: CLASS_ERROR })
  }

  const charFunction = value.char_function
  if (charFunction === undefined || !CHAR_FUNCTIONS.includes(charFunction)) {
    problems.push({ field: 'char_function', message: FUNCTION_ERROR })
  }

  return problems
}

/** Validation for the editable identity path (submit wizard / request form). */
export function validateIdentity(
  value: Partial<SubmissionIdentity>,
):
  | { ok: true; identity: SubmissionIdentity }
  | { ok: false; field: 'char_id' | 'nickname' | 'char_class' | 'char_function'; message: string } {
  const problems = identityProblems(value)
  if (problems.length > 0) {
    return { ok: false, field: problems[0].field, message: problems[0].message }
  }
  return {
    ok: true,
    identity: {
      char_id: String(value.char_id ?? '').trim(),
      nickname: String(value.nickname ?? '').trim(),
      char_class: String(value.char_class ?? '').trim(),
      char_function: value.char_function as CharFunction,
    },
  }
}

/**
 * Ordered problem list for the submit wizard ([] = valid). Order matches the
 * visual field order so the UI can focus the first offending input.
 */
export function validateIdentityDraft(value: SubmissionIdentity): string[] {
  return identityProblems(value).map((problem) => problem.message)
}
