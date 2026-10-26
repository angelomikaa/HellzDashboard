// usePendingValidations — the round-9 officer notification feed: the
// pending-validation counts behind the Validações tab badge (owner
// 2026-10-25: "currently they need to blindly check the tab to see if
// something new arrived").
//
// Polls pending_validation_count (0031 — three integers, officer-gated
// server-side) every 30s and on window focus, so an officer parked on any
// tab sees the badge move without touching Validações. Round 9 rework
// (owner follow-up "no notifications have appeared"): the poll halved to
// 30s, the RPC now also counts membership REQUESTS (0031 — the Solicitações
// queue 0030 missed), and the hook reports an INCREASE as a ping so the
// shell can toast + flash the tab title when something NEW lands. A failed
// poll (member session → 'forbidden', network → null) keeps the last known
// counts; null counts render no badge (never a red zero from a transient
// error).
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchPendingValidationCount,
  type PendingValidationCount,
} from '../../lib/api'
import type { NeoFootSession } from '../auth/session'

export type { PendingValidationCount }

const POLL_MS = 30_000

export function pendingTotal(counts: PendingValidationCount | null): number {
  return counts === null
    ? 0
    : counts.submissions + counts.identity_proofs + counts.requests
}

/**
 * Whether the new poll result should PING the officer: only an INCREASE
 * from a known state (the first successful poll establishes the baseline
 * silently — opening the app must not toast about old rows).
 */
export function pingDelta(
  previous: PendingValidationCount | null,
  next: PendingValidationCount,
): boolean {
  return previous !== null && pendingTotal(next) > pendingTotal(previous)
}

export interface PendingValidationsFeed {
  counts: PendingValidationCount | null
  /** How MANY new validations appeared on the last increase (the delta,
   *  not the total — "2 novas" means two, not "the queue holds 2"), until
   *  cleared by the toast's dismissal. Null when nothing pinged. */
  ping: number | null
  clearPing: () => void
}

export function usePendingValidations(
  session: NeoFootSession,
  enabled: boolean,
): PendingValidationsFeed {
  const [counts, setCounts] = useState<PendingValidationCount | null>(null)
  const [ping, setPing] = useState<number | null>(null)
  // The last-seen counts live in a ref read inside the poll itself — a
  // state read from the effect closure would be frozen at the effect's own
  // render (the stale-baseline bug: pings that never fire).
  const previousRef = useRef<PendingValidationCount | null>(null)

  useEffect(() => {
    if (!enabled) {
      previousRef.current = null
      setCounts(null)
      return
    }
    let cancelled = false
    const poll = () => {
      void fetchPendingValidationCount(session).then((next) => {
        if (cancelled || next === null) return
        if (pingDelta(previousRef.current, next)) {
          setPing(pendingTotal(next) - pendingTotal(previousRef.current))
        }
        previousRef.current = next
        setCounts(next)
      })
    }
    poll()
    const interval = window.setInterval(poll, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [session, enabled])

  const clearPing = useCallback(() => {
    setPing(null)
  }, [])

  return { counts, ping, clearPing }
}
