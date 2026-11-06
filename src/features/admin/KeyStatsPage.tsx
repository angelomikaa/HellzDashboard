// Stats-Chave — officer/owner key-stat configuration (03-UI, D-01/D-04).
// 0073 (owner 2026-11-05): keys (slots 1-6) are ONLY the six stats highlighted
// on the card; the relevants (slots 7+) are the extra stats that, together with
// the keys, feed the OVR. Removing a key leaves its slot empty (no automatic
// promotion); the cohort drops out of Início while the key set is incomplete.
// Relevants already saved stay saved and are LOCKED until the 6 keys exist
// again (server-enforced via set_key_stat_v2 `key_set_incomplete`).
//
// The tab is UX-only gating (App re-checks isStaff at the content level);
// real enforcement is server-side: the staff_select_key_stats RLS policy
// (member GET -> []) and the internal officer/owner+active gates inside the
// 0018 SECURITY DEFINER set_key_stat_v2. A member session can never receive
// key-stat config because the endpoints refuse it.
// ALL rank math is Postgres (AGENTS.md): this page only toggles config and
// renders the compute-on-read class_top5 preview — it never imports the
// 03-01 spec module or computes points client-side.
import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  fetchCatalog,
  fetchClasses,
  fetchClassTop5,
  fetchKeyStats,
  setKeyStat,
  type ClassTop5Row,
  type KeyStatSelection,
  type StatCatalogEntry,
} from '../../lib/api'
import { FUNCTION_LABELS, GROUP_LABELS, GROUP_ORDER } from '../../lib/groups'
import { classLabel } from '../../lib/classLabels'
import { groupLabel, isVirtualClassGroup as isClassGroup, mergedClassOptions } from '../../lib/classGroups'
import type { NeoFootSession } from '../auth/session'

// 0073: relevants are frozen while the key set is incomplete.
const LOCKED_RELEVANT_TITLE =
  'Selecione os 6 stats-chave antes de alterar os relevantes.'

// Renders one ordered-set chip for a catalog entry within a (class, build-role)
// combo. 0073: slots 1-6 are keys (red accent + `(n)` slot suffix); slots 7+
// are relevants (purple fill, no suffix). Relevants stay visible and saved when
// a key is removed, but their chips are LOCKED until the six keys exist again.
function renderStatChip({
  entry,
  selected,
  order,
  isKey,
  busy,
  locked,
  handleToggle,
}: {
  entry: StatCatalogEntry
  selected: boolean
  order: number
  isKey: boolean
  busy: boolean
  locked: boolean
  handleToggle: (statKey: string, enabled: boolean) => void
}) {
  return (
    <button
      key={entry.stat_key}
      type="button"
      aria-pressed={selected}
      disabled={busy || locked}
      title={locked ? LOCKED_RELEVANT_TITLE : undefined}
      onClick={() => void handleToggle(entry.stat_key, !selected)}
      className={`h-9 rounded-full border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? isKey
            ? 'border-accent bg-accent text-accent-foreground hover-primary'
            : 'border-relevant bg-relevant text-accent-foreground hover-relevant'
          : 'border-line bg-surface text-content hover-control'
      }`}
    >
      {entry.label}
      {isKey ? ` (${order})` : ''}
    </button>
  )
}

// Enumeration-safe pt-BR copy (UI contract): never raw server error text.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const SAVE_ERROR = 'Não foi possível salvar. Tente novamente.'
const SELECT_CLASS_PROMPT = 'Selecione uma classe e função para configurar.'
const EMPTY_TOP5 = 'Nenhum jogador com OVR calculado ainda.'
const INSUFFICIENT_OVR = '— dados insuficientes'
export const INCOMPLETE_KEYS_ERROR =
  'Selecione os 6 stats-chave antes de alterar os relevantes.'
// 0073: keys are the card highlights; keys + relevants feed the OVR.
const TIER_LEGEND =
  'Vermelho = chave (destaque na cartinha) · Roxo = relevante (também entra no OVR)'

export type BuildRole = 'dps' | 'mdps' | 'suporte'

