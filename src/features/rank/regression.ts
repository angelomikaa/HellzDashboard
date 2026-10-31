// Regression + classification core for the MATK/PATK dashboard (Phase 10.8).
//
// PURE module: no React, no network, no game formulas. It only consumes the
// values the panel actually stores (total MATK/PATK + equipment percentages)
// and computes transparent statistics:
//   - OLS (baseline, R², slope/intercept 95% CI)
//   - Theil–Sen (robust line resistant to a few extreme records)
//   - MAD-based robust residual scale
//   - leave-one-out CV and influence sensitivity
//   - the +35 p.p. MATK% hypothesis: compare the observed value against the
//     curve evaluated at the declared x and at x-35.
//
// The buff hypothesis is EXPLORATORY. A high score is an anomaly signal, never
// a probability of cheating, and the classification says INCONCLUSIVE when the
// sample/model cannot separate the hypotheses.

import type { RegressionMember } from '../../lib/api'

export interface ScatterPoint {
  x: number
  y: number
}

export interface OlsFit {
  slope: number
  intercept: number
  r2: number
  n: number
  rmse: number
  residuals: number[]
  slopeCi: [number, number] | null
  interceptCi: [number, number] | null
  meanX: number
  meanY: number
  sxx: number
  se: number
}

export interface RobustFit {
  slope: number
  intercept: number
  n: number
}

export interface ModelStats {
  ols: OlsFit
  robust: RobustFit
  /** 1.4826 × MAD of the OLS residuals (floored to a positive number). */
  scale: number
  points: ScatterPoint[]
  loocv: { rmse: number; mae: number; n: number }
  sensitivity: { removedX: number; slope: number; delta: number } | null
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q))
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function mad(values: readonly number[]): number {
  const center = median(values)
  if (Number.isNaN(center)) return Number.NaN
  return median(values.map((v) => Math.abs(v - center)))
}

/** Two-sided 95% t critical values for df 1..30; 1.96 above. */
const T95 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
  2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042,
]

export function tCritical95(df: number): number {
  if (df < 1) return Number.NaN
  if (df <= 30) return T95[df - 1]
  return 1.96
}

export function ols(points: readonly ScatterPoint[]): OlsFit | null {
  const n = points.length
  if (n < 3) return null
  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const p of points) {
    const dx = p.x - meanX
    const dy = p.y - meanY
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  const intercept = meanY - slope * meanX
  const residuals = points.map((p) => p.y - (intercept + slope * p.x))
  const sse = residuals.reduce((s, r) => s + r * r, 0)
  const r2 = syy > 0 ? 1 - sse / syy : 0
  const rmse = Math.sqrt(sse / n)
  const se = n > 2 ? Math.sqrt(sse / (n - 2)) : Number.NaN
  const t = tCritical95(n - 2)
  const slopeSe = sxx > 0 ? se / Math.sqrt(sxx) : Number.NaN
  const interceptSe =
    sxx > 0 ? se * Math.sqrt(1 / n + (meanX * meanX) / sxx) : Number.NaN
  return {
    slope,
    intercept,
    r2,
    n,
    rmse,
    residuals,
    slopeCi: Number.isFinite(slopeSe)
      ? [slope - t * slopeSe, slope + t * slopeSe]
      : null,
    interceptCi: Number.isFinite(interceptSe)
      ? [intercept - t * interceptSe, intercept + t * interceptSe]
      : null,
    meanX,
    meanY,
    sxx,
    se,
  }
}

/** Theil–Sen: median pairwise slope, median intercept. O(n²), fine for <100. */
export function theilSen(points: readonly ScatterPoint[]): RobustFit | null {
  const n = points.length
  if (n < 2) return null
  const slopes: number[] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = points[j].x - points[i].x
      if (dx !== 0) slopes.push((points[j].y - points[i].y) / dx)
    }
  }
  if (slopes.length === 0) return null
  const slope = median(slopes)
  const intercept = median(points.map((p) => p.y - slope * p.x))
  return { slope, intercept, n }
}

export function predict(fit: { slope: number; intercept: number }, x: number): number {
  return fit.intercept + fit.slope * x
}

function emptyStats(): null {
  return null
}

