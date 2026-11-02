// fetchWithTimeout — the single network boundary for the data layer.
//
// Every API call used to await `fetch` with no deadline: a stalled TCP
// connection (captive portal, flaky mobile network, a hung Supabase replica)
// left the UI on "Carregando…" forever, with no error to render. The timeout
// is deliberately ONE value for the whole app (15 s) and lives here so it can
// never drift between the REST, Storage and Edge paths.

export const DEFAULT_TIMEOUT_MS = 15_000

/** Distinguishes a deadline from a caller/network abort (internal to the layer). */
export class TimeoutError extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`request timed out after ${timeoutMs}ms`)
    this.name = 'TimeoutError'
    this.timeoutMs = timeoutMs
  }
}

/**
 * `fetch` with a deadline. A caller-provided `signal` wins (the caller owns
 * cancellation and we must not replace it); otherwise an internal
 * AbortController is aborted at `timeoutMs`. `timeoutMs <= 0` disables the
 * deadline (tests / explicit opt-out).
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  if (init?.signal || timeoutMs <= 0) return fetch(input, init ?? {})

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    // We only abort on the deadline, so an aborted signal here is a timeout.
    if (controller.signal.aborted) throw new TimeoutError(timeoutMs)
    throw error
  } finally {
    clearTimeout(timer)
  }
}
