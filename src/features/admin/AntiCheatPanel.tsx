// AntiCheatPanel — the officer-facing review panel (Phase 10.5, 0046/0049).
//
// Read-only evidence beside the pending submission. Four independent blocks:
//   - defense spikes: the fixed 1.5x cohort-average ratio AND/OR a robust
//     sigma >= 3.5 vs the cohort median (n >= 5, 0049);
//   - attribute curves: the normalized-base curve for PATK/MATK, including the
//     Impositio Manus undo test (0049);
//   - inputs the player edited after the OCR read (original -> final);
//   - the OVR swing if the submission is validated (>= 8 points warns, and
//     only when class/build-role are unchanged).
// The panel never writes and never decides — Validar/Rejeitar stay the only
// actions on the queue, exactly as before.
import { formatStatValue } from '../../lib/parseStatValue'
import type {
  AntiCheatCurveDeviation,
  AntiCheatFlags,
  AntiCheatHistoryDeviation,
} from '../../lib/api'
import {
  DEFENSE_SIGMA_THRESHOLD,
  OVR_SWING_POINTS,
  ovrSwingFlagged,
} from '../submit/antiCheat'
import { reviewDisplay } from './reviewDisplay'

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const ratio = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

function signed(n: number): string {
  const formatted = number.format(n)
  return n > 0 ? `+${formatted}` : formatted
}

function sigma(z: number | null | undefined): string {
  return z === null || z === undefined ? '—' : `${number.format(z)}σ`
}

function fmt(
  value: number | null | undefined,
  type: 'flat' | 'percentual' | null | undefined,
): string {
  if (value === null || value === undefined) return '—'
  return formatStatValue(value, type === 'percentual' ? 'percentual' : 'flat')
}

const HISTORY_PATTERN_LABEL: Record<
  NonNullable<AntiCheatHistoryDeviation['pattern']>,
  string
> = {
  impositio: 'Padrão Impositio (+35 p.p.)',
  defense: 'Padrão Angelus/Assumptio (+95%)',
  history_jump: 'Salto no histórico',
}

function curveTitle(curve: AntiCheatCurveDeviation): string {
  if (!curve.available) return 'Curva indisponível'
  if (!curve.flagged) return 'Dentro da curva'
  return curve.reason === 'impositio' ? 'Possível Impositio Manus' : 'Desvio da curva'
}

