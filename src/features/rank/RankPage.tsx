// Ranking & Análise — the staff ranking shell (Phase 10.9 UI reorganization).
//
// Three SIBLING sections, one tablist, no nested modes:
//   1. Ranking OVR      — role boards; the 59-stat detail is a modal.
//   2. Explorador de stats — one stat across all members, with search/filters.
//   3. Análise estatística — the regression/buff investigation dashboard.
//
// STAFF-ONLY BY CONSTRUCTION: this page is mounted only inside App.tsx's staff
// branch; the real enforcement is inside each RPC (role_rank, stat_overview,
// stat_regression_dataset). The UI gate is UX-only.
import { useEffect, useState } from 'react'
import {
  fetchCatalog,
  fetchClasses,
  type RoleRankRow,
  type StatCatalogEntry,
} from '../../lib/api'
import { OvrRankingSection } from './OvrRankingSection'
import { StatExplorerSection } from './StatExplorerSection'
import { AnalysisSection } from './AnalysisSection'
import type { NeoFootSession } from '../auth/session'

type RankSection = 'ovr' | 'stats' | 'analysis'

const SECTIONS: { value: RankSection; label: string }[] = [
  { value: 'ovr', label: 'Ranking OVR' },
  { value: 'stats', label: 'Explorador de stats' },
  { value: 'analysis', label: 'Análise estatística' },
]

const PANEL_ID = 'ranking-section-panel'

export function RankPage({ session }: { session: NeoFootSession }) {
  const [section, setSection] = useState<RankSection>('ovr')
  const [classes, setClasses] = useState<string[]>([])
  const [catalog, setCatalog] = useState<StatCatalogEntry[]>([])

  // Shared catalog/classes for the first two sections. Failures degrade the
  // filters only; each section owns its own data error.
  useEffect(() => {
    let cancelled = false
    fetchClasses(session)
      .then((list) => {
        if (!cancelled) setClasses(list)
      })
      .catch(() => {
        /* filter degraded to all-classes */
      })
    fetchCatalog(session)
      .then((entries) => {
        if (!cancelled) setCatalog(entries)
      })
      .catch(() => {
        /* grouping/picker degraded; rows still render */
      })
    return () => {
      cancelled = true
    }
  }, [session])

  const activeLabel =
    SECTIONS.find((option) => option.value === section)?.label ?? 'Ranking OVR'

  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <h2 className="text-xl font-semibold text-content">Ranking &amp; Análise</h2>
      <p className="mt-1 text-sm text-muted">
        Ranking por função, exploração de um stat e análise estatística — para oficiais.
      </p>

      <div
        role="tablist"
        aria-label="Seções do ranking"
        className="mt-4 flex gap-1 overflow-x-auto pb-1"
      >
        {SECTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            id={`ranking-tab-${option.value}`}
            role="tab"
            aria-selected={section === option.value}
            aria-controls={PANEL_ID}
            onClick={() => setSection(option.value)}
            className={`h-11 shrink-0 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              section === option.value
                ? 'border-accent bg-accent text-accent-foreground glow-accent-soft'
                : 'border-line text-muted hover-control hover:text-content'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`ranking-tab-${section}`}
        aria-label={activeLabel}
      >
        {section === 'ovr' && (
          <OvrRankingSection session={session} classes={classes} catalog={catalog} />
        )}
        {section === 'stats' && (
          <StatExplorerSection session={session} classes={classes} catalog={catalog} />
        )}
        {section === 'analysis' && <AnalysisSection session={session} />}
      </div>
    </section>
  )
}

// ---- Testable helpers (node env) ----
// Pure helpers over a RoleRankRow so node-env tests can assert the identity
// display contract without a DOM: char_id is rendered in monospace when
// present and omitted entirely for null/empty (legacy) rows.
export function rankCharId(input: RoleRankRow | string | null | undefined): string | null {
  if (input == null) return null
  if (typeof input === 'string') return input === '' ? null : input
  return input.char_id ?? null
}

export function hasRankCharId(input: RoleRankRow | string | null | undefined): boolean {
  return rankCharId(input) !== null
}

export function formatRankCharId(input: RoleRankRow | string | null | undefined): string {
  return rankCharId(input) ?? ''
}

export function rankIdentityLine(input: RoleRankRow | string | null | undefined): string {
  return formatRankCharId(input)
}
