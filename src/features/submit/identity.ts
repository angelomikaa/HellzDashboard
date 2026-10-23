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

export type SubmissionIdentityDraft = Omit<SubmissionIdentity, 'char_function'> & {
  char_function: CharFunction | ''
}

/** Lowercase a-z0-9 comparison space (accents/punctuation dropped). */
function normalizeClassName(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
 * Localized class names -> official English catalog names (08.10 hotfix).
 *
 * The live game client is pt-BR: the Basic screen prints "Classe   Criador"
 * while the catalog (supabase/seeds/classes.sql) stores "Biochemist" — without
 * this table `matchClassName` returned null for every localized print and the
 * first-access gate could never pass. Base-line names map to their catalog
 * (transcendent) entry exactly like the English containment rule does
 * ("Assassin" -> "Assassin Cross").
 *
 * Add entries here when a client locale or a new spelling shows up; keys are
 * matched in the same normalized space (case/accent/punctuation-insensitive).
 */
export const CLASS_ALIASES: Readonly<Record<string, string>> = {
  // pt-BR (bRO / RO Origin Americas)
  algoz: 'Assassin Cross',
  assassino: 'Assassin Cross',
  lorde: 'Lord Knight',
  cavaleiro: 'Lord Knight',
  arquimago: 'High Wizard',
  bruxo: 'High Wizard',
  'atirador de elite': 'Sniper',
  cacador: 'Sniper',
  'sumo-sacerdote': 'High Priest',
  'sumo sacerdote': 'High Priest',
  sacerdote: 'High Priest',
  'mestre-ferreiro': 'Mastersmith',
  'mestre ferreiro': 'Mastersmith',
  ferreiro: 'Mastersmith',
  templario: 'Paladin',
  cruzado: 'Paladin',
  sabio: 'Professor',
  desordeiro: 'Stalker',
  arruaceiro: 'Stalker',
  criador: 'Biochemist',
  alquimista: 'Biochemist',
  mestre: 'Champion',
  monge: 'Champion',
  menestrel: 'Bard',
  bardo: 'Bard',
  cigana: 'Gypsy',
  odalisca: 'Gypsy',
  invocador: 'Summoner',
  rebelde: 'Rebellion',
  // English client synonyms the catalog renames away from
  creator: 'Biochemist',
  clown: 'Bard',
  dancer: 'Gypsy',
  // es (Spanish client) — only the forms that differ from pt-BR
  creador: 'Biochemist',
  asesino: 'Assassin Cross',
  caballero: 'Lord Knight',
}

interface ClassSurface {
  surface: string
  name: string
}

/** Every accepted spelling (official + localized) in normalized space. */
const CLASS_SURFACES: readonly ClassSurface[] = [
  ...OFFICIAL_CLASSES.map((name) => ({ surface: normalizeClassName(name), name })),
  ...Object.entries(CLASS_ALIASES).map(([surface, name]) => ({
    surface: normalizeClassName(surface),
    name,
  })),
]

function uniqueNames(surfaces: readonly ClassSurface[]): string[] {
  return [...new Set(surfaces.map((entry) => entry.name))]
}

/**
 * Map an OCR'd job string to one of the 15 official class names.
 * Exact (normalized) first, then containment (longest matching spelling wins,
 * so "Mestre-Ferr" is Mastersmith and not Champion), then bounded
 * Levenshtein ("Gypsv" -> "Gypsy", "Criador" -> Biochemist via the alias
 * table). Ambiguous or unknown input returns null — NEVER a default class
 * (a wrong class would silently corrupt cohorts).
 */
export function matchClassName(observed: string | null | undefined): string | null {
  const o = normalizeClassName(observed)
  if (o.length < 2) return null

  const exact = uniqueNames(CLASS_SURFACES.filter((entry) => entry.surface === o))
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null

  // Containment needs at least 3 characters: two-letter fragments ("Nv" from
  // the localized "Classe Nv40" job-level row) must never resolve a class.
  if (o.length >= 3) {
    const contained = CLASS_SURFACES.filter(
      (entry) => entry.surface.includes(o) || o.includes(entry.surface),
    )
    if (contained.length > 0) {
      const longest = Math.max(...contained.map((entry) => entry.surface.length))
      const names = uniqueNames(contained.filter((entry) => entry.surface.length === longest))
      return names.length === 1 ? names[0] : null
    }
  }

  const candidates = CLASS_SURFACES.map((entry) => {
    const maxDistance = Math.max(1, Math.floor(0.25 * Math.min(o.length, entry.surface.length)))
    return { name: entry.name, distance: levenshtein(o, entry.surface), maxDistance }
  }).filter((candidate) => candidate.distance <= candidate.maxDistance)
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.distance - b.distance)
  const best = candidates.filter((candidate) => candidate.distance === candidates[0].distance)
  const names = [...new Set(best.map((candidate) => candidate.name))]
  return names.length === 1 ? names[0] : null
}

