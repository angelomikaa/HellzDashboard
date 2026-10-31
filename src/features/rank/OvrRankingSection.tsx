// OvrRankingSection — the OVR board, now one of three sibling sections in the
// staff Ranking page. The 59-stat detail is a modal, not an inline row.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchRoleRank,
  type RoleRankRow,
  type StatCatalogEntry,
} from '../../lib/api'
import { FUNCTION_LABELS } from '../../lib/groups'
import { classLabel } from '../../lib/classLabels'
import {
  groupLabel,
  isVirtualClassGroup as isClassGroup,
  mergedClassOptions,
} from '../../lib/classGroups'
import { ClassCrest } from '../assets/ClassCrest'
import { PlayerCell } from './PlayerCell'
import { PlayerStatsModal } from './PlayerStatsModal'
import {
  applyViewSort,
  filterRankRows,
  summarizeRankRows,
  type RankSortKey,
} from './rankView'
import type { NeoFootSession } from '../auth/session'

const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const EMPTY_MESSAGE = 'Nenhum jogador com dados nesta função ainda.'
const NO_MATCH_MESSAGE = 'Nenhum jogador encontrado para esta busca.'

const BOARDS = ['dps', 'mdps', 'suporte'] as const
type Board = (typeof BOARDS)[number]

const SORT_OPTIONS: { value: RankSortKey; label: string }[] = [
  { value: 'server', label: 'OVR' },
  { value: 'name', label: 'Nome' },
  { value: 'class', label: 'Classe' },
]

const ovrFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

export function OvrRankingSection({
  session,
  classes,
  catalog,
}: {
  session: NeoFootSession
  classes: readonly string[]
  catalog: readonly StatCatalogEntry[]
}) {
  const [board, setBoard] = useState<Board>('dps')
  const [boardClass, setBoardClass] = useState('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<RankSortKey>('server')
  const [rows, setRows] = useState<RoleRankRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<RoleRankRow | null>(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setError(null)
    setSelected(null)
    setSortKey('server')
    setQuery('')
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

  const statGroups = useMemo(
    () => new Map(catalog.map((entry) => [entry.stat_key, entry.group_name])),
    [catalog],
  )

  const filteredRows = useMemo(
    () => (rows === null ? [] : filterRankRows(rows, query)),
    [rows, query],
  )
  const displayRows = useMemo(
    () => applyViewSort(filteredRows, sortKey),
    [filteredRows, sortKey],
  )
  const summary = useMemo(() => summarizeRankRows(filteredRows), [filteredRows])

  const closeModal = useCallback(() => setSelected(null), [])

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Função de build" className="flex gap-1">
            {BOARDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setBoard(value)}
                aria-pressed={board === value}
                className={`h-11 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  board === value
                    ? 'border-accent bg-accent text-accent-foreground glow-accent-soft'
                    : 'border-line text-muted hover-control hover:text-content'
                }`}
              >
                {FUNCTION_LABELS[value]}
              </button>
            ))}
          </div>

          <select
            value={boardClass}
            onChange={(event) => setBoardClass(event.target.value)}
            aria-label="Filtrar por classe"
            className="h-11 rounded-md border border-line bg-surface px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="">— todas as classes</option>
            {mergedClassOptions(classes).map((className) => (
              <option key={className} value={className}>
                {isClassGroup(className) ? groupLabel(className) : classLabel(className)}
              </option>
            ))}
          </select>

          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as RankSortKey)}
            aria-label="Ordenar jogadores"
            className="h-11 rounded-md border border-line bg-surface px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {`Ordenar: ${option.label}`}
              </option>
            ))}
          </select>

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou ID"
            aria-label="Buscar jogador por nome ou ID"
            className="h-11 min-w-56 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>

        {rows !== null && error === null && (
          <p className="text-xs text-muted">
            {`${summary.total} ${summary.total === 1 ? 'jogador' : 'jogadores'} · `}
            {summary.averageOvr === null
              ? 'OVR médio —'
              : `OVR médio ${ovrFormatter.format(summary.averageOvr)}`}
            {summary.missingOvr > 0 ? ` · ${summary.missingOvr} sem dados suficientes` : ''}
          </p>
        )}
      </div>

      {error !== null ? (
        <p role="alert" aria-live="polite" className="mt-6 text-sm font-semibold text-error">
          {error}
        </p>
      ) : rows === null ? (
        <p className="mt-6 text-base text-muted">Carregando…</p>
      ) : displayRows.length === 0 ? (
        <p className="mt-6 text-center text-base text-muted">
          {query.trim() === '' ? EMPTY_MESSAGE : NO_MATCH_MESSAGE}
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
                <th scope="col" className="px-2 py-2 text-right font-semibold text-muted">
                  OVR
                </th>
                <th scope="col" className="px-2 py-2" aria-label="Detalhe" />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.member_id} className="border-b border-line">
                  <td className="px-2 py-2">
                    <ClassCrest charClass={row.char_class} size="sm" />
                  </td>
                  <td className="px-2 py-2">
                    <PlayerCell name={row.display_name} charId={row.char_id} />
                  </td>
                  <td className="px-2 py-2 text-muted">
                    {isClassGroup(row.char_class)
                      ? groupLabel(row.char_class)
                      : classLabel(row.char_class)}
                  </td>
                  <td className="px-2 py-2 text-right">
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
                      onClick={() => setSelected(row)}
                      aria-haspopup="dialog"
                      className="min-h-11 rounded-md border border-line px-3 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      Ver stats
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected !== null && (
        <PlayerStatsModal row={selected} statGroups={statGroups} onClose={closeModal} />
      )}
    </div>
  )
}
