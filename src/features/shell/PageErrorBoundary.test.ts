import { describe, expect, it } from 'vitest'
import { isChunkLoadError } from './PageErrorBoundary'

describe('isChunkLoadError', () => {
  it('detects the Vite/Vercel stale-chunk messages', () => {
    expect(
      isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/SubmitPage-old.js')),
    ).toBe(true)
    expect(
      isChunkLoadError(new Error('Importing a module script failed.')),
    ).toBe(true)
    expect(
      isChunkLoadError(new Error('error loading dynamically imported module')),
    ).toBe(true)
    const chunk = new Error('Loading chunk 42 failed.')
    chunk.name = 'ChunkLoadError'
    expect(isChunkLoadError(chunk)).toBe(true)
  })

  it('returns false for ordinary render errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
  })
})