// "ID 32980", "ID: 32O8O", "ID.32980" — O is the classic digit-zero OCR slip,
// and the label itself is often read as "1D"/"lD" (measured on the shipped
// English fixture). The negative lookahead keeps a 13+ digit run from being
// silently truncated.
const ID_PATTERN = /\b[Il1][D]\b\s*[:.]?\s*([0-9O]{3,12})(?![0-9O])/i
// The class band label, whatever the client locale prints: "Job Gypsy"
// (English), "Job: Lord Knight", "Classe   Criador" (pt-BR), "Clase Creador"
// (es). The value must start with a letter so a bare digits run never matches,
// and a digit terminates it so the localized "Classe Nv40" job-level row can
// never be read as a class.
const CLASS_LABEL_SOURCE = /\b(?:Job|Class|Classe|Clase)\b\s*[:.]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,30})/i
// Label position inside one line (used to split nickname | class | ID bands).
const CLASS_LABEL = /\b(?:Job|Class|Classe|Clase)\b/i

/** Every class-label occurrence's captured value, in reading order. */
function classLabelValues(text: string): string[] {
  const matches = text.matchAll(new RegExp(CLASS_LABEL_SOURCE.source, 'gi'))
  return [...matches].map((match) => match[1].trim())
}

// Lines/tokens that are labels/values around the nickname band, never the
// nickname (English + localized client vocabulary).
const NICKNAME_KEYWORDS = [
  'job',
  'id',
  'power',
  'poder',
  'guild',
  'guilda',
  'lider',
  'líder',
  'level',
  'nivel',
  'nível',
  'nv',
  'base',
  'basico',
  'básico',
  'detalhes',
  'details',
  'hp',
  'sp',
  'pv',
  'pm',
  'exp',
  'class',
  'classe',
  'clase',
  'atk',
  'def',
  'name',
  'nick',
  'rank',
  'status',
]

/**
 * Turn one raw OCR fragment into a nickname, or null when it is not one.
 * `allowDigits` is only true for the band LEFT of the class label (strong
 * positional evidence: the game prints the nickname there, so "Helz2010" is
 * a real nickname) — standalone lines stay digit-free so the ID/power rows
 * are never mistaken for a name.
 *
 * STRICT SHAPE (2026-10-22, owner-reported "dh" prefill): a nickname is a
 * printed word run, so it must carry at least 3 letters and consist only of
 * letters/digits/spaces starting with a letter. Fragments left by a crop that
 * cut a name open ("dh", "ah", "oy", "Pp", "IL", "WZ") and OCR noise glued to
 * punctuation ("y Arvah /") are rejected — the field stays empty and the
 * player types the real name (D-03: never guess an identity).
 */
function nicknameCandidate(value: string, allowDigits: boolean): string | null {
  const candidate = value
    .replace(/^[^A-Za-zÀ-ÿ0-9]+/, '')
    .replace(/[|_]+$/g, '')
    .trim()
  if (candidate.length < 3 || candidate.length > 20) return null
  if ((candidate.match(/[A-Za-zÀ-ÿ]/g) ?? []).length < 3) return null
  if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 ]*$/.test(candidate)) return null
  if (!allowDigits && /[0-9]/.test(candidate)) return null
  const lower = candidate.toLowerCase()
  if (NICKNAME_KEYWORDS.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(lower))) return null
  if (matchClassName(candidate) !== null) return null
  return candidate
}

