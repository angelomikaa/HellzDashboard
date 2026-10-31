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
  fetchStatOverview,
  type RoleRankRow,
  type StatCatalogEntry,
  type StatOverview,
} from '../../lib/api'
import { FUNCTION_LABELS, GROUP_LABELS, GROUP_ORDER } from '../../lib/groups'
import { classLabel } from '../../lib/classLabels'
import { groupLabel, isVirtualClassGroup as isClassGroup, mergedClassOptions } from '../../lib/classGroups'
import { formatStatValue } from '../../lib/parseStatValue'
import { tierForPoints } from '../dashboard/presentation'
import { TIER_BORDER_DISPLAY, TIER_TEXT_DISPLAY } from '../dashboard/tierDisplay'
import { ClassCrest } from '../assets/ClassCrest'
import { applyViewSort, orderStatRows, type RankSortKey, type StatOrder } from './rankView'
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

type RankView = 'ovr' | 'stat'

const submittedFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })
const ratioFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export function RankPage({ session }: { session: NeoFootSession }) {
  // Class filter options (D-18: default '— todas as classes' = undefined) +
  // the stat_catalog. The role_rank payload is a CLOSED field list (0013
  // census: no per-stat group_name), so grouping needs the catalog's
  // group_name keyed by stat_key — staff-only RLS read, same as Stats-Chave.
  // 0047: the same catalog feeds the cross-cohort stat selector.
  const [classes, setClasses] = useState<string[]>([])
  const [catalog, setCatalog] = useState<StatCatalogEntry[]>([])
  const [board, setBoard] = useState<Board>('dps')
  const [boardClass, setBoardClass] = useState('')

  // 0047 cross-cohort inspector: 'ovr' keeps the original role boards;
  // 'stat' shows ONE stat across every real member, independent of cohort.
  const [view, setView] = useState<RankView>('ovr')
  const [statKey, setStatKey] = useState('rpdef')
  const [statOrder, setStatOrder] = useState<StatOrder>('desc')
  const [overview, setOverview] = useState<StatOverview | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)

  const [rows, setRows] = useState<RoleRankRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [sortKey, setSortKey] = useState<RankSortKey>('server')
  // One expanded player detail at a time (member_id — display_name has no
  // unique constraint, the fetchRoleRank composite-key discipline).
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const statGroups = useMemo(
    () => new Map(catalog.map((entry) => [entry.stat_key, entry.group_name])),
    [catalog],
  )

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
        if (!cancelled) setCatalog(entries)
      })
      .catch(() => {
        /* grouping degraded; detail values still render */
      })
    return () => {
      cancelled = true
    }
  }, [session])

  // 0047: if the default stat is absent from the live catalog (defensive —
  // rpdef exists since 0019), fall back to the first catalog stat.
  useEffect(() => {
    if (catalog.length === 0) return
    if (!catalog.some((entry) => entry.stat_key === statKey)) {
      setStatKey(catalog[0].stat_key)
    }
  }, [catalog, statKey])

  // Board or class change refetches via fetchRoleRank with the cancelled-flag
  // stale-guard pattern (KeyStatsPage loadClassData precedent): the flag
  // guards ALL state writes so a slow earlier fetch can never overwrite the
  // currently selected board. Skipped while the cross-cohort view is active.
  useEffect(() => {
    if (view !== 'ovr') return
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
  }, [session, view, board, boardClass])

  // 0047: cross-cohort stat fetch (staff-only RPC). Same stale-guard pattern.
  useEffect(() => {
    if (view !== 'stat' || statKey === '') return
    let cancelled = false
    setOverview(null)
    setOverviewError(null)
    fetchStatOverview(session, statKey)
      .then((data) => {
        if (!cancelled) setOverview(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setOverviewError(
          err instanceof ApiError && err.kind === 'unauthorized'
            ? SESSION_ERROR
            : NETWORK_ERROR,
        )
      })
    return () => {
      cancelled = true
    }
  }, [session, view, statKey])

  // Display-only ordering (T-072-11 view aid): 'desc' is the server order
  // verbatim; 'asc' reverses valued rows and keeps no-value members last.
  const orderedStatRows = useMemo(
    () => (overview === null ? [] : orderStatRows(overview.rows, statOrder)),
    [overview, statOrder],
  )

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
        Comparação por função de build ou por stat entre toda a guilda — para oficiais.
      </p>

      {/* 0047 view switch: the original OVR boards, or ONE stat across every
          real member regardless of class/cohort (cheat inspection). */}
      <div role="tablist" aria-label="Modo do ranking" className="mt-4 flex gap-1">
        {(
          [
            { value: 'ovr', label: 'OVR por função' },
            { value: 'stat', label: 'Stat entre todos' },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={view === option.value}
            onClick={() => setView(option.value)}
            className={`h-11 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              view === option.value
                ? 'border-accent bg-accent text-accent-foreground glow-accent-soft'
                : 'border-line text-muted hover-control hover:text-content'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {view === 'ovr' ? (
        <>
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
          {/* 10.3: merged classes appear ONCE as their stats group (Artista)
              — the board filter asks role_rank for that GROUP, and the server
              answers with every class that ranks inside it. */}
          {mergedClassOptions(classes).map((className) => (
            <option key={className} value={className}>
              {isClassGroup(className) ? groupLabel(className) : classLabel(className)}
            </option>
          ))}
        </select>
      </div>

      {error !== null ? (
        <p role="alert" aria-live="polite" className="mt-6 text-sm font-semibold text-error">
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
                    <td className="px-2 py-2 text-muted">
                      {isClassGroup(row.char_class) ? groupLabel(row.char_class) : classLabel(row.char_class)}
                    </td>
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
                              back to Geral.

                              TABULAR view (owner feedback): the flex row this
                              replaces pushed "Média / valor / pontos" to the
                              far edge of a very wide cell with nothing tying
                              them to the label. The table spans the detail
                              width (no dead space on desktop) and every value
                              keeps its own column under its own header, while
                              the per-row rule runs the full width and carries
                              the label ↔ value association across the gap. */}
                          <table className="mt-1 w-full border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-line">
                                <th scope="col" className="w-full py-1.5 pr-8 text-left font-medium text-muted">
                                  Stat
                                </th>
                                <th scope="col" className="w-28 px-3 py-1.5 text-right font-medium text-muted">
                                  Média
                                </th>
                                <th scope="col" className="w-28 px-3 py-1.5 text-right font-medium text-muted">
                                  Valor
                                </th>
                                <th scope="col" className="w-24 py-1.5 pl-3 text-right font-medium text-muted">
                                  Pontos
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {GROUP_ORDER.map((group) => {
                                const groupStats = row.stats.filter(
                                  (stat) => (statGroups.get(stat.stat_key) ?? 'general') === group,
                                )
                                if (groupStats.length === 0) return null
                                return (
                                  <Fragment key={group}>
                                    <tr>
                                      <th
                                        scope="colgroup"
                                        colSpan={4}
                                        className="pt-4 pb-1 text-left text-sm font-semibold text-content"
                                      >
                                        {GROUP_LABELS[group]}
                                      </th>
                                    </tr>
                                    {groupStats.map((stat) => {
                                      const tier = tierForPoints(stat.points)
                                      return (
                                        <tr
                                          key={stat.stat_key}
                                          className="border-b border-line last:border-b-0"
                                        >
                                          <th scope="row" className="whitespace-nowrap py-1.5 pr-8 text-left font-semibold text-content">
                                            {stat.label}
                                          </th>
                                          {/* D-20: class average for context. */}
                                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted">
                                            {stat.class_average === null
                                              ? '—'
                                              : formatStatValue(stat.class_average, stat.value_type)}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-content">
                                            {stat.value === null
                                              ? '—'
                                              : formatStatValue(stat.value, stat.value_type)}
                                          </td>
                                          <td className="whitespace-nowrap py-1.5 pl-3 text-right">
                                            <span
                                              className={`inline-block min-w-9 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                                                tier === null ? 'border-line text-muted' : `${TIER_BORDER_DISPLAY[tier]} ${TIER_TEXT_DISPLAY[tier]}`
                                              }`}
                                            >
                                              {stat.points === null ? '—' : stat.points}
                                            </span>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </Fragment>
                                )
                              })}
                            </tbody>
                          </table>
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
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <select
              value={statKey}
              onChange={(e) => {
                setStatKey(e.target.value)
                setStatOrder('desc')
              }}
              aria-label="Stat para comparar entre todos"
              className="h-11 rounded-md border border-line bg-surface px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {GROUP_ORDER.map((group) => {
                const entries = catalog.filter((entry) => entry.group_name === group)
                if (entries.length === 0) return null
                return (
                  <optgroup key={group} label={GROUP_LABELS[group]}>
                    {entries.map((entry) => (
                      <option key={entry.stat_key} value={entry.stat_key}>
                        {entry.label}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
            <button
              type="button"
              onClick={() => setStatOrder((order) => (order === 'desc' ? 'asc' : 'desc'))}
              aria-pressed={statOrder === 'asc'}
              className="h-11 rounded-md border border-line px-3 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {statOrder === 'desc' ? 'Maior primeiro ▾' : 'Menor primeiro ▴'}
            </button>
          </div>

          {overviewError !== null ? (
            <p role="alert" aria-live="polite" className="mt-6 text-sm font-semibold text-error">
              {overviewError}
            </p>
          ) : overview === null ? (
            <p className="mt-6 text-base text-muted">Carregando…</p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold text-content">{overview.label}</span>
                {overview.guild.sample_size === 0 ? (
                  <span className="text-muted">Sem envios validados para este stat.</span>
                ) : (
                  <span className="text-muted">
                    {`${overview.guild.sample_size} membros com valor · mediana ${
                      overview.guild.median === null
                        ? '—'
                        : formatStatValue(overview.guild.median, overview.value_type)
                    } · máx ${
                      overview.guild.max === null
                        ? '—'
                        : formatStatValue(overview.guild.max, overview.value_type)
                    } · mín ${
                      overview.guild.min === null
                        ? '—'
                        : formatStatValue(overview.guild.min, overview.value_type)
                    }`}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">
                Somente envios validados; fixtures de teste excluídos. A referência é a
                <strong> curva da coorte</strong>: mediana + desvio robusto (MAD), n ≥ 5.
                “Fora da curva (Nσ)” = desvio ≥ 3,5σ da mediana. Sem margem fixa e sem
                média geral como referência — confirme no painel anti-cheat de Validações.
              </p>
              {orderedStatRows.length === 0 ? (
                <p className="mt-6 text-center text-base text-muted">
                  Nenhum membro ativo para comparar.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-max text-left text-sm">
                    <thead>
                      <tr className="border-b border-line">
                        <th
                          scope="col"
                          className="px-2 py-2 font-semibold text-muted"
                          aria-label="Classe (ícone)"
                        />
                        <th scope="col" className="px-2 py-2 font-semibold text-muted">
                          Nome
                        </th>
                        <th scope="col" className="px-2 py-2 font-semibold text-muted">
                          Classe
                        </th>
                        <th scope="col" className="px-2 py-2 font-semibold text-muted">
                          Função
                        </th>
                        <th
                          scope="col"
                          className="px-2 py-2 text-right font-semibold text-muted"
                        >
                          Valor
                        </th>
                        <th
                          scope="col"
                          className="px-2 py-2 text-right font-semibold text-muted"
                        >
                          Mediana (n)
                        </th>
                        <th
                          scope="col"
                          className="px-2 py-2 text-right font-semibold text-muted"
                        >
                          Nσ
                        </th>
                        <th scope="col" className="px-2 py-2 font-semibold text-muted">
                          Último envio
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderedStatRows.map((row) => {
                        return (
                          <tr key={row.member_id} className="border-b border-line">
                            <td className="px-2 py-2">
                              <ClassCrest charClass={row.char_class} size="sm" />
                            </td>
                            <td className="px-2 py-2 text-content">
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{row.display_name}</span>
                                {row.class_sigma_outlier && (
                                  <span className="rounded-full bg-error/15 px-2 py-0.5 text-xs font-semibold text-error">
                                    {`Fora da curva (${ratioFormatter.format(row.class_z ?? 0)}σ)`}
                                  </span>
                                )}
                              </div>
                              {row.char_id !== null && row.char_id !== '' && (
                                <div className="font-mono text-xs text-muted">{row.char_id}</div>
                              )}
                            </td>
                            <td className="px-2 py-2 text-muted">
                              {row.char_class === null ? '—' : classLabel(row.char_class)}
                            </td>
                            <td className="px-2 py-2 text-muted">
                              {row.char_function === null
                                ? '—'
                                : FUNCTION_LABELS[row.char_function]}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-content">
                              {row.value === null
                                ? '—'
                                : formatStatValue(row.value, overview.value_type)}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-muted">
                              {row.class_median === null
                                ? '—'
                                : `${formatStatValue(row.class_median, overview.value_type)}${
                                    row.class_sample_size === null
                                      ? ''
                                      : ` (n=${row.class_sample_size})`
                                  }`}
                            </td>
                            <td
                              className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${
                                row.class_sigma_outlier
                                  ? 'font-semibold text-error'
                                  : 'text-muted'
                              }`}
                            >
                              {row.class_z === null
                                ? '—'
                                : `${ratioFormatter.format(row.class_z)}σ`}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-muted">
                              {row.submitted_at === null
                                ? '—'
                                : submittedFormatter.format(new Date(row.submitted_at))}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
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
