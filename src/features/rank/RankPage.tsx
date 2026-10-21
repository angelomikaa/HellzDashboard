// Ranking — officials-only OVR rank view (RANK-02, 07.2 D-18/D-19/D-20).
//
// STAFF-ONLY BY CONSTRUCTION: this page renders for whoever mounts it, but it
// is mounted ONLY inside App.tsx's staff branch (showRanking UX-only gate +
// content re-check, T-06-01 pattern). The REAL enforcement is role_rank's
// internal staff gate — a SECURITY DEFINER RPC checking member_role + active
// inside the function (0013) — so a tampered member client receives nothing
// (smoke-proven in 07.2-01: member JWT raises 'forbidden'). The UI gate is
// UX-only, never the security boundary (D-20).
//
// D-18: the primary axis is the BUILD ROLE — three boards (Dano Físico /
// Dano Mágico / Suporte) ranked by OVR within the role, class as a filter +
// per-row attribute. D-19: one row per member with an expandable per-player
// detail showing all 57 values. D-20: per stat the raw value, the 0–99
// points and the class average — the sanctioned officials visibility
// expansion. Members NEVER see this page or its data.
import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchCatalog,
  fetchClasses,
  fetchRoleRank,
  type RoleRankRow,
} from '../../lib/api'
import { FUNCTION_LABELS, GROUP_LABELS, GROUP_ORDER } from '../../lib/groups'
import { formatStatValue } from '../../lib/parseStatValue'
import { tierForPoints } from '../dashboard/presentation'
import { TIER_BORDER_DISPLAY, TIER_TEXT_DISPLAY } from '../dashboard/tierDisplay'
import { ClassCrest } from '../assets/ClassCrest'
import { applyViewSort, type RankSortKey } from './rankView'
import type { NeoFootSession } from '../auth/session'

// Enumeration-safe pt-BR copy (UI contract): never expose HTTP codes, gateway
// internals, or which check failed (house pattern, ValidacoesPage).
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const EMPTY_MESSAGE = 'Nenhum jogador com dados nesta função ainda.'

// D-18 boards: the build-role axis, in the FUNCTION_LABELS vocabulary — the
// labels can never drift from the shared role map.
const BOARDS = ['dps', 'mdps', 'suporte'] as const
type Board = (typeof BOARDS)[number]

// T-072-11 (accepted): client-side column sort is a VIEW AID over the
// already-fetched array on a staff analysis surface. The DEFAULT view is the
// server OVR order rendered verbatim; member-facing surfaces keep the strict
// server-order discipline and never re-sort.
const SORT_KEYS: { key: RankSortKey; label: string }[] = [
  { key: 'server', label: 'OVR' },
  { key: 'name', label: 'Nome' },
  { key: 'class', label: 'Classe' },
]