/**
 * Parse the full-canvas OCR text of a Basic screenshot into identity fields.
 * The English client sample reads:
 *
 *   Ahrya
 *   Job  Gypsy
 *   ID 32980
 *   Power  288115
 *
 * The pt-BR client (the live one, 08.10 hotfix) reads:
 *
 *   SoldierHelIz
 *   Classe  Criador      ID 17069
 *   Líder da Guilda Suprema
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

  // Try EVERY label occurrence and keep the first value that resolves: the
  // header band ("Classe Criador") and the job-level row ("Classe Nv40") share
  // a label, and OCR may emit either first.
  let char_class: string | null = null
  for (const observed of classLabelValues(raw)) {
    const match = matchClassName(observed)
    if (match !== null) {
      char_class = match
      break
    }
  }

  let nickname: string | null = null
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  // 1. Preferred: the band left of the class label on the same line. SPARSE_TEXT
  //    commonly merges the whole header row ("SoldierHelIz Classe Criador ID 17069").
  for (const line of lines) {
    const labelAt = line.search(CLASS_LABEL)
    if (labelAt <= 0) continue
    const candidate = nicknameCandidate(line.slice(0, labelAt), true)
    if (candidate !== null) {
      nickname = candidate
      break
    }
  }

  // 2. The lines immediately ABOVE the class band. The client prints the
  //    nickname there, while the screen tabs ("Básico" / "Detalhes") sit above
  //    THAT. Measured on the real pt-BR sample: SPARSE_TEXT emits the name and
  //    then the copy-icon artifact as its own 2-glyph line ("Ahrya", "SN",
  //    "Classe Sumo Sacerdote") — so score the window instead of "nearest wins".
  //    Digits are allowed only directly above the class band (the nickname
  //    band); a line further up with digits is a stat row, not a name.
  if (nickname === null) {
    const classLine = lines.findIndex((line) => CLASS_LABEL.test(line))
    if (classLine > 0) {
      let best: { value: string; score: number; length: number } | null = null
      for (let i = classLine - 1; i >= 0 && i >= classLine - 3; i--) {
        const distance = classLine - i
        const candidate = nicknameCandidate(lines[i], distance === 1)
        if (candidate === null) continue
        let score = Math.max(0, 4 - distance) // proximity: 3 / 2 / 1
        if (/[a-zà-ÿ]/.test(candidate)) score += 2
        if (candidate.length >= 3) score += 2
        if (candidate.length >= 5) score += 1
        if (candidate === candidate.toUpperCase()) score -= 2
        const better =
          best === null || score > best.score || (score === best.score && candidate.length > best.length)
        if (better) best = { value: candidate, score, length: candidate.length }
      }
      nickname = best?.value ?? null
    }
  }

  // 3. Fallback: the first standalone line that looks like a name (no class
  //    band readable at all, or bands the OCR already separated). Without the
  //    class band there is no positional evidence, so demand a CAPITALISED
  //    first letter: a crop that cut a name open leaves a lowercase fragment
  //    ("ryah", "yah Vd", "dh") and that must stay unread (D-03) instead of
  //    being prefilled as the player's nickname.
  if (nickname === null) {
    for (const line of lines.slice(0, 5)) {
      if (CLASS_LABEL.test(line)) continue
      const candidate = nicknameCandidate(line, false)
      if (candidate !== null && /^[A-ZÀ-Ý]/.test(candidate)) {
        nickname = candidate
        break
      }
    }
  }

  return { nickname, char_id, char_class }
}

// ---------------------------------------------------------------------------
// Structural nickname read (word boxes)
// ---------------------------------------------------------------------------
//
// Owner report (2026-10-22): a capture whose crop cut the name open prefilled
// the nickname with the OCR fragment "dh". Text alone cannot tell a fragment
// from a short name, but the card's LAYOUT can: the game prints the nickname
// LEFT-ALIGNED with the class label directly below it. Measured on every
// sample (.secrets/ocr-samples):
//
//   sampbasicideal.png   "Ahrya"@158,104,235,135   "Job"@157,150,197,176
//   Samplebasicptbr.png  "Ahrya"@167,32,244,63     "Classe"@168,78,243,100
//   sampidentityaryah    "Aryah"@169,25,245,56     "Classe"@170,71,245,93
//
// Same card, one crop that starts inside the name (L190): only "ryah"@0
// survives and the class band is gone — nothing to anchor on, so the strict
// shape rules above refuse it instead of prefilling "ryah"/"dh".

/** One OCR word with its pixel box (tesseract `blocks: true` output). */
export interface OcrWord {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

/** The class band is the anchor; when it is found it OWNS the nickname field
 *  (`nickname: null` means "the card header is not in this capture", never
 *  "fall back to guessing from lines"). */
export interface NicknameLayout {
  anchored: boolean
  nickname: string | null
}

const CLASS_LABEL_WORD = /^(?:job|class|classe|clase)[:.]?$/i

/**
 * The nickname of the card header, decided from the word boxes:
 * the word directly ABOVE the class label whose left edge matches the label's
 * (the game prints the name left-aligned with "Job"/"Classe"), with fragments
 * of the same printed word glued back together ("A" + "ryah" -> "Aryah") and
 * the edit-pencil icon / copy badge discarded.
 */
export function nicknameFromLayout(words: readonly OcrWord[], imageWidth: number): NicknameLayout {
  const usable = words.filter(
    (word) =>
      typeof word.text === 'string' &&
      word.text.trim() !== '' &&
      Number.isFinite(word.x0) &&
      Number.isFinite(word.y1),
  )
  // Anchor = the topmost class-label word ("Classe"/"Job"/...). The job-level
  // row prints "Classe/Nv40" as ONE token, which this pattern cannot match.
  const label = usable
    .filter((word) => CLASS_LABEL_WORD.test(word.text.trim()))
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)[0]
  if (label === undefined) return { anchored: false, nickname: null }