export function fitScatter(points: readonly ScatterPoint[]): ModelStats | null {
  const olsFit = ols(points)
  const robust = theilSen(points)
  if (!olsFit || !robust) return emptyStats()
  const rawScale = 1.4826 * mad(olsFit.residuals)
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : Math.max(olsFit.rmse, 1e-9)

  // Leave-one-out CV on the OLS model (same estimator, honest out-of-sample).
  let sse = 0
  let sae = 0
  let folds = 0
  for (let i = 0; i < points.length; i++) {
    const rest = points.filter((_, index) => index !== i)
    const fit = ols(rest)
    if (!fit) continue
    const residual = points[i].y - predict(fit, points[i].x)
    sse += residual * residual
    sae += Math.abs(residual)
    folds++
  }

  // Influence: drop the most extreme x and report the OLS slope change.
  let sensitivity: ModelStats['sensitivity'] = null
  if (points.length > 3) {
    let extreme = points[0]
    for (const p of points) {
      if (Math.abs(p.x - olsFit.meanX) > Math.abs(extreme.x - olsFit.meanX)) extreme = p
    }
    const rest = points.filter((p) => p !== extreme)
    const fit = ols(rest)
    if (fit) {
      sensitivity = {
        removedX: extreme.x,
        slope: fit.slope,
        delta: fit.slope - olsFit.slope,
      }
    }
  }

  return {
    ols: olsFit,
    robust,
    scale,
    points: [...points],
    loocv: {
      rmse: folds > 0 ? Math.sqrt(sse / folds) : Number.NaN,
      mae: folds > 0 ? sae / folds : Number.NaN,
      n: folds,
    },
    sensitivity,
  }
}

