// CaptureDropzone — the ONE capture surface (owner report 2026-10-23):
// identification, stats submission and recruitment all enter prints
// through this component. Node-env tests pin the static structure and the
// clipboard extraction contract; the drag/paste interactions themselves are
// browser-only.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { CaptureDropzone, clipboardImage } from './CaptureDropzone'

describe('CaptureDropzone — structure', () => {
  it('renders the dashed dropzone with the per-surface CTA, the shared hint and the hidden image/* picker', () => {
    const html = renderToStaticMarkup(
      <CaptureDropzone label="Faça upload dos seus status aqui" running={false} onFile={() => {}} />,
    )
    expect(html).toContain('Faça upload dos seus status aqui')
    // The same locked hint every capture surface shows.
    expect(html).toContain('Arraste o print ou clique para colar a captura')
    expect(html).toContain('border-dashed')
    expect(html).toContain('accept="image/*"')
    expect(html).not.toContain('<form')
  })

  it('swaps the CTA for the shared reading label while a capture runs (zone disabled)', () => {
    const html = renderToStaticMarkup(
      <CaptureDropzone label="Faça upload dos seus status aqui" running onFile={() => {}} />,
    )
    expect(html).toContain('Lendo captura…')
    expect(html).not.toContain('Faça upload dos seus status aqui')
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
  })
})

// Owner checkpoint round 14 (Windows): a screenshot already sits in the
// clipboard, so the dropzone click reads it first. These tests lock the
// EXTRACTION contract only — first image item wins, and every other case
// (no API, denied permission, no image, failing item read) degrades to null
// without throwing, which is what makes the file picker the fallback.
describe('clipboardImage — Windows screenshot shortcut (round 14)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the first image item as a File (Win+Shift+S lands as image/png)', async () => {
    const blob = new Blob(['print'], { type: 'image/png' })
    const getType = vi.fn(async () => blob)
    vi.stubGlobal('navigator', {
      clipboard: {
        read: vi.fn(async () => [
          { types: ['text/plain'], getType: vi.fn() },
          { types: ['text/html', 'image/png'], getType },
        ]),
      },
    })
    const file = await clipboardImage()
    expect(file).not.toBeNull()
    expect(file?.type).toBe('image/png')
    expect(file?.name).toBe('captura.png')
    expect(getType).toHaveBeenCalledWith('image/png')
  })

  it('names a JPEG clipboard item .jpg', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        read: vi.fn(async () => [
          {
            types: ['image/jpeg'],
            getType: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
          },
        ]),
      },
    })
    expect((await clipboardImage())?.name).toBe('captura.jpg')
  })

  it('returns null when the clipboard holds no image', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { read: vi.fn(async () => [{ types: ['text/plain'], getType: vi.fn() }]) },
    })
    expect(await clipboardImage()).toBeNull()
  })

  it('returns null when the API is missing, permission is denied, or the item read fails', async () => {
    vi.stubGlobal('navigator', {})
    expect(await clipboardImage()).toBeNull()

    vi.stubGlobal('navigator', { clipboard: {} })
    expect(await clipboardImage()).toBeNull()

    vi.stubGlobal('navigator', {
      clipboard: {
        read: vi.fn(async () => {
          throw new Error('denied')
        }),
      },
    })
    expect(await clipboardImage()).toBeNull()

    vi.stubGlobal('navigator', {
      clipboard: {
        read: vi.fn(async () => [
          {
            types: ['image/png'],
            getType: vi.fn(async () => {
              throw new Error('item gone')
            }),
          },
        ]),
      },
    })
    expect(await clipboardImage()).toBeNull()
  })
})