  // One text line up. A word overlapping the label's own band (the copy badge,
  // a portrait edge) is not part of the name band.
  const labelHeight = Math.max(1, label.y1 - label.y0)
  const band = usable.filter((word) => {
    if (word === label) return false
    const gap = label.y0 - word.y1
    return gap >= -0.25 * labelHeight && gap <= 1.5 * labelHeight
  })
  if (band.length === 0) return { anchored: true, nickname: null }

  const tolerance = Math.max(3, 0.015 * imageWidth)
  const start = band
    .filter((word) => Math.abs(word.x0 - label.x0) <= tolerance)
    .sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0)[0]
  // A crop that cut the name open leaves its first surviving glyph to the
  // right of the label edge: nothing is aligned, so the field stays empty
  // instead of prefilling a fragment like "ryah"/"dh".
  if (start === undefined) return { anchored: true, nickname: null }

  // Extend over the rest of the printed name: a glyph run with normal word
  // spacing. The edit-pencil icon / copy badge is printed SMALLER than the
  // name's glyphs and sits apart, so it never enters the name.
  const nameHeight = Math.max(1, start.y1 - start.y0)
  let text = start.text.trim()
  const toTheRight = band
    .filter((word) => word.x0 >= start.x1 - 1)
    .sort((a, b) => a.x0 - b.x0)
  let previous = start
  for (const word of toTheRight) {
    if (word.x0 - previous.x1 > 0.6 * nameHeight) break
    if (word.y1 - word.y0 < 0.6 * nameHeight) break
    const next = word.text.trim()
    // Glue a cut word back together ("A"+"ryah"); keep a real word boundary.
    const glued = previous.text.trim().length <= 2 || /^[a-zà-ÿ]/.test(next)
    text += glued ? next : ` ${next}`
    previous = word
  }
  return { anchored: true, nickname: nicknameCandidate(text, true) }
}

