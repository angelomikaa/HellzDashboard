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
  it('enters through the SAME shared dropzone as the stats flows (capture parity)', () => {
    const html = renderToStaticMarkup(
      <ProofField value={null} onChange={() => {}} onImage={() => {}} />,
    )
    expect(html).toContain(PROOF_LABEL)
    expect(html).toContain('Comprovante (print do personagem)')
    // The proof CTA plus the one locked hint every capture surface shows.
    // Short by design: it must fit one line in the strip's column so the
    // zone holds the shared 160 px height (owner alignment rule).
    expect(html).toContain('Faça upload do print aqui')
    expect(html).toContain('Arraste o print ou clique para colar a captura')
    // The same image/* input contract the stats capture uses — a Windows
    // clipboard paste (PNG) must survive the guard (owner report 2026-10-23).
    expect(html).toContain('accept="image/*"')
    // Strip parity: the example and the upload zone share ONE strip — the
    // same lg:flex-row layout every wizard capture strip uses — instead of
    // the zone breaking onto a full-width line below the example.
    expect(html).toContain('lg:flex-row')
    expect(html).not.toContain('<form')
  })

  // Capture parity (2026-10-22): the proof field shows the SAME optimal
  // example the stats wizard and the prospect application use, so members
  // photograph the same screen everywhere (the identity read needs it).
  it('shows the optimal Basic example and the capture hint', () => {
    const html = renderToStaticMarkup(
      <ProofField value={null} onChange={() => {}} onImage={() => {}} />,
    )
    expect(html).toContain('href="/examples/basic.png"')
    expect(html).toContain('src="/examples/basic.png"')
    expect(html).toContain('Exemplo da tela básica do personagem')
    expect(html).toContain('mesma captura do envio de status')
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

describe('validateProofFile — any image input (capture parity) + 8 MB pre-resize guard', () => {
  // A Windows clipboard screenshot pastes as PNG and the stats flows accept
  // image/*, so the proof input accepts every image too — the UPLOADED copy
  // is re-encoded to JPEG by ProofField regardless (owner report 2026-10-23).
  it('accepts JPEG, PNG and WebP inputs', () => {
    expect(validateProofFile({ type: 'image/jpeg', size: 512 * 1024 })).toBe(null)
    expect(validateProofFile({ type: 'image/png', size: 1024 })).toBe(null)
    expect(validateProofFile({ type: 'image/webp', size: 1024 })).toBe(null)
  })

  it('rejects non-image files regardless of size', () => {
    expect(validateProofFile({ type: 'text/plain', size: 1024 })).toContain('imagem')
    expect(validateProofFile({ type: 'video/mp4', size: 1024 })).toContain('imagem')
    expect(validateProofFile({ type: '', size: 1024 })).toContain('imagem')
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
