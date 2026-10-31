// AntiCheatPanel — the officer-facing review panel (Phase 10.5, 0046).
//
// Read-only evidence beside the pending submission. Three independent blocks:
//   - defense spikes vs the same class+build-role cohort average (>= 1.5x);
//   - inputs the player edited after the OCR read (original -> final);
//   - the OVR swing if the submission is validated (>= 8 points warns, and
//     only when class/build-role are unchanged).
// The panel never writes and never decides — Validar/Rejeitar stay the only
// actions on the queue, exactly as before.
import { formatStatValue } from '../../lib/parseStatValue'
import type { AntiCheatFlags } from '../../lib/api'
import {
  DEFENSE_SPIKE_RATIO,
  OVR_SWING_POINTS,
  ovrSwingFlagged,
} from '../submit/antiCheat'

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const ratio = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

function signed(n: number): string {
  const formatted = number.format(n)
  return n > 0 ? `+${formatted}` : formatted
}

export function AntiCheatPanel({ flags }: { flags?: AntiCheatFlags | null }) {
  if (!flags) return null

  const spikes = flags.defense_spikes ?? []
  const overrides = flags.ocr_overrides ?? []
  const swing = flags.ovr_swing
  const swingFlagged = ovrSwingFlagged(flags)
  const hasAny = spikes.length > 0 || overrides.length > 0 || swingFlagged

  return (
    <section
      aria-label="Alertas anti-cheat"
      className={`mt-3 rounded-md border p-3 ${
        flags.flagged ? 'border-error/60 bg-error/10' : 'border-line bg-card'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-content">Alertas anti-cheat</h4>
        {flags.flagged ? (
          <span className="rounded-full bg-error/15 px-2 py-0.5 text-xs font-semibold text-error">
            Revisar antes de validar
          </span>
        ) : (
          <span className="text-xs text-muted">Sem alerta bloqueante</span>
        )}
      </div>

      {spikes.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-error">
            {`Defesa acima do esperado (≥ ${ratio.format(DEFENSE_SPIKE_RATIO)}× a média da classe/função)`}
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {spikes.map((spike) => (
              <li
                key={spike.stat_key}
                className="flex flex-wrap items-baseline gap-x-2 text-sm text-content"
              >
                <span className="font-semibold">{spike.label}</span>
                <span className="font-mono">
                  {formatStatValue(spike.value, spike.value_type)}
                </span>
                <span className="text-muted">
                  {`· média ${formatStatValue(spike.baseline, spike.value_type)} · ${ratio.format(spike.ratio)}× · n=${spike.sample_size}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {overrides.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-content">
            {`Alterado após leitura OCR (${flags.ocr_edited_count} de ${flags.ocr_filled_count + flags.ocr_edited_count} campos lidos)`}
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {overrides.map((override) => (
              <li
                key={override.input_key}
                className="flex flex-wrap items-baseline gap-x-2 text-sm text-content"
              >
                <span className="font-semibold">{override.label}</span>
                <span className="font-mono text-muted">
                  {override.ocr_value === null
                    ? '—'
                    : formatStatValue(override.ocr_value, override.value_type)}
                </span>
                <span aria-hidden="true" className="text-muted">
                  →
                </span>
                <span className="font-mono">
                  {override.final_value === null
                    ? '—'
                    : formatStatValue(override.final_value, override.value_type)}
                </span>
                {override.delta_pct !== null && (
                  <span className={override.delta_pct > 0 ? 'text-error' : 'text-muted'}>
                    {`(${signed(override.delta_pct)}%)`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {swing != null && swing.previous !== null && swing.projected !== null && (
        <div className="mt-3">
          <p className={`text-xs font-semibold ${swingFlagged ? 'text-error' : 'text-content'}`}>
            Variação de OVR
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-content">
            <span className="font-mono">{number.format(swing.previous)}</span>
            <span aria-hidden="true" className="text-muted">
              →
            </span>
            <span className="font-mono font-semibold">{number.format(swing.projected)}</span>
            {swing.delta !== null && (
              <span className={swingFlagged ? 'font-semibold text-error' : 'text-muted'}>
                {`(${signed(swing.delta)})`}
              </span>
            )}
            <span className="text-muted">
              {swing.class_changed || swing.function_changed
                ? '· classe/função alterada — não entra no alerta'
                : `· sem mudança de classe/função (limite ${OVR_SWING_POINTS})`}
            </span>
          </p>
        </div>
      )}

      {!hasAny && (
        <p className="mt-2 text-sm text-muted">
          Nenhum valor acima do limite e nenhum OVR fora do esperado.
        </p>
      )}
    </section>
  )
}