// ---------------------------------------------------------------------------
// Structural ID read (word boxes)
// ---------------------------------------------------------------------------
//
// Owner report (2026-10-23): SoldierHellz (ID 17069) never got its ID
// prefilled. SPARSE_TEXT read the printed "ID 17069" as ONE word, "1017069E":
// the label's I became "1", the D became "0", both glued to the number, plus
// the copy badge as "E". No text rule can split that safely — a power value
// starting "10…" would match the same shape — but the card's LAYOUT can: the
// ID is printed on the class band, right of the class value. Gated by that
// geometry, a token that is EXACTLY label-glyphs + number (+ badge) is the ID
// row, and the leading pair is the label, never part of the number.

const ID_LABEL_WORD = /^[Il1][D][:.]?$/i
const ID_LABEL_GLUED = /^[Il1][D0O]([0-9O]{3,12})[A-Za-z]?$/i
const ID_NUMBER_WORD = /^([0-9O]{3,12})[A-Za-z]?$/i

/**
 * The ID inside one ID-band token, or null. The glued-label form is tried
 * FIRST: on that band a leading label pair is the label ("1017069E" ->
 * "17069"), so the bare reading of the same token would corrupt the number
 * with the label's glyphs.
 */
function idFromToken(token: string): string | null {
  const glued = ID_LABEL_GLUED.exec(token) ?? ID_NUMBER_WORD.exec(token)
  if (glued === null) return null
  const digits = glued[1].replace(/O/gi, '0')
  return /^\d{3,12}$/.test(digits) ? digits : null
}

/**
 * The character ID from the word boxes — a RESCUE the caller consults only
 * when the text parse found nothing (the text read wins when both see a
 * number). The ID prints on the class band, right of the class value, so a
 * digits-shaped token there is the ID; anything off that band (a stat value
 * further down, a nickname above) is never considered. Missing, unread or
 * ambiguous -> null: the player types the ID (D-03: never guess an identity).
 */
export function idFromLayout(words: readonly OcrWord[]): string | null {
  const usable = words.filter(
    (word) =>
      typeof word.text === 'string' &&
      word.text.trim() !== '' &&
      Number.isFinite(word.x0) &&
      Number.isFinite(word.y0) &&
      Number.isFinite(word.x1) &&
      Number.isFinite(word.y1),
  )
  const label = usable
    .filter((word) => CLASS_LABEL_WORD.test(word.text.trim()))
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)[0]
  if (label === undefined) return null

  // The class band: words whose vertical midpoint sits on the label's line.
  // The ID may print TALLER than the label (measured 42px vs 23px on the
  // owner capture), so the midpoint — not full overlap — decides membership.
  const labelHeight = Math.max(1, label.y1 - label.y0)
  const slack = 0.35 * labelHeight
  const band = usable
    .filter((word) => {
      if (word === label) return false
      const mid = (word.y0 + word.y1) / 2
      return mid >= label.y0 - slack && mid <= label.y1 + slack && word.x0 > label.x1 + 2
    })
    .sort((a, b) => a.x0 - b.x0)

  for (let i = 0; i < band.length; i++) {
    const token = band[i].text.trim()
    // A standalone label word ("ID"/"1D") points at the number printed after
    // it; anything else on the band must carry the number itself.
    if (ID_LABEL_WORD.test(token)) {
      if (band[i + 1] === undefined) continue
      const digits = idFromToken(band[i + 1].text.trim())
      if (digits !== null) return digits
      continue
    }
    const digits = idFromToken(token)
    if (digits !== null) return digits
  }
  return null
}

const ID_ERROR = 'Informe o ID do personagem (somente números, até 12 dígitos).'
const NICKNAME_ERROR = 'Informe o nick do personagem (até 80 caracteres).'
const CLASS_ERROR = 'Selecione a classe do personagem.'
const FUNCTION_ERROR = 'Selecione a função do personagem.'

function identityProblems(value: Partial<SubmissionIdentityDraft>): Array<{
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
  if (charFunction === undefined || !CHAR_FUNCTIONS.includes(charFunction as CharFunction)) {
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
export function validateIdentityDraft(value: SubmissionIdentityDraft): string[] {
  return identityProblems(value).map((problem) => problem.message)
}
