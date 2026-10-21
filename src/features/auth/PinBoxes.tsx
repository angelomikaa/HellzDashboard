// PinBoxes — the 2FA-style 4-box PIN entry (08-03 task 1, D-02).
//
// Used everywhere a PIN is typed: login, first access, confirmation and the
// request form. Four masked single-character inputs, numeric keyboard on
// mobile, no reveal toggle, NO auto-submit — the explicit button submits.
// Typing advances, Backspace clears/steps back, arrows navigate, a 4-digit
// paste fills all boxes, and non-digits are impossible to enter.
//
// T-08-18: the PIN lives only in the parent's transient state (this component
// renders it back masked); it is never stored, logged, or put in a URL.
import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import {
  PIN_LENGTH,
  arrowFocus,
  backspacePin,
  normalizePinDigits,
  pinChars,
  pinFromPaste,
  setPinDigit,
} from './pin'

export interface PinBoxesProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  label?: string
  autoFocus?: boolean
}

export function PinBoxes({
  value,
  onChange,
  disabled = false,
  label = 'PIN (4 dígitos)',
  autoFocus = false,
}: PinBoxesProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const chars = pinChars(value)

  function focusBox(index: number): void {
    const target = refs.current[Math.max(0, Math.min(index, PIN_LENGTH - 1))]
    target?.focus()
    target?.select()
  }

  function apply(next: { value: string; focus: number }): void {
    onChange(next.value)
    focusBox(next.focus)
  }

  function handleChange(index: number, raw: string): void {
    const digits = normalizePinDigits(raw)
    if (digits.length === 0) {
      // Native deletion (mobile keyboards) — clear this box only.
      const cleared = pinChars(value)
      cleared[index] = ''
      onChange(cleared.join(''))
      return
    }
    if (digits.length > 1) {
      // Autofill / paste landing in one box fills all four boxes.
      apply(pinFromPaste(digits))
      return
    }
    apply(setPinDigit(value, index, digits))
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      if (disabled) return
      apply(backspacePin(value, index))
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      focusBox(arrowFocus(index, event.key))
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>): void {
    if (disabled) return
    const pasted = normalizePinDigits(event.clipboardData.getData('text'))
    if (pasted.length === 0) return
    event.preventDefault()
    apply(pinFromPaste(pasted))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-content">{label}</span>
      <div role="group" aria-label={label} className="flex gap-2">
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <input
            key={index}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="password"
            inputMode="numeric"
            pattern="[0-9]"
            maxLength={1}
            autoComplete="off"
            autoFocus={autoFocus && index === 0}
            disabled={disabled}
            aria-label={`Dígito ${index + 1} de ${PIN_LENGTH}`}
            value={chars[index]}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            className="h-12 w-11 rounded-md border border-line bg-surface text-center text-lg font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
        ))}
      </div>
    </div>
  )
}
