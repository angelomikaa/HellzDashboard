import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProofField } from './ProofField'
import {
  MAX_PROOF_BYTES,
  MAX_PROOF_INPUT_BYTES,
  PROOF_LABEL,
  PROOF_MAX_SIDE,
  dataUrlByteLength,
  downscaleDimensions,
  proofTooLarge,
  validateProofFile,
} from './proof'

// Plan 08-03 task 1 (T-08-23). Node-env tests cover the guards and the static
// structure; the canvas pipeline itself is browser-only.
describe('ProofField — structure', () => {
  it('accepts only image/jpeg and renders the required label', () => {
    const html = renderToStaticMarkup(
      <ProofField value={null} onChange={() => {}} onImage={() => {}} />,
    )
    expect(html).toContain('accept="image/jpeg"')
    expect(html).toContain(PROOF_LABEL)
    expect(html).toContain('Comprovante (print do personagem, JPEG)')
    expect(html).not.toContain('<form')
  })

  it('previews the selected proof and offers Remover', () => {
    const dataUrl = 'data:image/jpeg;base64,AAAA'
    const html = renderToStaticMarkup(<ProofField value={dataUrl} onChange={() => {}} />)
    expect(html).toContain('Prévia do comprovante')
    expect(html).toContain('Remover')
    expect(html).toContain(dataUrl)
  })

  it('has no preview or Remover action before a file is selected', () => {
    const html = renderToStaticMarkup(<ProofField value={null} onChange={() => {}} />)
    expect(html).not.toContain('Prévia do comprovante')
    expect(html).not.toContain('Remover')
  })
})

describe('validateProofFile — JPEG-only + 8 MB pre-resize guard', () => {
  it('accepts a small JPEG', () => {
    expect(validateProofFile({ type: 'image/jpeg', size: 512 * 1024 })).toBe(null)
  })

  it('rejects PNG/WebP regardless of size', () => {
    expect(validateProofFile({ type: 'image/png', size: 1024 })).toContain('JPEG')
    expect(validateProofFile({ type: 'image/webp', size: 1024 })).toContain('JPEG')
  })

  it('rejects files larger than 8 MB before any resize', () => {
    expect(validateProofFile({ type: 'image/jpeg', size: MAX_PROOF_INPUT_BYTES + 1 })).toContain(
      '8 MB',
    )
    expect(validateProofFile({ type: 'image/jpeg', size: MAX_PROOF_INPUT_BYTES })).toBe(null)
  })
})

describe('downscaleDimensions — longest side <= 1600, never upscales', () => {
  it('scales a wide landscape image', () => {
    expect(downscaleDimensions(3200, 1600)).toEqual({ width: PROOF_MAX_SIDE, height: 800 })
  })

  it('scales a tall portrait image', () => {
    expect(downscaleDimensions(1600, 3200)).toEqual({ width: 800, height: PROOF_MAX_SIDE })
  })

  it('leaves an image already inside the bound untouched', () => {
    expect(downscaleDimensions(691, 416)).toEqual({ width: 691, height: 416 })
    expect(downscaleDimensions(1600, 1600)).toEqual({ width: 1600, height: 1600 })
  })
})

describe('2 MB post-encode budget', () => {
  it('computes the decoded byte length of a data URL', () => {
    // "AAAA" = 3 bytes after base64 decode (4 chars -> 3 bytes).
    expect(dataUrlByteLength('data:image/jpeg;base64,AAAA')).toBe(3)
    // One '=' padding char -> 2 bytes from 4 payload chars ("AAA=").
    expect(dataUrlByteLength('data:image/jpeg;base64,AAA=')).toBe(2)
    expect(dataUrlByteLength('')).toBe(0)
  })

  it('flags payloads above 2 MB and accepts payloads below it', () => {
    const overPayload = 'A'.repeat(Math.ceil((MAX_PROOF_BYTES * 4) / 3) + 8)
    expect(proofTooLarge(`data:image/jpeg;base64,${overPayload}`)).toBe(true)

    const underPayload = 'A'.repeat(Math.ceil(((MAX_PROOF_BYTES - 1024) * 4) / 3))
    expect(proofTooLarge(`data:image/jpeg;base64,${underPayload}`)).toBe(false)
  })
})
