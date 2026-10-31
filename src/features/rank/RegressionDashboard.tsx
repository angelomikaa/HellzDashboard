// RegressionDashboard — exploratory MATK/PATK statistical dashboard
// (Phase 10.8) inside Ranking → Stat entre todos → Regressão.
//
// HONEST DATA CONTRACT: the panel stores total MATK/PATK and the Equipment
// percentages, but NOT the Equipment/Base MATK/PATK FLAT values. The RPC
// reports that absence; this dashboard uses only the real fields and labels the
// limitation. It never invents game formulas or sample points.
//
// The classification is exploratory: NORMAL / POSSIBLE_BUFF / INCONCLUSIVE.
// A score is an anomaly signal, never a probability of cheating.
import { useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchRegressionDataset,
  type RegressionDataset,
  type RegressionMember,
} from '../../lib/api'
import { classLabel } from '../../lib/classLabels'
import { FUNCTION_LABELS } from '../../lib/groups'
import type { NeoFootSession } from '../auth/session'
import { ScatterChart, type ChartPoint } from './ScatterChart'
import {
  MODELS,
  REFERENCE_PAIR,
  buildModelPoints,
  classifyMembers,
  classifyReference,
  fitScatter,
  formatEquation,
  referenceResiduals,
  type BuffVerdict,
  type MemberClassification,
  type ModelKey,
  type ModelStats,
} from './regression'

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'

const MODEL_KEYS: ModelKey[] = ['ratio_diff', 'matk_pct', 'patk_pct', 'matk_patk']

const VERDICT_LABEL: Record<BuffVerdict, string> = {
  NORMAL: 'Normal',
  POSSIBLE_BUFF: 'Possível buff',
  INCONCLUSIVE: 'Inconclusivo',
}

const VERDICT_CLASS: Record<BuffVerdict, string> = {
  NORMAL: 'border-success/50 text-success',
  POSSIBLE_BUFF: 'border-error/60 bg-error/10 text-error',
  INCONCLUSIVE: 'border-tier-gold/60 text-tier-gold',
}

