// Stats-Chave — officer/owner key-stat configuration (03-UI, D-01/D-04).
// The tab is UX-only gating (App re-checks isStaff at the content level —
// the App-stays-mounted lesson from 02-02); real enforcement is server-side:
// the staff_select_key_stats RLS policy (member GET -> []) and the internal
// officer/owner+active gates inside the 0009 SECURITY DEFINER RPCs. A member
// session can never receive key-stat data because the endpoints refuse it.
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
  type StatCatalogEntry,
} from '../../lib/api'
import { FUNCTION_LABELS, GROUP_LABELS, GROUP_ORDER } from '../../lib/groups'
import type { NeoFootSession } from '../auth/session'

// Enumeration-safe pt-BR copy (UI contract): never raw server error text.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const SAVE_ERROR = 'Não foi possível salvar. Tente novamente.'
const LIMIT_ERROR = 'Máximo de 6 stats por classe — remova uma antes de adicionar outra.'
const SELECT_CLASS_PROMPT = 'Selecione uma classe para configurar.'
const EMPTY_TOP5 = 'Nenhum jogador com OVR calculado ainda.'
const INSUFFICIENT_OVR = '— dados insuficientes'

// D-02: exactly 6 key stats per class — client blocks the 7th; the server's
// 'key_stat_limit' (0009) is the race-proof backstop, not the only gate.
const MAX_KEY_STATS = 6

/** Map a toggle failure to enumeration-safe copy (never the raw body). */
function toggleErrorCopy(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.kind === 'unauthorized' || err.status === 403) return SESSION_ERROR
    if (err.message.includes('key_stat_limit')) return LIMIT_ERROR
    return SAVE_ERROR
  }
  return NETWORK_ERROR
}

