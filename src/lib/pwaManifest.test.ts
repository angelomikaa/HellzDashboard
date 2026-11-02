// PWA install contract: the manifest, its icons and the index.html links must
// stay in sync. No service worker on purpose — the app is data-driven and a
// stale shell cache is worse than no offline mode.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
  name: string
  short_name: string
  start_url: string
  display: string
  theme_color: string
  background_color: string
  icons: { src: string; sizes: string; type: string; purpose?: string }[]
}
const html = readFileSync('index.html', 'utf8')

describe('PWA manifest', () => {
  it('declares an installable standalone app', () => {
    expect(manifest.name).toContain('Hellz')
    expect(manifest.short_name).toBe('Hellz')
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBe('#141414')
    expect(manifest.background_color).toBe('#141414')
  })

  it('ships every icon it references', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3)
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png')
      expect(existsSync(`public${icon.src}`), icon.src).toBe(true)
    }
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
    expect(manifest.icons.some((icon) => icon.sizes === '192x192')).toBe(true)
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true)
  })

  it('links the manifest, theme color and Apple touch icon', () => {
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(html).toContain('name="theme-color" content="#141414"')
    expect(html).toContain('rel="apple-touch-icon" href="/icon-192.png"')
  })

  it('keeps share metadata for the public landing', () => {
    expect(html).toContain('property="og:title"')
    expect(html).toContain('property="og:description"')
    expect(html).toContain('property="og:image"')
    expect(html).toContain('name="twitter:card"')
  })

  it('does not register a service worker (no stale shell cache)', () => {
    expect(html).not.toContain('serviceWorker')
  })
})
