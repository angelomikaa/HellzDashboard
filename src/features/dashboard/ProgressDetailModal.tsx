// ProgressDetailModal — the Phase 10.13 progression screen (owner 2026-11-06,
// revised the same day: the modal opens ONLY the clicked stat).
//
// One stat, one chart, one back button:
//   - the own 3-submission history plotted in accent red;
//   - three DISTINCT reference lines — class (silver), function (gold) and
//     cohort (purple) — the CURRENT averages, each gated at n >= 3;
//   - a compact comparison table with the signed gap against each reference.
//
// No scrolling: the modal is sized for the single chart + table. Accessible
// dialog following the PlayerStatsModal contract: focus moves to the back
// button, Tab is trapped, Escape/backdrop close it, focus returns to the
// triggering tile on unmount. Data is rendered verbatim — no rank math here.
import { useEffect, useRef } from 'react'
import { FUNCTION_LABELS } from '../../lib/groups'
import { classLabel } from '../../lib/classLabels'
import { formatStatValue } from '../../lib/parseStatValue'
import { tierForPoints } from './presentation'
import { TIER_BORDER_DISPLAY, TIER_TEXT_DISPLAY } from './tierDisplay'
import { StatTrendChart, type StatReferenceLine } from './StatTrendChart'
import { OWN_COLOR, REFERENCE_COLORS } from './statTrendDisplay'
import { signedDelta, type ProgressEvidenceItem } from './statProgress'

function formatDelta(delta: number | null, valueType: 'flat' | 'percentual'): string {
  if (delta === null) return '—'
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'
  return `${sign}${formatStatValue(Math.abs(delta), valueType)}`
}

function deltaTone(delta: number | null, direction: 'higher' | 'lower'): string {
  if (delta === null || delta === 0) return 'text-muted'
  const better = direction === 'lower' ? delta < 0 : delta > 0
  return better ? 'text-success' : 'text-muted'
}

export function ProgressDetailModal({
  item,
  displayName,
  charClass,
  charFunction,
  onClose,
}: {
  item: ProgressEvidenceItem
  displayName: string
  charClass: string | null
  charFunction: 'dps' | 'mdps' | 'suporte'
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  const references: StatReferenceLine[] = [
    {
      key: 'class',
      label: 'Classe',
      value: item.class_average,
      sampleSize: item.class_sample_size,
    },
    {
      key: 'function',
      label: 'Função',
      value: item.function_average,
      sampleSize: item.function_sample_size,
    },
    {
      key: 'cohort',
      label: 'Coorte',
      value: item.cohort_average,
      sampleSize: item.cohort_sample_size,
    },
  ]
  const tier = item.points !== null ? tierForPoints(item.points) : null

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
        aria-labelledby="progress-title"
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-lg border border-line bg-surface sm:rounded-lg"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Progressão</p>
            <h3 id="progress-title" className="truncate text-lg font-semibold text-content">
              {item.label}
            </h3>
            <p className="text-xs uppercase tracking-wide text-muted">
              {item.label_short} · {item.stat_direction === 'lower' ? 'Menor é melhor' : 'Maior é melhor'}
            </p>
            <p className="mt-1 text-sm text-muted">
              {displayName} · {classLabel(charClass)} · {FUNCTION_LABELS[charFunction]}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-2xl font-semibold tabular-nums text-content">
              {item.own_value === null ? '—' : formatStatValue(item.own_value, item.value_type)}
            </span>
            {item.points === null ? (
              <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                Dados insuficientes
              </span>
            ) : tier !== null ? (
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${TIER_BORDER_DISPLAY[tier]} ${TIER_TEXT_DISPLAY[tier]}`}
              >
                {Math.round(item.points)}
              </span>
            ) : null}
            <button
              type="button"
              data-modal-close
              onClick={onClose}
              aria-label="Voltar"
              className="h-11 w-11 rounded-md border border-line text-lg text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              ×
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <StatTrendChart
            history={item.history}
            valueType={item.value_type}
            references={references}
          />

          {item.history.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              Sem histórico ainda — envie mais um status para começar a linha do tempo.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted">
              Últimas submissões:{' '}
              {item.history
                .map((point) => formatStatValue(point.value, item.value_type))
                .join(' · ')}
            </p>
          )}

          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="py-1 pr-2 font-medium">
                  Referência
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Valor
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Diferença
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Amostra
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <th scope="row" className="py-1 pr-2 text-left font-semibold text-content">
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: OWN_COLOR }}
                  />
                  Seu valor
                </th>
                <td className="py-1 pr-2 text-right tabular-nums text-content">
                  {item.own_value === null ? '—' : formatStatValue(item.own_value, item.value_type)}
                </td>
                <td className="py-1 pr-2 text-right text-muted">—</td>
                <td className="py-1 text-right tabular-nums text-muted">—</td>
              </tr>
              {references.map((reference) => {
                const delta = signedDelta(item.own_value, reference.value)
                return (
                  <tr key={reference.key} className="border-b border-line last:border-b-0">
                    <th scope="row" className="py-1 pr-2 text-left font-semibold text-content">
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: REFERENCE_COLORS[reference.key] }}
                      />
                      {reference.label}
                    </th>
                    <td className="py-1 pr-2 text-right tabular-nums text-content">
                      {reference.value === null
                        ? '—'
                        : formatStatValue(reference.value, item.value_type)}
                    </td>
                    <td
                      className={`py-1 pr-2 text-right tabular-nums ${deltaTone(delta, item.stat_direction)}`}
                    >
                      {formatDelta(delta, item.value_type)}
                    </td>
                    <td className="py-1 text-right tabular-nums text-muted">
                      {reference.sampleSize > 0 ? `n=${reference.sampleSize}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <footer className="flex shrink-0 justify-end border-t border-line p-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Voltar
          </button>
        </footer>
      </div>
    </div>
  )
}