export function RankPage({ session }: { session: NeoFootSession }) {
  // Class filter options (D-18: default '— todas as classes' = undefined) +
  // the stat_catalog group join. The role_rank payload is a CLOSED field list
  // (0013 census: no per-stat group_name), so grouping needs the catalog's
  // group_name keyed by stat_key — staff-only RLS read, same as Stats-Chave.
  const [classes, setClasses] = useState<string[]>([])
  const [statGroups, setStatGroups] = useState<ReadonlyMap<string, string>>(new Map())
  const [board, setBoard] = useState<Board>('dps')
  const [boardClass, setBoardClass] = useState('')

  const [rows, setRows] = useState<RoleRankRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [sortKey, setSortKey] = useState<RankSortKey>('server')
  // One expanded player detail at a time (member_id — display_name has no
  // unique constraint, the fetchRoleRank composite-key discipline).
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Class options + the catalog group map load once; a failure only degrades
  // the filter (the select keeps the all-classes option) — it never blocks
  // the boards themselves. A catalog failure degrades grouping: every stat
  // falls back to the Geral group (unreachable in practice — the catalog is
  // the complete 57-stat list role_rank draws from).
  useEffect(() => {
    let cancelled = false
    fetchClasses(session)
      .then((list) => {
        if (!cancelled) setClasses(list)
      })
      .catch(() => {
        /* filter degraded to all-classes; board fetch owns real errors */
      })
    fetchCatalog(session)
      .then((entries) => {
        if (!cancelled) setStatGroups(new Map(entries.map((e) => [e.stat_key, e.group_name])))
      })
      .catch(() => {
        /* grouping degraded; detail values still render */
      })
    return () => {
      cancelled = true
    }
  }, [session])

  // Board or class change refetches via fetchRoleRank with the cancelled-flag
  // stale-guard pattern (KeyStatsPage loadClassData precedent): the flag
  // guards ALL state writes so a slow earlier fetch can never overwrite the
  // currently selected board.
  useEffect(() => {
    let cancelled = false
    setRows(null)
    setError(null)
    setExpandedId(null)
    setSortKey('server')
    fetchRoleRank(session, board, boardClass === '' ? undefined : boardClass)
      .then((data) => {
        if (!cancelled) setRows(data)
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
  }, [session, board, boardClass])

  // T-072-11 view aid: 'server' passes the payload through verbatim (same
  // reference); name/class sort a copy. Memoized so re-renders (expansions)
  // never re-sort.
  const displayRows = useMemo(
    () => (rows === null ? null : applyViewSort(rows, sortKey)),
    [rows, sortKey],
  )

  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <h2 className="text-xl font-semibold text-content">Ranking</h2>
      <p className="mt-1 text-sm text-muted">
        Comparação por função de build — valor, pontos e média por stat para oficiais.
      </p>

      {/* D-18 board selector: the build-role axis (FUNCTION_LABELS vocabulary). */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Função de build" className="flex gap-1">
          {BOARDS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBoard(b)}
              aria-pressed={board === b}
              className={`h-11 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                board === b
                  ? 'border-accent bg-accent text-accent-foreground glow-accent-soft'
                  : 'border-line text-muted hover-control hover:text-content'
              }`}
            >
              {FUNCTION_LABELS[b]}
            </button>
          ))}
        </div>
        <select
          value={boardClass}
          onChange={(e) => setBoardClass(e.target.value)}
          aria-label="Filtrar por classe"
          className="h-11 rounded-md border border-line bg-surface px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="">— todas as classes</option>
          {classes.map((className) => (
            <option key={className} value={className}>
              {className}
            </option>
          ))}
        </select>
      </div>

      {error !== null ? (
        <p role="alert" aria-live="polite" className="mt-6 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : displayRows === null ? (
        <p className="mt-6 text-base text-muted">Carregando…</p>
      ) : displayRows.length === 0 ? (
        <p className="mt-6 text-center text-base text-muted">{EMPTY_MESSAGE}</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-2 py-2 font-semibold text-muted" aria-label="Classe (ícone)" />
                {/* T-072-11 view aid: headers re-order the fetched array only;
                    'OVR' restores the server order (default view). */}
                {SORT_KEYS.map(({ key, label }) => (
                  <th key={key} scope="col" className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setSortKey(key)}
                      aria-pressed={sortKey === key}
                      className={`rounded px-1 py-0.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        sortKey === key ? 'text-content' : 'text-muted hover:text-content'
                      }`}
                    >
                      {label}
                      {sortKey === key && <span aria-hidden="true"> ▾</span>}
                    </button>
                  </th>
                ))}
                <th scope="col" className="px-2 py-2" aria-label="Detalhe" />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                const isExpanded = expandedId === row.member_id
                const regionId = `rank-detail-${row.member_id}`
                return (
                  <Fragment key={row.member_id}>
                  <tr className="border-b border-line">
                    <td className="px-2 py-2">
                      <ClassCrest charClass={row.char_class} size="sm" />
                    </td>
                    <td className="px-2 py-2 text-content">
                      <div>{row.display_name}</div>
                      {row.char_id !== null && row.char_id !== undefined && row.char_id !== '' && (
                        <div className="font-mono text-xs text-muted">{row.char_id}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-muted">{row.char_class}</td>
                    <td className="px-2 py-2">
                      {/* Display rounding ONLY (Math.round) — the OVR arrives
                          opaque from the RPC; null = insufficient data. */}
                      {row.ovr === null ? (
                        <span className="text-muted">— dados insuficientes</span>
                      ) : (
                        <span className="font-display text-base font-semibold text-content">
                          {Math.round(row.ovr)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setExpandedId((prev) => (prev === row.member_id ? null : row.member_id))}
                        aria-expanded={isExpanded}
                        aria-controls={regionId}
                        className="min-h-11 rounded-md border border-line px-3 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {isExpanded ? 'Fechar' : 'Detalhes'}
                      </button>
                    </td>
                  </tr>
                    {/* Collapsible detail (owner feedback, 07.2-06 checkpoint):
                        expands directly UNDER its row, not after the whole
                        list. Same aria-controls region the button targets. */}
                    {isExpanded && (
                    <tr>
                      <td colSpan={5} className="px-0 py-0">
                        <div
                          id={regionId}
                          className="rounded-md border border-line bg-surface p-3"
                        >
                          {/* All 57 values in payload order, grouped
                              Geral → Quasi → Especial via the catalog join
                              (the closed role_rank payload carries no
                              group_name). Rendered VERBATIM from
                              RoleRankRow.stats — display rounding only, zero
                              client rank math. Unmapped keys (defensive;
                              unreachable — the catalog covers all 57) fall
                              back to Geral. */}
                          {GROUP_ORDER.map((group, index) => {
                            const groupStats = row.stats.filter(
                              (stat) => (statGroups.get(stat.stat_key) ?? 'general') === group,
                            )
                            if (groupStats.length === 0) return null
                            return (
                              <div key={group} className={index === 0 ? '' : 'mt-3'}>
                                <p className="text-sm font-semibold text-content">
                                  {GROUP_LABELS[group]}
                                </p>
                                <div className="mt-1 flex flex-col">
                                  {groupStats.map((stat) => {
                                    const tier = tierForPoints(stat.points)
                                    return (
                                      <div
                                        key={stat.stat_key}
                                        className="flex items-center justify-between gap-2 py-1"
                                      >
                                        <span className="flex min-w-0 items-baseline gap-2">
                                          <span className="text-sm font-semibold text-content">
                                            {stat.label}
                                          </span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2">
                                          {/* D-20: class average for context. */}
                                          <span className="text-sm text-muted">
                                            Média:{' '}
                                            {stat.class_average === null
                                              ? '—'
                                              : formatStatValue(stat.class_average, stat.value_type)}
                                          </span>
                                          <span className="text-sm text-content">
                                            {stat.value === null
                                              ? '—'
                                              : formatStatValue(stat.value, stat.value_type)}
                                          </span>
                                          <span
                                            className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                              tier === null ? 'border-line text-muted' : `${TIER_BORDER_DISPLAY[tier]} ${TIER_TEXT_DISPLAY[tier]}`
                                            }`}
                                          >
                                            {stat.points === null ? '—' : stat.points}
                                          </span>
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ---- Testable helpers (node env) ----
// Pure helpers over a RoleRankRow so node-env tests can assert the identity
// display contract without a DOM: char_id is rendered in monospace when
// present and omitted entirely for null/empty (legacy) rows.
export type RankRowLike = RoleRankRow

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

export function rankRowCharId(input: RoleRankRow | string | null | undefined): string | null {
  return rankCharId(input)
}

export function rankRowHasCharId(input: RoleRankRow | string | null | undefined): boolean {
  return hasRankCharId(input)
}

// aliases
export const rankCharIdText = formatRankCharId
export const rankCharIdLabel = formatRankCharId
export const formatCharId = formatRankCharId
export const charIdForRankRow = rankCharId
export const rankRowIdentity = rankCharId
export const rankIdentity = rankCharId
