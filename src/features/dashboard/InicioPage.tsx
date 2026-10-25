// InicioPage — the guild LANDING page (Phase 10, HOME-01/HOME-02; owner
// correction 2026-10-24: "Destaques and Inicio were supposed to be the same
// page - a page that can be seen when a visitor arrives and also visible to
// logged in users - this is why its called inicio, its a landing page").
//
// One page, two audiences:
//   - visitor (no session): the Impecáveis showcase only, fetched with the
//     anon-callable get_promotion_public RPC (0029). The public shell around
//     it (mark + Entrar/Solicitar acesso) lives in PublicLanding.
//   - member: the same showcase PLUS the personal blocks — own OVR card
//     (reused OvrHero) from my_report, the stale-data CTA when data is
//     strictly >7 days old (evergreen first-submission variant when never
//     submitted), and a top-3 best-stats strip.
//
// The showcase is not duplicated for members: the exact same
// PromotionShowcase tree renders in both states, so what a visitor previews is
// what a member sees. Points and OVR arrive opaque from the RPCs — never
// recomputed client-side (AGENTS.md).
//
// Mount-fetch pattern mirroring DashboardPage: useEffect with cancelled flag,
// fetchMyReport(session), ApiError kind -> NETWORK_ERROR/SESSION_ERROR pt-BR
// copy. Switching tabs unmounts the page, so returning to Início refetches.
import { useEffect, useState } from 'react'
import { ApiError, fetchMyReport, type MyReport } from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import type { Tab } from '../../App'
import { PromotionShowcase } from '../highlights/PromotionShowcase'
import { OvrHero } from './OvrHero'
import { formatStatValue } from '../../lib/parseStatValue'
import { tierForPoints, type Tier } from './presentation'

// Enumeration-safe pt-BR copy (DashboardPage pattern): raw server text is never
// rendered — errors map to one of two fixed strings.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'

const CTA_FIRST = 'Envie seus status para ver seu OVR e seus melhores stats.'
const CTA_STALE =
  'Seus dados estão desatualizados — envie um novo status para manter seu ranking em dia.'
const CTA_BUTTON = 'Enviar Status'

// Pure: days since the member last validated a submission. `now` defaults to
// Date.now() in production; tests pass it explicitly for boundary determinism.
export function daysSince(lastValidatedAt: string, now: number = Date.now()): number {
  return (now - new Date(lastValidatedAt).getTime()) / (1000 * 60 * 60 * 24)
}

// Pure: 'first' = never submitted, 'stale' = strictly >7 days since last
// validation, null = fresh data (≤7 days). Boundary is strictly-greater-than:
// exactly 7 days returns null (no banner).
export function extractStaleBanner(
  report: MyReport,
  now: number = Date.now(),
): 'first' | 'stale' | null {
  if (report.last_validated_at === null) return 'first'
  if (daysSince(report.last_validated_at, now) > 7) return 'stale'
  return null
}

// Pure: top-3 best stats by points desc, each with formatted value, raw points,
// and tier badge. Points arrive opaque from the RPC — never recomputed.
export function extractTop3(report: MyReport): Array<{
  stat_key: string
  label: string
  value: string
  points: number
  tier: Tier | null
}> {
  return report.stats
    .filter((s) => s.own_value !== null && s.points !== null)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 3)
    .map((s) => ({
      stat_key: s.stat_key,
      label: s.label,
      value: formatStatValue(s.own_value!, s.value_type),
      points: Math.round(s.points!),
      tier: tierForPoints(s.points),
    }))
}

/**
 * The landing page. `session` is null for visitors: the personal blocks are
 * omitted entirely and only the showcase renders. `onNavigate` is required
 * whenever a session exists (the stale/first CTA needs to reach Enviar Status).
 */
export function InicioPage({
  session,
  onNavigate,
}: {
  session: NeoFootSession | null
  onNavigate?: (tab: Tab) => void
}) {
  return (
    <div className="flex flex-col gap-12">
      {session !== null && onNavigate !== undefined && (
        <PersonalHome session={session} onNavigate={onNavigate} />
      )}
      <PromotionShowcase />
    </div>
  )
}

