import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PinBoxes } from './PinBoxes'
import {
  arrowFocus,
  backspacePin,
  normalizePinDigits,
  pinChars,
  pinComplete,
  pinFromPaste,
  setPinDigit,
} from './pin'

// Plan 08-03 task 1, D-02. The repo runs node-env Vitest (no DOM library and
// no new dependencies), so interactions are proven on the PURE transitions the
// component calls; static markup proves the accessible four-password-box
// structure and the disabled state.
describe('PinBoxes — structure (D-02)', () => {
  it('renders four masked single-digit inputs with per-box aria labels', () => {
    const html = renderToStaticMarkup(<PinBoxes value="" onChange={() => {}} />)
    const lower = html.toLowerCase()
    expect((html.match(/type="password"/g) ?? []).length).toBe(4)
    expect((lower.match(/inputmode="numeric"/g) ?? []).length).toBe(4)
    expect(html).toContain('aria-label="Dígito 1 de 4"')
    expect(html).toContain('aria-label="Dígito 4 de 4"')
    expect(html).toContain('role="group"')
    expect((lower.match(/maxlength="1"/g) ?? []).length).toBe(4)
    expect(lower).toContain('autocomplete="off"')
  })

  it('never auto-submits: the component renders no form or submit button', () => {
    const html = renderToStaticMarkup(<PinBoxes value="12" onChange={() => {}} />)
    expect(html).not.toContain('<form')
    expect(html).not.toContain('type="submit"')
  })

  it('masks the value and disables every box when disabled', () => {
    const html = renderToStaticMarkup(<PinBoxes value="1234" disabled onChange={() => {}} />)
    expect(html).not.toContain('value="1234"')
    expect((html.match(/disabled=""/g) ?? []).length).toBe(4)
    expect(html).toContain('disabled:opacity-60')
  })

  it('renders the configured group label', () => {
    const html = renderToStaticMarkup(
      <PinBoxes value="" onChange={() => {}} label="Confirme o PIN" />,
    )
    expect(html).toContain('Confirme o PIN')
  })
})

describe('PIN transitions — typing', () => {
  it('keeps only digits and caps at four (letters are impossible)', () => {
    expect(normalizePinDigits('1a2b3c4d5')).toBe('1234')
    expect(normalizePinDigits('abcd')).toBe('')
    expect(normalizePinDigits(null)).toBe('')
  })

  it('fills and advances from box 1 to box 4', () => {
    let state = { value: '', focus: 0 }
    state = setPinDigit(state.value, 0, '1')
    expect(state).toEqual({ value: '1', focus: 1 })
    state = setPinDigit(state.value, 1, '2')
    expect(state).toEqual({ value: '12', focus: 2 })
    state = setPinDigit(state.value, 2, '3')
    expect(state).toEqual({ value: '123', focus: 3 })
    state = setPinDigit(state.value, 3, '4')
    expect(state).toEqual({ value: '1234', focus: 3 })
  })

  it('ignores a non-digit keystroke', () => {
    expect(setPinDigit('12', 2, 'x')).toEqual({ value: '12', focus: 2 })
  })

  it('treats a multi-digit change as a paste and fills all boxes', () => {
    expect(setPinDigit('', 0, '1234')).toEqual({ value: '1234', focus: 3 })
  })
})

describe('PIN transitions — paste/backspace/arrows', () => {
  it('paste of 4 digits fills all boxes and focuses the last', () => {
    expect(pinFromPaste('12a34')).toEqual({ value: '1234', focus: 3 })
    expect(pinFromPaste('9')).toEqual({ value: '9', focus: 0 })
  })

  it('paste of more than four digits keeps the first four', () => {
    expect(pinFromPaste('123456')).toEqual({ value: '1234', focus: 3 })
  })

  it('backspace clears the current box', () => {
    expect(backspacePin('1234', 2)).toEqual({ value: '124', focus: 2 })
  })

  it('backspace on an empty box steps back and clears the previous digit', () => {
    expect(backspacePin('12', 2)).toEqual({ value: '1', focus: 1 })
    expect(backspacePin('', 0)).toEqual({ value: '', focus: 0 })
  })

  it('ArrowLeft/ArrowRight navigate and clamp at the edges', () => {
    expect(arrowFocus(2, 'ArrowLeft')).toBe(1)
    expect(arrowFocus(2, 'ArrowRight')).toBe(3)
    expect(arrowFocus(0, 'ArrowLeft')).toBe(0)
    expect(arrowFocus(3, 'ArrowRight')).toBe(3)
  })

  it('pinComplete is true only for exactly four digits', () => {
    expect(pinComplete('1234')).toBe(true)
    expect(pinComplete('123')).toBe(false)
    expect(pinComplete('12 4')).toBe(false)
    expect(pinChars('12')).toEqual(['1', '2', '', ''])
  })

  it('a full typed sequence produces the exact 4-char string', () => {
    let value = ''
    for (const [index, digit] of ['7', '0', '5', '1'].entries()) {
      value = setPinDigit(value, index, digit).value
    }
    expect(value).toBe('7051')
    expect(pinComplete(value)).toBe(true)
  })
})
