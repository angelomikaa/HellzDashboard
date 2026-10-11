// DashboardPage — the Painel composition (04-UI-SPEC § Layout & Grid,
// CMP-01). Owns the page's ONE data call: fetchMyReport on mount,
// compute-on-read — no polling, no caching, no refresh button. Switching
// tabs unmounts this page (App renders conditionally), so returning to
// Painel refetches; that IS the refresh mechanism.
//
// Security posture (AGENTS.md / 04-UI-SPEC hard rules): the my_report
// response is rendered VERBATIM — this page never derives, hints at, or
// requests key-stat identity (the client types cannot even represent it),
// never queries other individuals (aggregates only — the RPC is the
// sanctioned boundary), and never computes points/OVR client-side: they
// arrive opaque and are presentation inputs exclusively.
//
// The Tab type is imported TYPE-ONLY from App (erased at build time — no
// runtime cycle with App's value import of this module).
import { useEffect, useState } from 'react'
import { ApiError, fetchMyReport, type MyReport } from '../../lib/api'
import { GROUP_LABELS, GROUP_ORDER, type GroupKey } from '../../lib/groups'
import type { NeoFootSession } from '../auth/session'
import type { Tab } from '../../App'
import { StatCard } from './StatCard'
import { OvrHero } from './OvrHero'
import { TierLegend } from './TierLegend'
import { FocusStrip } from './FocusStrip'
import { CollapsibleGroup } from './CollapsibleGroup'

// Enumeration-safe pt-BR copy (KeyStatsPage pattern): raw server text is
// never rendered — errors map to one of two fixed strings.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const EMPTY_TITLE = 'Nenhum status enviado ainda'
const EMPTY_BODY =
  'Envie seus status para ver seus cards, sua posição na classe e o que melhorar.'

export function DashboardPage({
  session,
  onNavigate,
}: {
  session: NeoFootSession
  onNavigate: (tab: Tab) => void
}) {
  // null report = still loading; error holds the mapped pt-BR copy.
  // openGroups per D-05: Geral open by default, Quasi/Especial collapsed —
  // the page owns this state so focus jumps can expand a target group.
  const [report, setReport] = useState<MyReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<GroupKey, boolean>>({ general: true, quasi: false, special: false })

  // Mount-only fetch with a cancelled flag (KeyStatsPage pattern): exactly
  // ONE data call per visit; the cleanup flag makes a fast tab switch away
  // a no-op instead of a stale-state write.
  useEffect(() => {
    let cancelled = false
    fetchMyReport(session)
      .then((r) => {
        if (!cancelled) setReport(r)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
        )
      })
    return () => {
      cancelled = true
    }
  }, [session])

  function toggleGroup(g: GroupKey) {
    setOpenGroups((prev) => ({ ...prev, [g]: !prev[g] }))
  }

  // Focus jump (D-16): expand the target group first, then after the render
  // commit (requestAnimationFrame) smooth-scroll to the card and focus it —
  // the StatCard wrapper carries tabIndex={-1}, so this is programmatic
  // focus only (cards are never in the tab order) and shows the accent ring.
  function handleFocusJump(statKey: string, group: GroupKey) {
    setOpenGroups((prev) => ({ ...prev, [group]: true }))
    requestAnimationFrame(() => {
      const el = document.getElementById(`stat-${statKey}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus()
    })
  }

  const loading = report === null && error === null

  // Render priority (UI-SPEC state matrix): error > loading > empty >
  // success. The empty state (D-13) replaces EVERYTHING below the fold —
  // no hero, no legend, no grayed grid — message + CTA only.
  return (
    <section aria-busy={loading}>
      {error !== null ? (
        <p role="alert" aria-live="polite" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : report === null ? (
        <p className="text-base text-muted">Carregando…</p>
      ) : report.stats.every((s) => s.own_value === null) ? (
        <section className="rounded-lg border border-line bg-surface p-6 text-center">
          <h2 className="text-xl font-semibold text-content">{EMPTY_TITLE}</h2>
          <p className="mt-2 text-base text-muted">{EMPTY_BODY}</p>
          <button
            type="button"
            onClick={() => onNavigate('submit')}
            className="mt-6 h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Enviar Status
          </button>
        </section>
      ) : (
        <>
          {/* Hero + legend + focus strip, then the 57 cards grouped
              Geral/Quasi/Especial (D-04/D-05/D-06). */}
          <OvrHero
            ovr={report.ovr}
            displayName={session.display_name}
            charClass={report.char_class}
            charFunction={report.char_function}
          />
          <TierLegend />
          <FocusStrip stats={report.stats} onJump={handleFocusJump} />
          {GROUP_ORDER.map((group) => (
            <CollapsibleGroup
              key={group}
              groupName={group}
              label={GROUP_LABELS[group]}
              open={openGroups[group]}
              onToggle={toggleGroup}
            >
              {report.stats
                .filter((s) => s.group_name === group)
                .map((s) => (
                  <StatCard key={s.stat_key} stat={s} />
                ))}
            </CollapsibleGroup>
          ))}
        </>
      )}
    </section>
  )
}
