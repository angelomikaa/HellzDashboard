// StatExplorerSection — ONE stat across all real members, with search and
// class/function filters. This is the ranking tab's lookup surface; the
// statistical model lives in the sibling Analysis section.
import { useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchStatOverview,
  type StatCatalogEntry,
  type StatOverview,
} from '../../lib/api'
import { FUNCTION_LABELS } from '../../lib/groups'
import { classLabel } from '../../lib/classLabels'
import {
  groupLabel,
  isVirtualClassGroup as isClassGroup,
  mergedClassOptions,
} from '../../lib/classGroups'
import { formatStatValue } from '../../lib/parseStatValue'
import { ClassCrest } from '../assets/ClassCrest'
import { PlayerCell } from './PlayerCell'
import { StatPicker } from './StatPicker'
import {
  filterStatRows,
  orderStatRows,
  summarizeStatRows,
  type StatOrder,
} from './rankView'
import type { NeoFootSession } from '../auth/session'

const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'

const ratioFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const submittedFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

export function StatExplorerSection({
  session,
  classes,
  catalog,
}: {
  session: NeoFootSession
  classes: readonly string[]
  catalog: readonly StatCatalogEntry[]
}) {
  const [statKey, setStatKey] = useState('rpdef')
  const [statOrder, setStatOrder] = useState<StatOrder>('desc')
  const [classGroup, setClassGroup] = useState('')
  const [charFunction, setCharFunction] = useState<
    '' | 'dps' | 'mdps' | 'suporte'
  >('')
  const [query, setQuery] = useState('')
  const [overview, setOverview] = useState<StatOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (catalog.length === 0) return
    if (!catalog.some((entry) => entry.stat_key === statKey)) {
      setStatKey(catalog[0].stat_key)
    }
  }, [catalog, statKey])

  useEffect(() => {
    if (statKey === '') return
    let cancelled = false
    setOverview(null)
    setError(null)
    fetchStatOverview(session, statKey)
      .then((data) => {
        if (!cancelled) setOverview(data)
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
  }, [session, statKey])

  const filteredRows = useMemo(
    () =>
      overview === null
        ? []
        : filterStatRows(overview.rows, { query, classGroup, charFunction }),
    [overview, query, classGroup, charFunction],
  )
  const orderedRows = useMemo(
    () => orderStatRows(filteredRows, statOrder),
    [filteredRows, statOrder],
  )
  const summary = useMemo(() => summarizeStatRows(filteredRows), [filteredRows])

  const hasFilters = query !== '' || classGroup !== '' || charFunction !== ''

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatPicker
          entries={catalog}
          value={statKey}
          onChange={(key) => {
            setStatKey(key)
            setStatOrder('desc')
          }}
        />

        <select
          value={classGroup}
          onChange={(event) => setClassGroup(event.target.value)}
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
          value={charFunction}
          onChange={(event) =>
            setCharFunction(event.target.value as '' | 'dps' | 'mdps' | 'suporte')
          }
          aria-label="Filtrar por função"
          className="h-11 rounded-md border border-line bg-surface px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="">— todas as funções</option>
          {(['dps', 'mdps', 'suporte'] as const).map((fn) => (
            <option key={fn} value={fn}>
              {FUNCTION_LABELS[fn]}
            </option>
          ))}
        </select>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome ou ID"
          aria-label="Buscar membro por nome ou ID"
          className="h-11 min-w-56 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />

        <button
          type="button"
          onClick={() => setStatOrder((order) => (order === 'desc' ? 'asc' : 'desc'))}
          aria-pressed={statOrder === 'asc'}
          className="h-11 rounded-md border border-line px-3 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {statOrder === 'desc' ? 'Maior primeiro' : 'Menor primeiro'}
        </button>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setClassGroup('')
              setCharFunction('')
            }}
            className="h-11 rounded-md px-3 text-sm font-semibold text-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {overview !== null && error === null && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold text-content">{overview.label}</span>
          {summary.withValue === 0 ? (
            <span className="text-muted">Sem envios validados para este stat.</span>
          ) : (
            <span className="text-muted">
              {`${summary.withValue} de ${summary.total} membros com valor · mediana ${
                summary.median === null
                  ? '—'
                  : formatStatValue(summary.median, overview.value_type)
              } · máx ${
                summary.max === null ? '—' : formatStatValue(summary.max, overview.value_type)
              } · mín ${
                summary.min === null ? '—' : formatStatValue(summary.min, overview.value_type)
              }`}
            </span>
          )}
        </div>
      )}

      {error !== null ? (
        <p role="alert" aria-live="polite" className="mt-6 text-sm font-semibold text-error">
          {error}
        </p>
      ) : overview === null ? (
        <p className="mt-6 text-base text-muted">Carregando…</p>
      ) : orderedRows.length === 0 ? (
        <p className="mt-6 text-center text-base text-muted">
          {hasFilters
            ? 'Nenhum membro para os filtros selecionados.'
            : 'Nenhum membro ativo para comparar.'}
        </p>
      ) : (
        <>
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
                  <th scope="col" className="px-2 py-2 text-right font-semibold text-muted">
                    Valor
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold text-muted">
                    Mediana (n)
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold text-muted">
                    Nσ
                  </th>
                  <th scope="col" className="px-2 py-2 font-semibold text-muted">
                    Último envio
                  </th>
                </tr>
              </thead>
              <tbody>
                {orderedRows.map((row) => (
                  <tr key={row.member_id} className="border-b border-line">
                    <td className="px-2 py-2">
                      <ClassCrest charClass={row.char_class} size="sm" />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <PlayerCell name={row.display_name} charId={row.char_id} />
                        {row.class_sigma_outlier && (
                          <span className="rounded-full bg-error/15 px-2 py-0.5 text-xs font-semibold text-error">
                            {`Fora da curva (${ratioFormatter.format(row.class_z ?? 0)}σ)`}
                          </span>
                        )}
                      </div>
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
                        row.class_sigma_outlier ? 'font-semibold text-error' : 'text-muted'
                      }`}
                    >
                      {row.class_z === null ? '—' : `${ratioFormatter.format(row.class_z)}σ`}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted">
                      {row.submitted_at === null
                        ? '—'
                        : submittedFormatter.format(new Date(row.submitted_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="mt-3 rounded-md border border-line bg-card p-3 text-xs text-muted">
            <summary className="cursor-pointer text-sm font-semibold text-content">
              Como ler esta tabela
            </summary>
            <p className="mt-2">
              A referência é a <strong>mediana da coorte</strong> (mesma classe/grupo +
              função), com o próprio jogador excluído. O Nσ é o desvio robusto (MAD) em
              relação a essa mediana; <strong>Fora da curva</strong> aparece a partir de
              3,5σ. Coortes com menos de 5 valores mostram “—”. Somente envios validados;
              fixtures de teste são excluídos.
            </p>
          </details>
        </>
      )}
    </div>
  )
}
