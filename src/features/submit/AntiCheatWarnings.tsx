// AntiCheatWarnings — the player-facing curve warning (Phase 10.5/10.7).
//
// Shown on the Especial step (where the equipment values live) and again on
// the review step just above Enviar. CURVE-ONLY reference: a value at or above
// 3.5 sigma from the cohort median (robust median/MAD, n >= 5). No fixed 1.5x
// margin. Advisory only: the submission is still allowed and is SAVED PENDING
// for officer review.
import { formatStatValue } from '../../lib/parseStatValue'
import {
  DEFENSE_SIGMA_THRESHOLD,
  type DefenseWarning,
} from './antiCheat'

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export function AntiCheatWarnings({ warnings }: { warnings: readonly DefenseWarning[] }) {
  if (warnings.length === 0) return null

  return (
    <div
      role="alert"
      aria-live="polite"
      className="mt-4 rounded-lg border border-error/60 bg-error/10 p-4"
    >
      <h4 className="text-sm font-semibold text-error">Confira: valor fora da curva</h4>
      <p className="mt-1 text-sm text-content">
        {`Estes valores estão ${number.format(DEFENSE_SIGMA_THRESHOLD)}σ ou mais acima da mediana do seu grupo. Angelus e Assumptio aumentam a defesa em cerca de 95% — envie os valores SEM buffs.`}
      </p>
      <ul className="mt-3 flex flex-col gap-1">
        {warnings.map((warning) => (
          <li key={warning.stat_key} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold text-content">{warning.label}</span>
            <span className="font-mono text-content">
              {formatStatValue(warning.value, warning.value_type)}
            </span>
            <span className="text-muted">
              {`· mediana do grupo ${formatStatValue(warning.median, warning.value_type)} · ${number.format(warning.z)}σ · n=${warning.sample_size}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        O envio continua permitido, mas será marcado para revisão de um oficial.
      </p>
    </div>
  )
}