function fmt(value: number | null | undefined, percent = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${number.format(value)}${percent ? '%' : ''}`
}

function safeClassLabel(charClass: string | null): string {
  return charClass === null ? '—' : classLabel(charClass)
}

function memberFunction(member: RegressionMember): string {
  return member.char_function === null ? '—' : FUNCTION_LABELS[member.char_function]
}

function chartPoints(
  members: readonly RegressionMember[],
  key: ModelKey,
  items: readonly MemberClassification[] | null,
): ChartPoint[] {
  const verdict = new Map(items?.map((item) => [item.member.member_id, item]) ?? [])
  return buildModelPoints(members, MODELS[key]).map((point) => {
    const item = verdict.get(point.member.member_id)
    return {
      id: point.member.member_id,
      label: point.member.display_name,
      x: point.x,
      y: point.y,
      highlight:
        item !== undefined &&
        (item.verdict === 'POSSIBLE_BUFF' || Math.abs(item.standardizedResidual) >= 3.5),
      meta:
        item === undefined
          ? undefined
          : `${VERDICT_LABEL[item.verdict]} · ${item.standardizedResidual.toFixed(2)}σ`,
    }
  })
}

function lines(stats: ModelStats | null) {
  if (stats === null) return []
  return [
    {
      slope: stats.ols.slope,
      intercept: stats.ols.intercept,
      color: '#ff2d55',
      label: 'OLS',
    },
    {
      slope: stats.robust.slope,
      intercept: stats.robust.intercept,
      color: '#6e9aff',
      label: 'Theil–Sen (robusta)',
      dashed: true,
    },
  ]
}

function ci(stats: ModelStats | null) {
  if (stats === null) return null
  return {
    slope: stats.ols.slope,
    intercept: stats.ols.intercept,
    se: stats.ols.se,
    n: stats.ols.n,
    meanX: stats.ols.meanX,
    sxx: stats.ols.sxx,
    color: '#ff2d55',
  }
}

function ResidualHistogram({ stats }: { stats: ModelStats | null }) {
  if (stats === null || stats.points.length === 0) return null
  const z = stats.ols.residuals.map((r) => r / stats.scale)
  const min = Math.min(-4, ...z)
  const max = Math.max(4, ...z)
  const bins = 12
  const counts = new Array(bins).fill(0)
  for (const value of z) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(((value - min) / (max - min)) * bins)))
    counts[idx] += 1
  }
  const maxCount = Math.max(1, ...counts)
  const width = 640
  const height = 260
  const margin = { top: 16, right: 16, bottom: 36, left: 42 }
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom
  const barW = plotW / bins

  return (
    <figure className="rounded-lg border border-line bg-surface p-3">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-content">Distribuição dos resíduos</span>
        <span className="text-xs text-muted">{`escala robusta ${number.format(stats.scale)}`}</span>
      </figcaption>
      <svg
        role="img"
        aria-label="Histograma dos resíduos padronizados pelo MAD robusto."
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
      >
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={margin.left}
            x2={margin.left + plotW}
            y1={margin.top + plotH * (1 - fraction)}
            y2={margin.top + plotH * (1 - fraction)}
            stroke="currentColor"
            className="text-line"
            strokeOpacity={0.4}
          />
        ))}
        {counts.map((count, index) => {
          const start = min + ((max - min) * index) / bins
          const end = min + ((max - min) * (index + 1)) / bins
          const center = (start + end) / 2
          const color =
            Math.abs(center) >= 3.5
              ? '#F0883E'
              : Math.abs(center) >= 2.5
                ? '#E9B44C'
                : '#6e9aff'
          const barH = (count / maxCount) * plotH
          return (
            <g key={index}>
              <rect
                x={margin.left + index * barW + 1}
                y={margin.top + plotH - barH}
                width={Math.max(1, barW - 2)}
                height={barH}
                fill={color}
                fillOpacity={0.8}
              >
                <title>{`${start.toFixed(2)}σ a ${end.toFixed(2)}σ: ${count}`}</title>
              </rect>
            </g>
          )
        })}
        {[-3.5, 0, 3.5].map((value) => {
          const x = margin.left + ((value - min) / (max - min)) * plotW
          return (
            <g key={value}>
              <line
                x1={x}
                x2={x}
                y1={margin.top}
                y2={margin.top + plotH}
                stroke={value === 0 ? '#e6e6e6' : '#F0883E'}
                strokeOpacity={value === 0 ? 0.4 : 0.7}
                strokeDasharray={value === 0 ? undefined : '4 4'}
              />
              <text
                x={x}
                y={margin.top + plotH + 16}
                textAnchor="middle"
                className="fill-muted text-[11px]"
              >
                {`${value}σ`}
              </text>
            </g>
          )
        })}
        <text
          x={margin.left + plotW / 2}
          y={height - 6}
          textAnchor="middle"
          className="fill-muted text-[11px]"
        >
          resíduo padronizado (σ robusto)
        </text>
      </svg>
      <figcaption className="mt-1 text-xs text-muted">
        Laranja: |z| ≥ 3,5σ · dourado: |z| ≥ 2,5σ. O score não é probabilidade de cheat.
      </figcaption>
    </figure>
  )
}

interface StatLineProps {
  label: string
  value: string
}

function StatLine({ label, value }: StatLineProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right font-mono text-content">{value}</span>
    </div>
  )
}

export function RegressionDashboard({ session }: { session: NeoFootSession }) {
  const [dataset, setDataset] = useState<RegressionDataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modelKey, setModelKey] = useState<ModelKey>('ratio_diff')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchRegressionDataset(session)
      .then((data) => {
        if (!cancelled) setDataset(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
        )
      })
    return () => {
      cancelled = true
    }
  }, [session])

  const classification = useMemo(
    () => (dataset === null ? null : classifyMembers(dataset.members, MODELS[modelKey])),
    [dataset, modelKey],
  )

  const charts = useMemo(() => {
    if (dataset === null) return null
    return MODEL_KEYS.map((key) => {
      const model = MODELS[key]
      const stats = fitScatter(buildModelPoints(dataset.members, model))
      return { key, model, stats }
    })
  }, [dataset])

  const selected = useMemo(
    () =>
      classification?.items.find((item) => item.member.member_id === selectedId) ?? null,
    [classification, selectedId],
  )

  const matkPctChart = charts?.find((chart) => chart.key === 'matk_pct') ?? null
  const references = referenceResiduals(matkPctChart?.stats ?? null)
  const referenceClasses = classifyReference(references, matkPctChart?.stats ?? null)

  if (error !== null) {
    return (
      <p role="alert" aria-live="polite" className="mt-6 text-sm font-semibold text-error">
        {error}
      </p>
    )
  }
  if (dataset === null) {
    return <p className="mt-6 text-base text-muted">Carregando dados de regressão…</p>
  }

  const equipmentFlatMissing =
    dataset.fields.equip_matk?.available === false ||
    dataset.fields.equip_patk?.available === false

  const classificationItems = classification?.items ?? []
  const possible = classificationItems.filter((item) => item.verdict === 'POSSIBLE_BUFF')
  const inconclusive = classificationItems.filter((item) => item.verdict === 'INCONCLUSIVE')
  const normal = classificationItems.filter((item) => item.verdict === 'NORMAL')

  return (
    <div className="mt-5 flex flex-col gap-5">
      <section className="rounded-lg border border-line bg-card p-4">
        <h3 className="text-sm font-semibold text-content">Dataset real e limitações</h3>
        <div className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <p className="text-muted">
            {`${dataset.coverage.members_with_validated} membros com envio validado · `}
            {`${dataset.coverage.complete_both_pairs} com MATK/PATK completos`}
          </p>
          <p className="text-muted">
            {`${dataset.coverage.total_validated_submissions} envios validados · `}
            {`${dataset.coverage.repeated_submitters} com mais de um envio`}
          </p>
          <p className="text-muted">
            {`Amostra usada: ${classificationItems.length} membros (último envio validado por membro)`}
          </p>
          <p className="text-muted">
            {`Gerado em ${dateTime.format(new Date(dataset.generated_at))}`}
          </p>
        </div>
        {equipmentFlatMissing && (
          <p className="mt-2 rounded-md border border-tier-gold/40 bg-tier-gold/5 p-2 text-xs text-tier-gold">
            {dataset.fields.equip_matk?.reason ??
              dataset.fields.equip_patk?.reason ??
              'Equipment/Base flat MATK/PATK não são capturados pelo formulário.'}
            {' Por isso o eixo de equipamento usa apenas o %. Não inventamos os valores flat.'}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex flex-col gap-1 text-sm font-semibold text-content">
            Modelo
            <select
              value={modelKey}
              onChange={(e) => {
                setModelKey(e.target.value as ModelKey)
                setSelectedId(null)
              }}
              className="h-11 rounded-md border border-line bg-surface px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {MODEL_KEYS.map((key) => (
                <option key={key} value={key}>
                  {MODELS[key].label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-success/50 px-2 py-0.5 text-success">
              {`${normal.length} normais`}
            </span>
            <span className="rounded-full border border-error/60 bg-error/10 px-2 py-0.5 text-error">
              {`${possible.length} possível buff`}
            </span>
            <span className="rounded-full border border-tier-gold/60 px-2 py-0.5 text-tier-gold">
              {`${inconclusive.length} inconclusivos`}
            </span>
          </div>
        </div>

        {classification?.limitation !== null && classification?.limitation !== undefined && (
          <p className="mt-2 text-xs font-semibold text-tier-gold">
            {`Limitação do modelo: ${classification.limitation}`}
          </p>
        )}
        {classification?.stats !== null && classification?.stats !== undefined && (
          <div className="mt-3 grid gap-x-8 gap-y-0 sm:grid-cols-2">
            <div>
              <StatLine label="Equação robusta" value={formatEquation(classification.stats.robust)} />
              <StatLine label="R² (OLS)" value={classification.stats.ols.r2.toFixed(3)} />
              <StatLine label="n" value={String(classification.stats.ols.n)} />
              <StatLine
                label="Escala robusta (MAD)"
                value={number.format(classification.stats.scale)}
              />
            </div>
            <div>
              <StatLine
                label="IC 95% da inclinação (OLS)"
                value={
                  classification.stats.ols.slopeCi === null
                    ? '—'
                    : `[${number.format(classification.stats.ols.slopeCi[0])}, ${number.format(classification.stats.ols.slopeCi[1])}]`
                }
              />
              <StatLine
                label="LOO RMSE / MAE"
                value={`${fmt(classification.stats.loocv.rmse)} / ${fmt(classification.stats.loocv.mae)}`}
              />
              <StatLine
                label="Theil–Sen vs OLS (Δinclinação)"
                value={
                  classification.stats.sensitivity === null
                    ? '—'
                    : number.format(
                        classification.stats.robust.slope - classification.stats.ols.slope,
                      )
                }
              />
              <StatLine
                label="Sensibilidade (sem o x extremo)"
                value={
                  classification.stats.sensitivity === null
                    ? '—'
                    : `Δ ${number.format(classification.stats.sensitivity.delta)}`
                }
              />
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {charts?.map(({ key, model, stats }) => {
          const points = chartPoints(
            dataset.members,
            key,
            key === modelKey ? classification?.items ?? null : null,
          )
          const isMatkPct = key === 'matk_pct'
          return (
            <ScatterChart
              key={key}
              title={
                key === modelKey ? `${model.label} (modelo selecionado)` : model.label
              }
              xLabel={model.xLabel}
              yLabel={model.yLabel}
              points={points}
              lines={lines(stats)}
              ci={ci(stats)}
              referencePoints={
                isMatkPct
                  ? REFERENCE_PAIR.map((point) => ({
                      label: point.label,
                      x: point.matk_pct,
                      y: point.matk,
                    }))
                  : []
              }
              selectedId={selectedId}
              onSelect={(point) => setSelectedId(point.id)}
            />
          )
        })}
      </div>

      <ResidualHistogram stats={classification?.stats ?? null} />

      {selected !== null && (
        <section className="rounded-lg border border-line bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-content">
              {`Detalhe: ${selected.member.display_name}`}
            </h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${VERDICT_CLASS[selected.verdict]}`}
            >
              {VERDICT_LABEL[selected.verdict]}
            </span>
          </div>
          <div className="mt-2 grid gap-x-8 gap-y-0 sm:grid-cols-2">
            <div>
              <StatLine
                label="Classe / função"
                value={`${safeClassLabel(selected.member.char_class)} · ${memberFunction(selected.member)}`}
              />
              <StatLine label="MATK% declarado" value={fmt(selected.declaredMatkPct, true)} />
              <StatLine label="MATK% inferido" value={fmt(selected.inferredMatkPct, true)} />
              <StatLine label="MATK observado" value={fmt(selected.observedMatk)} />
            </div>
            <div>
              <StatLine label="MATK esperado" value={fmt(selected.expectedMatk)} />
              <StatLine label="Resíduo MATK" value={fmt(selected.residualMatk)} />
              <StatLine
                label="Resíduo padronizado"
                value={`${selected.standardizedResidual.toFixed(2)}σ`}
              />
              <StatLine label="Score (+35 p.p.)" value={selected.score.toFixed(2)} />
            </div>
          </div>
          <p className="mt-2 text-sm text-muted">{selected.explanation}</p>
        </section>
      )}

      <section className="rounded-lg border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-content">Classificação por jogador</h3>
        <p className="mt-1 text-xs text-muted">
          Score é um sinal estatístico, não uma probabilidade de cheat. Inconclusivo = o
          modelo não separa as hipóteses com segurança.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-2 py-2 font-semibold text-muted">Jogador</th>
                <th className="px-2 py-2 font-semibold text-muted">Classe</th>
                <th className="px-2 py-2 text-right font-semibold text-muted">MATK% decl.</th>
                <th className="px-2 py-2 text-right font-semibold text-muted">MATK% inf.</th>
                <th className="px-2 py-2 text-right font-semibold text-muted">MATK obs.</th>
                <th className="px-2 py-2 text-right font-semibold text-muted">MATK esp.</th>
                <th className="px-2 py-2 text-right font-semibold text-muted">Resíduo</th>
                <th className="px-2 py-2 text-right font-semibold text-muted">Score</th>
                <th className="px-2 py-2 font-semibold text-muted">Veredito</th>
              </tr>
            </thead>
            <tbody>
              {classificationItems.map((item) => (
                <tr key={item.member.member_id} className="border-b border-line">
                  <td className="px-2 py-2 text-content">
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.member.member_id)}
                      className="text-left font-semibold hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {item.member.display_name}
                    </button>
                    <div className="text-xs text-muted">{item.explanation}</div>
                  </td>
                  <td className="px-2 py-2 text-muted">
                    {safeClassLabel(item.member.char_class)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(item.declaredMatkPct, true)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(item.inferredMatkPct, true)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(item.observedMatk)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(item.expectedMatk)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(item.residualMatk)}</td>
                  <td className="px-2 py-2 text-right font-mono">{item.score.toFixed(2)}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${VERDICT_CLASS[item.verdict]}`}
                    >
                      {VERDICT_LABEL[item.verdict]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-content">
          Validação: par de referência do dono (externo ao banco)
        </h3>
        <p className="mt-1 text-xs text-muted">
          Os dois pontos têm MATK/MATK% reais fornecidos pelo dono, mas não têm PATK nem
          Equipment MATK flat no banco. Eles aparecem nos gráficos como losangos e NÃO
          entram no treino. A classificação abaixo usa só o modelo MATK × MATK% e é
          ilustrativa; o modelo principal (MATK/PATK) não pode ser testado sem o PATK do par.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {referenceClasses.map((entry) => (
            <div key={entry.reference.point.label} className="rounded-md border border-line bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-content">
                  {entry.reference.point.label}
                </p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${VERDICT_CLASS[entry.verdict]}`}
                >
                  {VERDICT_LABEL[entry.verdict]}
                </span>
              </div>
              <StatLine
                label="MATK / MATK%"
                value={`${fmt(entry.reference.point.matk)} · ${fmt(entry.reference.point.matk_pct, true)}`}
              />
              <StatLine
                label="Previsto pela curva"
                value={`${fmt(entry.reference.predicted)} (${entry.z.toFixed(2)}σ)`}
              />
              <StatLine label="Resíduo" value={fmt(entry.reference.residual)} />
              {entry.reference.debuffedPredicted !== null && (
                <StatLine
                  label="Se o % fosse −35 p.p."
                  value={`${fmt(entry.reference.debuffedPredicted)} (${entry.debuffedZ?.toFixed(2) ?? '—'}σ)`}
                />
              )}
              {entry.score !== null && (
                <StatLine label="Score (+35 p.p.)" value={entry.score.toFixed(2)} />
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          No modelo MATK × MATK% o ponto de 102,46% é deslocado para 67,46% e volta para
          perto da curva (z declarado ≈ −2,97σ; deslocado ≈ +0,37σ), então o exemplo do dono
          é reconhecido como POSSÍVEL BUFF. Isso é uma validação ilustrativa: sem PATK e
          sem Equipment/Base flat, o detector não tem como separar com segurança uma build
          alta legítima do buff em todos os casos.
        </p>
      </section>

      <section className="rounded-lg border border-line bg-card p-4 text-xs text-muted">
        <h3 className="text-sm font-semibold text-content">Método e premissas</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Apenas o último envio validado por membro entra no ajuste; envios repetidos não
            são duplicados na amostra (13 membros têm mais de um envio).
          </li>
          <li>
            OLS é a referência; Theil–Sen é a reta robusta. O IC de 95% é o do OLS para a
            resposta média. O score usa o MAD dos resíduos, não o desvio-padrão.
          </li>
          <li>
            A hipótese de buff desloca MATK% em −35 p.p. e compara os resíduos declarado vs
            deslocado. O efeito real no MATK total (~24% no par do dono) NÃO é assumido como
            1,35×; ele é estimado pela curva.
          </li>
          <li>
            MATK e PATK não são intercambiáveis: o controle físico usa a razão MATK/PATK e a
            diferença de percentuais; a força da relação é medida no próprio banco.
          </li>
          <li>
            Sem Equipment/Base MATK/PATK flat, a separação entre “build alta legítima” e
            buff de +35 p.p. é limitada. O dashboard reporta isso em vez de forçar um
            veredito.
          </li>
        </ul>
      </section>
    </div>
  )
}
