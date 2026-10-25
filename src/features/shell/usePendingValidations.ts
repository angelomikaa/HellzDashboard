// usePendingValidations — the round-9 officer notification feed: the
// pending-validation counts behind the Validações tab badge (owner
// 2026-10-25: "currently they need to blindly check the tab to see if
// something new arrived").
//
// Polls pending_validation_count (0030 — two integers, officer-gated
// server-side) every POLL_MS and refetches on window focus, so an officer
// parked on any tab sees the badge move without touching Validações. The
// hook is deliberately DUMB: no toasts, no sounds — the badge is the whole
// notification surface, and it must work for every officer regardless of
// notification permissions. A failed poll (member session → 'forbidden',
// network → null) keeps the last known counts; null counts render no badge
// (never a red zero from a transient error).
import { useEffect, useState } from 'react'
import {
  fetchPendingValidationCount,
  type PendingValidationCount,
} from '../../lib/api'
import type { NeoFootSession } from '../auth/session'

const POLL_MS = 60_000

export function usePendingValidations(
  session: NeoFootSession,
  enabled: boolean,
): PendingValidationCount | null {
  const [counts, setCounts] = useState<PendingValidationCount | null>(null)

  useEffect(() => {
    if (!enabled) {
      setCounts(null)
      return
    }
    let cancelled = false
    const poll = () => {
      void fetchPendingValidationCount(session).then((next) => {
        if (!cancelled && next !== null) setCounts(next)
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

  return counts
}
