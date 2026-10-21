// PIN-box state helpers (08-03 task 1, D-02).
//
// PURE module — the 4-box control is a thin renderer over these transitions,
// so typing/paste/backspace/navigation are unit-testable in the node test
// environment (the repo ships no DOM testing library and the no-new-deps rule
// stands). The value is always a digits-only string; callers validate
// completeness with pinComplete().

export const PIN_LENGTH = 4

/** Keep only digits, capped at the PIN length (letters are impossible). */
export function normalizePinDigits(input: string | null | undefined): string {
  return String(input ?? '').replace(/\D/g, '').slice(0, PIN_LENGTH)
}

/** One slot per box; missing positions are '' (non-digits are dropped). */
export function pinChars(value: string): string[] {
  return Array.from({ length: PIN_LENGTH }, (_, index) => {
    const char = value[index]
    return char !== undefined && /\d/.test(char) ? char : ''
  })
}

/** Type one digit into a box and advance to the next box. */
export function setPinDigit(
  value: string,
  index: number,
  digit: string,
): { value: string; focus: number } {
  const safeIndex = Math.max(0, Math.min(index, PIN_LENGTH - 1))
  const chars = pinChars(value)
  const cleaned = normalizePinDigits(digit)
  if (cleaned.length === 0) {
    return { value: chars.join(''), focus: safeIndex }
  }
  // A box always receives one digit; a longer run is treated as a paste.
  if (cleaned.length > 1) return pinFromPaste(cleaned)
  chars[safeIndex] = cleaned
  return { value: chars.join(''), focus: Math.min(safeIndex + 1, PIN_LENGTH - 1) }
}

/** Paste of up to 4 digits fills from the first box. */
export function pinFromPaste(raw: string): { value: string; focus: number } {
  const digits = normalizePinDigits(raw)
  return { value: digits, focus: Math.max(0, digits.length - 1) }
}

/** Backspace clears the current box, or steps back and clears the previous. */
export function backspacePin(value: string, index: number): { value: string; focus: number } {
  const safeIndex = Math.max(0, Math.min(index, PIN_LENGTH - 1))
  const chars = pinChars(value)
  if (chars[safeIndex] !== '') {
    chars[safeIndex] = ''
    return { value: chars.join(''), focus: safeIndex }
  }
  const previous = Math.max(0, safeIndex - 1)
  chars[previous] = ''
  return { value: chars.join(''), focus: previous }
}

/** ArrowLeft/ArrowRight navigation, clamped to the four boxes. */
export function arrowFocus(index: number, key: 'ArrowLeft' | 'ArrowRight'): number {
  const delta = key === 'ArrowLeft' ? -1 : 1
  return Math.max(0, Math.min(index + delta, PIN_LENGTH - 1))
}

/** A PIN is submittable only when exactly four digits are present. */
export function pinComplete(value: string): boolean {
  return /^\d{4}$/.test(value)
}
