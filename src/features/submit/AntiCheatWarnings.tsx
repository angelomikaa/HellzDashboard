// AntiCheatWarnings — the player-facing buff warning (Phase 10.5, 0046).
//
// Shown on the Especial step (where the equipment values live) and again on
// the review step just above Enviar. Advisory only: the submission is still
// allowed and is SAVED PENDING for officer review (owner decision 2026-10-30).
import { formatStatValue } from '../../lib/parseStatValue'
import {
  DEFENSE_SPIKE_RATIO,
  type DefenseWarning,
} from './antiCheat'

const ratioFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export function AntiCheatWarnings({ warnings }: { warnings: readonly DefenseWarning[] }) {
  if (warnings.length === 0) return null

  return (
    <div
      role="alert"
      aria-live="polite"
      className="mt-4 rounded-lg border border-error/60 bg-error/10 p-4"
    >
      <h4 className="text-sm font-semibold text-error">Confira: possível buff ativo</h4>
      <p className="mt-1 text-sm text-content">
        {`Estes valores estão ${ratioFormatter.format(DEFENSE_SPIKE_RATIO)}× ou mais acima da média do seu grupo. Angelus e Assumptio aumentam a defesa em cerca de 95% — envie os valores SEM buffs.`}
      </p>
      <ul className="mt-3 flex flex-col gap-1">
        {warnings.map((warning) => (
          <li key={warning.stat_key} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold text-content">{warning.label}</span>
            <span className="font-mono text-content">
              {formatStatValue(warning.value, warning.value_type)}
            </span>
            <span className="text-muted">
              {`· média do grupo ${formatStatValue(warning.baseline, warning.value_type)} · ${ratioFormatter.format(warning.ratio)}×`}
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
