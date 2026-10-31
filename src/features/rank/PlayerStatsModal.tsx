// PlayerStatsModal — the full 59-stat detail moved out of the Ranking table
// (Phase 10.9 UI reorganization). One accessible dialog: focus is moved to the
// close button, Tab is trapped, Escape/backdrop close it, and focus returns to
// the triggering button on unmount.
import { Fragment, useEffect, useRef } from 'react'
import type { RoleRankRow } from '../../lib/api'
import { FUNCTION_LABELS, GROUP_LABELS, GROUP_ORDER } from '../../lib/groups'
import { classLabel } from '../../lib/classLabels'
import { formatStatValue } from '../../lib/parseStatValue'
import { tierForPoints } from '../dashboard/presentation'
import { TIER_BORDER_DISPLAY, TIER_TEXT_DISPLAY } from '../dashboard/tierDisplay'
import { ClassCrest } from '../assets/ClassCrest'

interface PlayerStatsModalProps {
  row: RoleRankRow
  /** stat_key -> catalog group_name; empty map falls back to Geral. */
  statGroups: ReadonlyMap<string, string>
  onClose: () => void
}

export function PlayerStatsModal({ row, statGroups, onClose }: PlayerStatsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const dialog = dialogRef.current
    const focusables = (): HTMLElement[] => {
      if (dialog === null) return []
      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled'))
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    dialog?.querySelector<HTMLElement>('[data-modal-close]')?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [onClose])

  const grouped = (group: string) =>
    row.stats.filter((stat) => (statGroups.get(stat.stat_key) ?? 'general') === group)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-stats-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-lg border border-line bg-surface sm:rounded-lg"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line p-4">
          <div className="flex min-w-0 items-center gap-3">
            <ClassCrest charClass={row.char_class} size="sm" />
            <div className="min-w-0">
              <h3 id="player-stats-title" className="truncate text-base font-semibold text-content">
                {row.display_name}
              </h3>
              <p className="text-sm text-muted">
                {classLabel(row.char_class)} · {FUNCTION_LABELS[row.char_function]}
                {row.char_id !== null && row.char_id !== undefined && row.char_id !== '' && (
                  <span className="font-mono"> · {row.char_id}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted">OVR</p>
              <p className="font-display text-lg font-semibold text-content">
                {row.ovr === null ? '—' : Math.round(row.ovr)}
              </p>
            </div>
            <button
              type="button"
              data-modal-close
              onClick={onClose}
              aria-label="Fechar stats do jogador"
              className="h-11 w-11 rounded-md border border-line text-lg text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              ×
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <table className="w-full border-collapse text-sm">
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
                const stats = grouped(group)
                if (stats.length === 0) return null
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
                    {stats.map((stat) => {
                      const tier = tierForPoints(stat.points)
                      return (
                        <tr key={stat.stat_key} className="border-b border-line last:border-b-0">
                          <th
                            scope="row"
                            className="whitespace-nowrap py-1.5 pr-8 text-left font-semibold text-content"
                          >
                            {stat.label}
                          </th>
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
                                tier === null
                                  ? 'border-line text-muted'
                                  : `${TIER_BORDER_DISPLAY[tier]} ${TIER_TEXT_DISPLAY[tier]}`
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
          {row.stats.length === 0 && (
            <p className="mt-4 text-sm text-muted">Sem stats para este jogador.</p>
          )}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-line p-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  )
}