export function KeyStatsPage({ session }: { session: NeoFootSession }) {
  const [classes, setClasses] = useState<string[] | null>(null)
  const [catalog, setCatalog] = useState<StatCatalogEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedClass, setSelectedClass] = useState('')

  // Per-class server views: keyStats = current config, top5 = the D-05 preview.
  const [keyStats, setKeyStats] = useState<string[] | null>(null)
  const [top5, setTop5] = useState<ClassTop5Row[] | null>(null)
  const [classError, setClassError] = useState<string | null>(null)

  // Any in-flight toggle disables every chip AND the class selector on the
  // page (global busy flag) — see the CR-01 notes below.
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

  // Per-class load: key stats + top-5 preview, on every class change. The
  // isStale guard (the cancelled-flag pattern from DashboardPage's mount
  // effect, CR-01) makes an out-of-order response for a previously selected
  // class a no-op instead of overwriting the current class's view — the
  // officer must never see one class's config under another class's heading.
  const loadClassData = useCallback(
    async (className: string, isStale?: () => boolean) => {
      const [keys, preview] = await Promise.all([
        fetchKeyStats(session, className),
        fetchClassTop5(session, className),
      ])
      if (isStale?.()) return // stale response — drop
      setKeyStats(keys)
      setTop5(preview)
    },
    [session],
  )

  useEffect(() => {
    if (selectedClass === '') return
    let cancelled = false
    setKeyStats(null)
    setTop5(null)
    setClassError(null)
    setToggleError(null)
    // The cancelled flag guards ALL state writes for this class's fetch
    // (success path via isStale, error path via the catch) — not just the
    // error copy.
    loadClassData(selectedClass, () => cancelled).catch((err: unknown) => {
      if (cancelled) return
      setClassError(
        err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
      )
    })
    return () => {
      cancelled = true
    }
  }, [selectedClass, loadClassData])

  async function handleToggle(statKey: string, enabled: boolean) {
    if (selectedClass === '' || keyStats === null || toggling) return
    setToggling(true)
    setToggleError(null)
    try {
      // The RPC returns the class's current count — server truth for n/6.
      await setKeyStat(session, selectedClass, statKey, enabled)
      // Optimistic local mirror of the toggle, then refresh-after-save: both
      // server views are re-read so the preview reflects the new config. A
      // refresh failure keeps the stale view — the toggle itself succeeded.
      // No staleness guard needed here (CR-01): the class selector is
      // disabled while toggling, so selectedClass can't change mid-toggle and
      // the captured class can never diverge from the selector.
      setKeyStats((keys) =>
        enabled ? [...(keys ?? []), statKey] : (keys ?? []).filter((k) => k !== statKey),
      )
      try {
        await loadClassData(selectedClass)
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
  const selectedCount = keyStats?.length ?? 0

  return (
    <section className="rounded-lg border border-line bg-surface p-6" aria-busy={busy}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold text-content">
          {selectedClass === '' ? 'Stats-Chave' : `Stats-Chave — ${selectedClass}`}
        </h2>
        {keyStats !== null && (
          <span
            className={`text-sm font-semibold ${
              selectedCount >= MAX_KEY_STATS ? 'text-success' : 'text-muted'
            }`}
          >
            {selectedCount >= MAX_KEY_STATS
              ? `${selectedCount}/${MAX_KEY_STATS} — completa`
              : `${selectedCount}/${MAX_KEY_STATS}`}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        Escolha os 6 stats que definem o OVR de cada classe.
      </p>

      {loadError !== null ? (
        <p role="alert" aria-live="polite" className="mt-6 text-sm font-semibold text-destructive">
          {loadError}
        </p>
      ) : classes === null || catalog === null ? (
        <p className="mt-6 text-base text-muted">Carregando…</p>
      ) : (
        <>
          {/* Class selector (same markup pattern as Personagens' Classe
              select). Disabled while toggling (CR-01): a mid-toggle class
              switch would run the refresh-after-save with the class captured
              at click time and deterministically overwrite the newly selected
              class's view with the old class's data. */}
          <div className="mt-6 flex max-w-72 flex-col gap-2">
            <label htmlFor="keystats-class" className="text-sm font-semibold text-content">
              Classe
            </label>
            <select
              id="keystats-class"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              disabled={busy}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">—</option>
              {classes.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))}
            </select>
          </div>

          {selectedClass === '' ? (
            <p className="mt-6 text-center text-base text-muted">{SELECT_CLASS_PROMPT}</p>
          ) : classError !== null ? (
            <p
              role="alert"
              aria-live="polite"
              className="mt-6 text-sm font-semibold text-destructive"
            >
              {classError}
            </p>
          ) : keyStats === null || top5 === null ? (
            <p className="mt-6 text-base text-muted">Carregando…</p>
          ) : (
            <>
              {toggleError !== null && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="mt-4 text-sm font-semibold text-destructive"
                >
                  {toggleError}
                </p>
              )}

              {/* Catalog as grouped toggle chips (D-04): fixed order, same
                  group headings as the wizard. */}
              {GROUP_ORDER.map((group) => (
                <div key={group} className="mt-6">
                  <h3 className="text-sm font-semibold text-muted">
                    {GROUP_LABELS[group]}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {catalog
                      .filter((entry) => entry.group_name === group)
                      .map((entry) => {
                        const selected = keyStats.includes(entry.stat_key)
                        // Client-side block-at-7 (D-02 UX): at 6 selected, the
                        // unselected chips are disabled; the server rejects a
                        // tampered 7th with 'key_stat_limit'.
                        const blocked = !selected && selectedCount >= MAX_KEY_STATS
                        return (
                          <button
                            key={entry.stat_key}
                            type="button"
                            aria-pressed={selected}
                            disabled={busy || blocked}
                            onClick={() => void handleToggle(entry.stat_key, !selected)}
                            className={`h-9 rounded-full border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${
                              selected
                                ? 'border-accent bg-accent text-accent-foreground hover-primary'
                                : 'border-line bg-surface text-content hover-control'
                            }`}
                          >
                            {entry.label}
                          </button>
                        )
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
                      // display_name has NO unique constraint (0001) — two
                      // same-class members can share a nickname, so a
                      // name-only React key can collide and drop rows.
                      // Composite with the position (WR-01); returning the
                      // member id from class_top5 instead would need a
                      // migration (server change, out of scope here).
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
                          {row.ovr === null
                            ? INSUFFICIENT_OVR
                            : `OVR ${Math.round(row.ovr)}`}
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