export function KeyStatsPage({ session }: { session: NeoFootSession }) {
  const [classes, setClasses] = useState<string[] | null>(null)
  const [catalog, setCatalog] = useState<StatCatalogEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedClass, setSelectedClass] = useState('')
  const [selectedFunction, setSelectedFunction] = useState<BuildRole | ''>('')

  // Per-(class, function) server views: keyStats = the ordered selection set
  // with its real selection_order (1-6 = key, 7+ = relevant), top5 = preview.
  // 0073: the order is read verbatim because key slots can be EMPTY while the
  // config is incomplete — positional inference would mislabel relevants.
  const [keyStats, setKeyStats] = useState<KeyStatSelection[] | null>(null)
  const [top5, setTop5] = useState<ClassTop5Row[] | null>(null)
  const [classError, setClassError] = useState<string | null>(null)

  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  // Page shell: classes + catalog load once.
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchClasses(session), fetchCatalog(session)])
      .then(([classList, catalogList]) => {
        if (cancelled) return
        setClasses(classList)
        setCatalog(catalogList)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(
          err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
        )
      })
    return () => {
      cancelled = true
    }
  }, [session])

  // Per-(class, function) load: ordered key set + top-5 preview, on every
  // class or function change.
  const loadClassData = useCallback(
    async (className: string, charFunction: BuildRole | '', isStale?: () => boolean) => {
      const [keys, preview] = await Promise.all([
        fetchKeyStats(session, className, charFunction || undefined),
        fetchClassTop5(session, className),
      ])
      if (isStale?.()) return
      setKeyStats(keys)
      setTop5(preview)
    },
    [session],
  )

  useEffect(() => {
    if (selectedClass === '' || selectedFunction === '') return
    let cancelled = false
    setKeyStats(null)
    setTop5(null)
    setClassError(null)
    setToggleError(null)
    loadClassData(selectedClass, selectedFunction, () => cancelled).catch((err: unknown) => {
      if (cancelled) return
      setClassError(
        err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
      )
    })
    return () => {
      cancelled = true
    }
  }, [selectedClass, selectedFunction, loadClassData])

  async function handleToggle(statKey: string, enabled: boolean) {
    if (selectedClass === '' || selectedFunction === '' || keyStats === null || toggling) return
    setToggling(true)
    setToggleError(null)
    try {
      // set_key_stat_v2 returns the class's current key count (order <= 6).
      await setKeyStat(session, selectedClass, selectedFunction, statKey, enabled)
      // Optimistic local mirror of the server's slot rules; the authoritative
      // re-read follows immediately.
      setKeyStats((entries) => {
        const current = entries ?? []
        if (enabled) {
          if (current.some((k) => k.stat_key === statKey)) return current
          const keys = current.filter((k) => k.selection_order <= 6)
          let nextOrder: number
          if (keys.length < 6) {
            // First free key slot (1-6).
            nextOrder = 1
            while (keys.some((k) => k.selection_order === nextOrder)) nextOrder += 1
          } else {
            nextOrder = Math.max(0, ...current.map((k) => k.selection_order)) + 1
          }
          return [...current, { stat_key: statKey, selection_order: nextOrder }]
        }
        const removed = current.find((k) => k.stat_key === statKey)
        const remaining = current.filter((k) => k.stat_key !== statKey)
        if (removed === undefined) return remaining
        if (removed.selection_order <= 6) {
          // Keys compact 1..n; relevants keep their 7+ slots.
          return remaining.map((k) =>
            k.selection_order <= 6 && k.selection_order > removed.selection_order
              ? { ...k, selection_order: k.selection_order - 1 }
              : k,
          )
        }
        // A relevant removal compacts the relevants 7..n.
        return remaining.map((k) =>
          k.selection_order > removed.selection_order
            ? { ...k, selection_order: k.selection_order - 1 }
            : k,
        )
      })
      try {
        await loadClassData(selectedClass, selectedFunction)
      } catch {
        /* stale view; the save itself succeeded */
      }
    } catch (err: unknown) {
      setToggleError(toggleErrorCopy(err))
    } finally {
      setToggling(false)
    }
  }

  const busy = toggling
  const keyCount = keyStats
    ? keyStats.filter((k) => k.selection_order <= 6).length
    : 0
  const relevantCount = keyStats
    ? keyStats.filter((k) => k.selection_order > 6).length
    : 0
  const keysComplete = keyCount === 6
  const hasRelevants = relevantCount > 0

  return (
    <section className="rounded-lg border border-line bg-surface p-6 lg:p-8" aria-busy={busy}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold text-content">
          {selectedClass === '' ? 'Stats-Chave' : `Stats-Chave — ${selectedClass}`}
        </h2>
        {keyStats !== null && (
          <span
            className={`text-sm font-semibold ${keyCount >= 6 ? 'text-success' : 'text-muted'}`}
          >
            {keyCount >= 6 ? `${keyCount}/6 — completa` : `${keyCount}/6`}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        Escolha os 6 stats que ficam em evidência na cartinha. As chaves e os
        relevantes entram no cálculo do OVR.
      </p>
      <p className="mt-1 text-sm text-muted">{TIER_LEGEND}</p>

      {loadError !== null ? (
        <p role="alert" aria-live="polite" className="mt-8 text-sm font-semibold text-error">
          {loadError}
        </p>
      ) : classes === null || catalog === null ? (
        <p className="mt-8 text-base text-muted">Carregando…</p>
      ) : (
        <>
          <div className="mt-8 flex max-w-72 flex-col gap-2">
            <label htmlFor="keystats-class" className="text-sm font-semibold text-content">
              Classe
            </label>
            <select
              id="keystats-class"
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value)
                setSelectedFunction('')
              }}
              disabled={busy}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">—</option>
              {/* 10.3: the stats classes — merged pairs appear ONCE as their
                  group (Artista), because the config and the rank cohort are
                  the group's, not each member class'. */}
              {mergedClassOptions(classes).map((className) => (
                <option key={className} value={className}>
                  {isClassGroup(className) ? groupLabel(className) : classLabel(className)}
                </option>
              ))}
            </select>
          </div>

          {selectedClass !== '' && (
            <div className="mt-8 flex max-w-72 flex-col gap-2">
              <label htmlFor="keystats-function" className="text-sm font-semibold text-content">
                Função de build
              </label>
              <select
                id="keystats-function"
                value={selectedFunction}
                onChange={(e) => setSelectedFunction(e.target.value as BuildRole)}
                disabled={busy || selectedClass === ''}
                className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">—</option>
                {Object.entries(FUNCTION_LABELS).map(([key, label]) => (
                  <option key={key} value={key as BuildRole}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedClass === '' ? (
            <p className="mt-8 text-center text-base text-muted">{SELECT_CLASS_PROMPT}</p>
          ) : classError !== null ? (
            <p
              role="alert"
              aria-live="polite"
              className="mt-8 text-sm font-semibold text-error"
            >
              {classError}
            </p>
          ) : selectedFunction === '' ? (
            <p className="mt-8 text-center text-base text-muted">
              Selecione a função de build para ver os stats-chave.
            </p>
          ) : keyStats === null || top5 === null ? (
            <p className="mt-8 text-base text-muted">Carregando…</p>
          ) : (
            <>
              {toggleError !== null && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="mt-4 text-sm font-semibold text-error"
                >
                  {toggleError}
                </p>
              )}

              <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-muted">
                  Stats-Chave ({keyCount}/6 configurados)
                </h3>
                <span className="text-sm font-semibold text-muted">
                  {relevantCount} relevante{relevantCount !== 1 ? 's' : ''}
                </span>
              </div>
              {!keysComplete && hasRelevants && (
                <p role="status" className="mt-2 text-sm font-semibold text-muted">
                  {LOCKED_RELEVANT_TITLE}
                </p>
              )}
              {GROUP_ORDER.map((group) => (
                <div key={group} className="mt-4">
                  <h3 className="text-sm font-semibold text-muted">
                    {GROUP_LABELS[group]}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {catalog
                      .filter((entry) => entry.group_name === group)
                      .map((entry) => {
                        const selection = keyStats.find((k) => k.stat_key === entry.stat_key)
                        const selected = selection !== undefined
                        const order = selection?.selection_order ?? 0
                        const isKey = selected && order <= 6
                        // 0073: a saved relevant cannot be edited while the
                        // six keys are incomplete (it stays saved).
                        const locked = selected && !isKey && !keysComplete
                        return renderStatChip({
                          entry,
                          selected,
                          order,
                          isKey,
                          busy,
                          locked,
                          handleToggle,
                        })
                      })}
                  </div>
                </div>
              ))}

              {/* Top-5-by-OVR preview (D-05): compute-on-read — refreshes
                  after every toggle via loadClassData above. */}
              <div className="mt-8 border-t border-line pt-4">
                <h3 className="text-sm font-semibold text-muted">Top 5 por OVR</h3>
                {top5.length === 0 ? (
                  <p className="mt-2 text-base text-muted">{EMPTY_TOP5}</p>
                ) : (
                  <ol className="mt-2 flex flex-col gap-2">
                    {top5.map((row, index) => (
                      <li
                        key={`${row.display_name}-${index}`}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-base text-content"
                      >
                        <span>
                          <span className="text-sm text-muted">{index + 1}. </span>
                          {row.display_name}
                          <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-sm font-semibold text-muted">
                            {FUNCTION_LABELS[row.char_function]}
                          </span>
                        </span>
                        <span className="font-semibold">
                          {row.ovr === null ? INSUFFICIENT_OVR : `OVR ${Math.round(row.ovr)}`}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}

export function toggleErrorCopy(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.kind === 'unauthorized' || err.status === 403) return SESSION_ERROR
    if (err.message.includes('forbidden')) return SESSION_ERROR
    if (err.message.includes('unknown_class') || err.message.includes('unknown_function'))
      return SAVE_ERROR
    if (err.message.includes('key_set_incomplete')) return INCOMPLETE_KEYS_ERROR
    return SAVE_ERROR
  }
  return NETWORK_ERROR
}