export function AntiCheatPanel({ flags }: { flags?: AntiCheatFlags | null }) {
  if (!flags) return null

  const spikes = flags.defense_spikes ?? []
  const curves = flags.curve_deviations ?? []
  const history = flags.history_deviations ?? []
  const overrides = flags.ocr_overrides ?? []
  const swing = flags.ovr_swing
  const swingFlagged = ovrSwingFlagged(flags)
  const curveFlagged = curves.some((curve) => curve.flagged)
  const historyFlagged = history.some((entry) => entry.flagged)
  const hasAny =
    spikes.length > 0 || overrides.length > 0 || swingFlagged || curveFlagged || historyFlagged
  const review = flags.review ?? null
  const display = reviewDisplay(review?.category)

  return (
    <section
      aria-label="Revisão anti-cheat"
      className={`mt-3 rounded-md border p-3 ${
        display !== null
          ? display.panel
          : flags.flagged
            ? 'border-error/60 bg-error/10'
            : 'border-line bg-card'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-content">Revisão anti-cheat</h4>
        {display !== null ? (
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${display.badge}`}
          >
            {display.label}
          </span>
        ) : flags.flagged ? (
          <span className="rounded-full bg-error/15 px-2 py-0.5 text-xs font-semibold text-error">
            Revisar antes de validar
          </span>
        ) : (
          <span className="text-xs text-muted">Sem alerta bloqueante</span>
        )}
      </div>

      {review !== null && review.reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-content">
          {review.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}

      {spikes.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-error">
            {`Defesa fora da curva (≥ ${ratio.format(DEFENSE_SIGMA_THRESHOLD)}σ da mediana, n ≥ 5)`}
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
                  {`· mediana ${spike.median === null || spike.median === undefined ? '—' : formatStatValue(spike.median, spike.value_type)}`}
                  {spike.z !== null && spike.z !== undefined ? ` · ${sigma(spike.z)}` : ''}
                  {` · n=${spike.sample_size}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {curves.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-content">Curva de atributos (ATK/MATK)</p>
          <ul className="mt-1 flex flex-col gap-2">
            {curves.map((curve) => (
              <li key={curve.flat_stat} className="text-sm text-content">
                {!curve.available ? (
                  <span className="text-muted">
                    {`${curve.flat_label ?? curve.flat_stat} / ${curve.pct_label ?? curve.pct_stat}: curva indisponível (n=${curve.sample_size})`}
                  </span>
                ) : (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span
                        className={
                          curve.flagged ? 'font-semibold text-error' : 'font-semibold text-content'
                        }
                      >
                        {curveTitle(curve)}
                      </span>
                      <span className="font-mono">
                        {`${curve.flat_label ?? curve.flat_stat} ${fmt(curve.flat_value, curve.flat_value_type)}`}
                      </span>
                      <span className="text-muted">
                        {`· esperado ${fmt(curve.expected_flat, curve.flat_value_type)} para ${curve.pct_label ?? curve.pct_stat} ${fmt(curve.pct_value, curve.pct_value_type)}`}
                      </span>
                      {curve.curve_deviation_pct !== null &&
                        curve.curve_deviation_pct !== undefined && (
                          <span className={curve.flagged ? 'text-error' : 'text-muted'}>
                            {`(${signed(curve.curve_deviation_pct)}%)`}
                          </span>
                        )}
                    </div>
                    <div className="text-xs text-muted">
                      <span>
                        {`base ${fmt(curve.base_value, 'flat')} · mediana ${fmt(curve.median_base, 'flat')} · ${sigma(curve.z_base)}`}
                      </span>
                      {curve.reason === 'impositio' &&
                        curve.base_debuff !== null &&
                        curve.base_debuff !== undefined &&
                        curve.z_debuff !== null &&
                        curve.z_debuff !== undefined && (
                          <span>
                            {` · sem o buff (+35%/+35 p.p.): base ${fmt(curve.base_debuff, 'flat')} (${sigma(curve.z_debuff)})`}
                          </span>
                        )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-error">
            Desvio vs. histórico validado do jogador
          </p>
          <p className="text-xs text-muted">
            Compara com o último envio validado; funciona mesmo quando a coorte tem menos de
            5 membros.
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {history.map((entry) => (
              <li
                key={entry.stat_key}
                className="flex flex-wrap items-baseline gap-x-2 text-sm text-content"
              >
                <span className="font-semibold">{entry.label}</span>
                <span className="font-mono text-muted">
                  {fmt(entry.previous, entry.value_type)}
                </span>
                <span aria-hidden="true" className="text-muted">
                  →
                </span>
                <span className="font-mono">
                  {fmt(entry.value, entry.value_type)}
                </span>
                <span className="text-muted">
                  {entry.value_type === 'percentual'
                    ? `· ${signed(entry.delta)} p.p.`
                    : `· ${signed(entry.delta_pct ?? 0)}%`}
                  {` · ${entry.history_sample_size} envios`}
                  {entry.z !== null ? ` · ${sigma(entry.z)}` : ''}
                </span>
                {entry.pattern !== null && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      entry.pattern === 'history_jump'
                        ? 'border-tier-gold/60 text-tier-gold'
                        : 'border-error/60 bg-error/10 text-error'
                    }`}
                  >
                    {HISTORY_PATTERN_LABEL[entry.pattern]}
                  </span>
                )}
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
          Nenhum valor fora da curva, nenhuma edição de OCR, nenhum desvio vs. histórico e
          nenhum OVR fora do esperado.
        </p>
      )}
    </section>
  )
}
