import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TIMEOUT_MS, fetchWithTimeout, TimeoutError } from './http'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchWithTimeout', () => {
  it('defaults to a 15 s deadline and aborts a stalled request', async () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(15_000)
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      })
    })

    await expect(fetchWithTimeout('https://example.test', undefined, 5)).rejects.toBeInstanceOf(
      TimeoutError,
    )
    expect(signal?.aborted).toBe(true)
  })

  it('resolves a normal response and clears the deadline', async () => {
    const response = { ok: true, status: 200 } as Response
    vi.stubGlobal('fetch', async () => response)
    await expect(fetchWithTimeout('https://example.test', undefined, 50)).resolves.toBe(response)
  })

  it('never replaces a caller-provided signal', async () => {
    const caller = new AbortController()
    let seen: AbortSignal | undefined
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen = init.signal ?? undefined
      return { ok: true, status: 200 } as Response
    })
    await fetchWithTimeout('https://example.test', { signal: caller.signal }, 10)
    expect(seen).toBe(caller.signal)
  })

  it('propagates non-timeout failures untouched', async () => {
    const boom = new TypeError('network down')
    vi.stubGlobal('fetch', async () => {
      throw boom
    })
    await expect(fetchWithTimeout('https://example.test', undefined, 50)).rejects.toBe(boom)
  })

  it('keeps the request alive when the deadline is disabled', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined
      return { ok: true, status: 200 } as Response
    })
    await fetchWithTimeout('https://example.test', undefined, 0)
    expect(signal).toBeUndefined()
  })
})