export function formatEquation(fit: { slope: number; intercept: number }, digits = 4): string {
  const slope = Number(fit.slope.toFixed(digits))
  const intercept = Number(fit.intercept.toFixed(digits))
  const sign = intercept >= 0 ? '+' : '−'
  return `y = ${Math.abs(intercept)} ${sign} ${Math.abs(slope)}·x`
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export type ModelKey = 'ratio_diff' | 'matk_pct' | 'patk_pct' | 'matk_patk'

export interface ModelDefinition {
  key: ModelKey
  label: string
  xLabel: string
  yLabel: string
  buffRelevant: boolean
  xOf: (member: RegressionMember) => number | null
  yOf: (member: RegressionMember) => number | null
  /** Expected total MATK from the predicted y. */
  expectedMatk: (member: RegressionMember, predictedY: number) => number
  /** The +35 p.p. value on the x axis under the buff hypothesis. */
  debuffedX: (x: number) => number
}

export const MODELS: Record<ModelKey, ModelDefinition> = {
  ratio_diff: {
    key: 'ratio_diff',
    label: 'MATK/PATK × Δ% (controle físico)',
    xLabel: 'MATK% − PATK% (p.p.)',
    yLabel: 'MATK / PATK',
    buffRelevant: true,
    xOf: (m) =>
      m.matk_pct !== null && m.patk_pct !== null ? m.matk_pct - m.patk_pct : null,
    yOf: (m) =>
      m.matk !== null && m.patk !== null && m.patk !== 0 ? m.matk / m.patk : null,
    expectedMatk: (m, predictedY) => (m.patk === null ? Number.NaN : predictedY * m.patk),
    debuffedX: (x) => x - 35,
  },
  matk_pct: {
    key: 'matk_pct',
    label: 'MATK × MATK%',
    xLabel: 'Equip. MATK %',
    yLabel: 'MATK total',
    buffRelevant: true,
    xOf: (m) => m.matk_pct,
    yOf: (m) => m.matk,
    expectedMatk: (_m, predictedY) => predictedY,
    debuffedX: (x) => x - 35,
  },
  patk_pct: {
    key: 'patk_pct',
    label: 'PATK × PATK% (controle)',
    xLabel: 'Equip. PATK %',
    yLabel: 'PATK total',
    buffRelevant: false,
    xOf: (m) => m.patk_pct,
    yOf: (m) => m.patk,
    expectedMatk: (_m, predictedY) => predictedY,
    debuffedX: (x) => x,
  },
  matk_patk: {
    key: 'matk_patk',
    label: 'MATK × PATK (contexto)',
    xLabel: 'PATK total',
    yLabel: 'MATK total',
    buffRelevant: false,
    xOf: (m) => m.patk,
    yOf: (m) => m.matk,
    expectedMatk: (_m, predictedY) => predictedY,
    debuffedX: (x) => x,
  },
}

export interface MemberPoint extends ScatterPoint {
  member: RegressionMember
}

export function buildModelPoints(
  members: readonly RegressionMember[],
  model: ModelDefinition,
): MemberPoint[] {
  const out: MemberPoint[] = []
  for (const member of members) {
    const x = model.xOf(member)
    const y = model.yOf(member)
    if (x === null || y === null) continue
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    out.push({ x, y, member })
  }
  return out
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type BuffVerdict = 'NORMAL' | 'POSSIBLE_BUFF' | 'INCONCLUSIVE'

export interface ClassificationOptions {
  debuffPoints: number
  minN: number
  minR2: number
  /** Score (in robust σ) needed for the +35 hypothesis to win. */
  possibleScore: number
  /** |standardized residual| below which a record is NORMAL. */
  normalSigma: number
}

export const DEFAULT_CLASSIFICATION: ClassificationOptions = {
  debuffPoints: 35,
  minN: 12,
  minR2: 0.5,
  possibleScore: 1.5,
  normalSigma: 2.5,
}

export interface MemberClassification {
  member: RegressionMember
  verdict: BuffVerdict
  declaredMatkPct: number | null
  inferredMatkPct: number | null
  observedMatk: number | null
  expectedMatk: number | null
  residualMatk: number | null
  residual: number
  standardizedResidual: number
  score: number
  explanation: string
  point: { x: number; y: number }
}

export interface ClassificationResult {
  model: ModelDefinition
  stats: ModelStats | null
  options: ClassificationOptions
  items: MemberClassification[]
  /** Why the whole model is inconclusive (null when usable). */
  limitation: string | null
}

export function classifyMembers(
  members: readonly RegressionMember[],
  model: ModelDefinition,
  options: ClassificationOptions = DEFAULT_CLASSIFICATION,
): ClassificationResult {
  const points = buildModelPoints(members, model)
  const stats = fitScatter(points)
  if (!stats) {
    return {
      model,
      stats: null,
      options,
      items: [],
      limitation: 'Amostra insuficiente para ajustar a curva.',
    }
  }

  const globalLimitation =
    stats.ols.n < options.minN
      ? `Amostra pequena (n=${stats.ols.n}; mínimo ${options.minN}).`
      : stats.ols.r2 < options.minR2
        ? `Modelo fraco (R²=${stats.ols.r2.toFixed(2)}; mínimo ${options.minR2}).`
        : null

  const items: MemberClassification[] = points.map((point) => {
    const { member, x, y } = point
    const predictedDeclared = predict(stats.robust, x)
    const predictedDebuffed = predict(stats.robust, model.debuffedX(x))
    const residualDeclared = y - predictedDeclared
    const residualDebuffed = y - predictedDebuffed
    const standardizedResidual = residualDeclared / stats.scale
    const score = (Math.abs(residualDeclared) - Math.abs(residualDebuffed)) / stats.scale
    const expectedMatk = model.expectedMatk(member, predictedDeclared)
    const observedMatk = member.matk
    const residualMatk =
      observedMatk !== null && Number.isFinite(expectedMatk) ? observedMatk - expectedMatk : null

    let verdict: BuffVerdict
    let explanation: string
    if (globalLimitation !== null || !model.buffRelevant) {
      verdict = 'INCONCLUSIVE'
      explanation =
        globalLimitation ??
        'Modelo de controle físico: não há hipótese de buff mágico neste eixo.'
    } else if (
      score >= options.possibleScore &&
      Math.abs(residualDeclared) >= 2 * stats.scale
    ) {
      verdict = 'POSSIBLE_BUFF'
      explanation =
        `A hipótese de +${options.debuffPoints} p.p. em MATK% explica melhor o valor ` +
        `(ganho de ${score.toFixed(2)}σ; resíduo declarado ${standardizedResidual.toFixed(2)}σ).`
    } else if (Math.abs(standardizedResidual) <= options.normalSigma) {
      verdict = 'NORMAL'
      explanation = `Dentro da curva (${standardizedResidual.toFixed(2)}σ).`
    } else {
      verdict = 'INCONCLUSIVE'
      explanation =
        `Fora da faixa (${standardizedResidual.toFixed(2)}σ), mas sem assinatura clara de ` +
        `+${options.debuffPoints} p.p. em MATK%.`
    }

    return {
      member,
      verdict,
      declaredMatkPct: member.matk_pct,
      inferredMatkPct:
        verdict === 'POSSIBLE_BUFF' && member.matk_pct !== null
          ? member.matk_pct - options.debuffPoints
          : member.matk_pct,
      observedMatk,
      expectedMatk: Number.isFinite(expectedMatk) ? expectedMatk : null,
      residualMatk,
      residual: residualDeclared,
      standardizedResidual,
      score,
      explanation,
      point: { x, y },
    }
  })

  const order: Record<BuffVerdict, number> = {
    POSSIBLE_BUFF: 0,
    INCONCLUSIVE: 1,
    NORMAL: 2,
  }
  items.sort(
    (a, b) =>
      order[a.verdict] - order[b.verdict] ||
      Math.abs(b.score) - Math.abs(a.score) ||
      a.member.display_name.localeCompare(b.member.display_name, 'pt-BR'),
  )

  return { model, stats, options, items, limitation: globalLimitation }
}

// ---------------------------------------------------------------------------
// Owner-provided reference pair (external; NOT part of the database)
// ---------------------------------------------------------------------------

export interface ReferencePairPoint {
  label: string
  matk: number
  matk_pct: number
  equipment_matk: number
  base_matk: number
}

export const REFERENCE_PAIR: readonly ReferencePairPoint[] = [
  {
    label: 'Referência sem buff',
    matk: 5798,
    matk_pct: 67.46,
    equipment_matk: 5310,
    base_matk: 488,
  },
  {
    label: 'Referência com +35 p.p.',
    matk: 7212,
    matk_pct: 102.46,
    equipment_matk: 6622,
    base_matk: 590,
  },
]

export interface ReferenceResidual {
  point: ReferencePairPoint
  predicted: number
  residual: number
  debuffedPredicted: number | null
  debuffedResidual: number | null
}

/**
 * Reference residuals on the MATK × MATK% model. The pair has no PATK and no
 * Equipment MATK in the DB shape, so it is a chart overlay/validation case,
 * never a training row. The buffed reference is evaluated against the curve at
 * its declared 102.46% and at the debuffed 67.46%.
 */
export function referenceResiduals(stats: ModelStats | null): ReferenceResidual[] {
  if (!stats) return []
  return REFERENCE_PAIR.map((point) => {
    const predicted = predict(stats.robust, point.matk_pct)
    const debuffedPredicted = predict(stats.robust, point.matk_pct - 35)
    return {
      point,
      predicted,
      residual: point.matk - predicted,
      debuffedPredicted,
      debuffedResidual: point.matk - debuffedPredicted,
    }
  })
}

export interface ReferenceClassification {
  reference: ReferenceResidual
  z: number
  debuffedZ: number | null
  score: number | null
  verdict: BuffVerdict
  note: string
}

/**
 * Classify the owner-provided reference pair on the MATK × MATK% curve. The
 * pair is EXTERNAL and has no PATK or Equipment flat, so this is an illustrative
 * validation only, never a training row or a member-facing verdict.
 */
export function classifyReference(
  references: readonly ReferenceResidual[],
  stats: ModelStats | null,
  options: ClassificationOptions = DEFAULT_CLASSIFICATION,
): ReferenceClassification[] {
  if (!stats) return []
  return references.map((reference) => {
    const z = reference.residual / stats.scale
    const debuffedZ =
      reference.debuffedResidual === null ? null : reference.debuffedResidual / stats.scale
    const score =
      reference.debuffedResidual === null
        ? null
        : (Math.abs(reference.residual) - Math.abs(reference.debuffedResidual)) / stats.scale
    let verdict: BuffVerdict
    if (Math.abs(z) <= options.normalSigma) {
      verdict = 'NORMAL'
    } else if (
      score !== null &&
      score >= options.possibleScore &&
      Math.abs(z) >= 2
    ) {
      verdict = 'POSSIBLE_BUFF'
    } else {
      verdict = 'INCONCLUSIVE'
    }
    return {
      reference,
      z,
      debuffedZ,
      score,
      verdict,
      note:
        'Referência do dono (externa): sem PATK/Equipment flat no banco; classificação ilustrativa.',
    }
  })
}