/** Member-only personal blocks: own OVR, stale CTA, top-3 strip. Its own
 *  component so the hooks are unconditional (InicioPage itself has none) and
 *  a visitor render never fetches my_report. */
function PersonalHome({
  session,
  onNavigate,
}: {
  session: NeoFootSession
  onNavigate: (tab: Tab) => void
}) {
  const [report, setReport] = useState<MyReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMyReport(session)
      .then((r) => {
        if (!cancelled) setReport(r)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof ApiError && err.kind === 'unauthorized'
            ? SESSION_ERROR
            : NETWORK_ERROR,
        )
      })
    return () => {
      cancelled = true
    }
  }, [session])

  // Narrowing note: guard `report === null` DIRECTLY below, never through a
  // `const loading = report === null && error === null` alias — aliased
  // condition narrowing breaks on some TypeScript builds (Vercel TS18047) even
  // though newer local tsc accepts it. The error branch above already
  // returned, so `report === null` here is exactly the loading state.
  const banner = report !== null ? extractStaleBanner(report) : null
  const top3 = report !== null ? extractTop3(report) : []

  if (error !== null) {
    return (
      <p role="alert" aria-live="polite" className="text-sm font-semibold text-error">
        {error}
      </p>
    )
  }

  if (report === null) {
    // D-03: skeleton loaders instead of the static "Carregando…" pattern.
    // Shapes mirror the OVR hero + top-3 strip so nothing shifts when the
    // report lands; the pulse dies under prefers-reduced-motion.
    return (
      <section aria-busy="true" aria-label="Resumo do personagem" className="flex flex-col gap-6">
        <div
          aria-hidden="true"
          className="animate-pulse rounded-lg border border-line bg-surface/70 p-6"
        >
          <div className="h-3 w-10 rounded bg-line" />
          <div className="mt-3 h-12 w-20 rounded bg-line" />
          <div className="mt-3 h-5 w-40 rounded bg-line" />
          <div className="mt-2 h-4 w-52 rounded bg-line" />
        </div>
        <div
          aria-hidden="true"
          className="animate-pulse rounded-lg border border-line bg-surface/70 p-6"
        >
          <div className="h-3 w-40 rounded bg-line" />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-20 rounded border border-line bg-dominant"
              />
            ))}
          </div>
        </div>
        <p role="status" className="sr-only">
          Carregando…
        </p>
      </section>
    )
  }

  return (
    <section aria-label="Resumo do personagem" className="flex flex-col gap-6">
      <div className="showcase-reveal">
        <OvrHero
          ovr={report.ovr}
          displayName={session.display_name}
          charClass={report.char_class}
          charFunction={report.char_function}
          layout="card"
        />
      </div>
      {(banner === 'first' || banner === 'stale') && (
        <section
          className="showcase-reveal rounded-lg border border-line bg-surface p-6"
          style={{ animationDelay: '80ms' }}
        >
          <p className="text-base text-muted">{banner === 'first' ? CTA_FIRST : CTA_STALE}</p>
          <button
            type="button"
            onClick={() => onNavigate('submit')}
            className="mt-6 h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {CTA_BUTTON}
          </button>
        </section>
      )}
      {top3.length > 0 && (
        <section
          className="showcase-reveal rounded-lg border border-line bg-surface p-6"
          style={{ animationDelay: banner === null ? '80ms' : '160ms' }}
        >
          <h2 className="text-sm font-semibold text-muted">Seus melhores stats</h2>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {top3.map((stat) => (
              <div
                key={stat.stat_key}
                className="rounded border border-line bg-dominant p-3 flex flex-col gap-1"
              >
                <p className="text-xs text-muted">{stat.label}</p>
                <p className="text-base font-semibold text-content">{stat.value}</p>
                <p
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    stat.tier !== null ? `text-tier-${stat.tier}` : 'text-muted'
                  }`}
                >
                  {stat.points}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
