// ProgressDetailModal — the Phase 10.13 progression screen (owner 2026-11-06,
// revised the same day: the modal opens ONLY the clicked stat).
//
// One stat, one chart, one back button:
//   - the own 3-submission history plotted in accent red;
//   - four DISTINCT reference lines — class (silver), function (gold), cohort
//     (purple) and cohort BEST (green, owner revision 2026-11-07) — the CURRENT
//     values, averages gated at n >= 3;
//   - a compact comparison table with the signed gap against each reference.
//
// The BEST line exists because points are value-proportional to the cohort
// best (`round(own / best * 99, 2)`), NOT to any average: a below-average
// player can score high when the cohort is tightly packed. The "Pontos" box
// therefore states the formula next to the number.
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
    {
      key: 'best',
      label: 'Melhor da coorte',
      value: item.best,
      sampleSize: item.cohort_sample_size,
    },
  ]
  const tier = item.points !== null ? tierForPoints(item.points) : null
  // Phase 10.13 (owner 2026-11-06): every reference row says exactly what it
  // compares against — the player's own class/function, never a generic label.
  const classText = classLabel(charClass)
  const functionText = FUNCTION_LABELS[charFunction]
  const referenceHint: Record<'class' | 'function' | 'cohort' | 'best', string> = {
    class: `vs. ${classText}`,
    function: `vs. ${functionText}`,
    cohort: `vs. ${classText} · ${functionText}`,
    best: `vs. ${classText} · ${functionText}`,
  }

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="progress-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-lg border border-line bg-surface sm:rounded-lg"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-6 sm:py-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Progressão</p>
            <h3 id="progress-title" className="mt-1 truncate text-xl font-semibold text-content">
              {item.label}
            </h3>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted">
              {item.label_short} ·{' '}
              {item.stat_direction === 'lower' ? 'Menor é melhor' : 'Maior é melhor'}
            </p>
            <p className="mt-2 text-sm text-muted">
              {displayName} · {classLabel(charClass)} · {FUNCTION_LABELS[charFunction]}
            </p>
          </div>
          <button
            type="button"
            data-modal-close
            onClick={onClose}
            aria-label="Voltar"
            className="h-11 w-11 shrink-0 rounded-md border border-line text-lg text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-dominant px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Valor atual</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-content">
                {item.own_value === null ? '—' : formatStatValue(item.own_value, item.value_type)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted">Pontos</p>
              <div className="mt-1">
                {item.points === null ? (
                  <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
                    Dados insuficientes
                  </span>
                ) : tier !== null ? (
                  <span
                    title="Pontos = seu valor ÷ melhor da coorte × 99"
                    className={`rounded-full border px-2.5 py-1 text-sm font-semibold ${TIER_BORDER_DISPLAY[tier]} ${TIER_TEXT_DISPLAY[tier]}`}
                  >
                    {Math.round(item.points)}
                  </span>
                ) : (
                  <span className="text-sm text-muted">—</span>
                )}
              </div>
              {item.points !== null && (
                <p className="mt-1 max-w-[15rem] text-[11px] leading-tight text-muted">
                  seu valor ÷ melhor × 99
                </p>
              )}
            </div>
          </div>

          <div className="mt-5">
            <StatTrendChart
              history={item.history}
              valueType={item.value_type}
              references={references}
            />
          </div>

          {item.history.length === 0 ? (
            <p className="mt-3 text-xs text-muted">
              Sem histórico ainda — envie mais um status para começar a linha do tempo.
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted">
              Últimas submissões:{' '}
              {item.history
                .map((point) => formatStatValue(point.value, item.value_type))
                .join(' · ')}
            </p>
          )}

          <table className="mt-5 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="pb-2 pr-3 font-medium">
                  Referência
                </th>
                <th scope="col" className="pb-2 pr-3 text-right font-medium">
                  Valor
                </th>
                <th scope="col" className="pb-2 pr-3 text-right font-medium">
                  Diferença
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Amostra
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <th scope="row" className="py-2.5 pr-3 text-left font-semibold text-content">
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: OWN_COLOR }}
                  />
                  Seu valor
                </th>
                <td className="py-2.5 pr-3 text-right tabular-nums text-content">
                  {item.own_value === null ? '—' : formatStatValue(item.own_value, item.value_type)}
                </td>
                <td className="py-2.5 pr-3 text-right text-muted">—</td>
                <td className="py-2.5 text-right tabular-nums text-muted">—</td>
              </tr>
              {references.map((reference) => {
                const delta = signedDelta(item.own_value, reference.value)
                return (
                  <tr key={reference.key} className="border-b border-line last:border-b-0">
                    <th scope="row" className="py-2.5 pr-3 text-left font-semibold text-content">
                      <span className="flex items-center">
                        <span
                          className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: REFERENCE_COLORS[reference.key] }}
                        />
                        {reference.label}
                      </span>
                      <span className="mt-0.5 block pl-4 text-xs font-normal text-muted">
                        {referenceHint[reference.key]}
                      </span>
                    </th>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-content">
                      {reference.value === null
                        ? '—'
                        : formatStatValue(reference.value, item.value_type)}
                    </td>
                    <td
                      className={`py-2.5 pr-3 text-right tabular-nums ${deltaTone(delta, item.stat_direction)}`}
                    >
                      {formatDelta(delta, item.value_type)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted">
                      {reference.sampleSize > 0 ? `n=${reference.sampleSize}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <footer className="flex shrink-0 justify-end border-t border-line px-5 py-5 sm:px-6 sm:py-6">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-md border border-line px-6 text-base font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Voltar
          </button>
        </footer>
      </div>
    </div>
  )
}
