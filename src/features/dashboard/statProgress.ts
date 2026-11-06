// statProgress — the PURE model behind the Painel progression trackers
// (Phase 10.13). The Stats-Chave and Foco de melhoria tiles carry a 3-point
// sparkline of the member's own history; clicking any of them opens a modal
// that compares the value against three DISTINCT references (class, function,
// cohort).
//
// RNK-02 discipline: this module never computes points/OVR. It joins the
// opaque points from my_card/my_report with the closed 0074 payload and
// formats numbers for the chart only.
import type {
  CardKeyStat,
  MyCard,
  MyReport,
  MyReportStat,
  MyStatProgress,
  StatProgressPoint,
  StatProgressRow,
} from '../../lib/api'
import type { GroupKey } from '../../lib/groups'

/** One evidenced stat rendered by the modal (12 max: 6 keys + 6 foco). */
export interface ProgressEvidenceItem {
  stat_key: string
  label: string
  label_short: string
  group_name: GroupKey
  value_type: 'flat' | 'percentual'
  stat_direction: 'higher' | 'lower'
  points: number | null
  own_value: number | null
  /** Newest first, straight from the RPC. */
  history: StatProgressPoint[]
  class_average: number | null
  class_sample_size: number
  function_average: number | null
  function_sample_size: number
  cohort_average: number | null
  cohort_sample_size: number
}

/**
 * The stats "in evidence" for a member: the six key stats IN SERVER ORDER
 * (D-01 — never re-sorted) followed by the foco order, de-duplicated and
 * capped at 12 (6 keys + 6 foco). A my_card failure degrades to the foco list;
 * an empty card + empty focus yields [].
 */
export function evidenceStatKeys(
  card: MyCard | null,
  focus: readonly MyReportStat[],
  limit = 12,
): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()
  const push = (key: string) => {
    if (seen.has(key)) return
    seen.add(key)
    ordered.push(key)
  }
  for (const stat of card?.key_stats ?? []) push(stat.stat_key)
  for (const stat of focus) push(stat.stat_key)
  return ordered.slice(0, Math.max(0, limit))
}

/**
 * Joins the 0074 progress rows with the opaque points/labels already on the
 * page. The progress row is authoritative for history + aggregates; my_card
 * (keys) and my_report (foco + points) fill the rest. A failed progress fetch
 * (null) still produces rows — the modal simply has no history/extra lines.
 */
export function buildProgressEvidence(
  keys: readonly string[],
  progress: MyStatProgress | null,
  card: MyCard | null,
  report: MyReport | null,
): ProgressEvidenceItem[] {
  const progressByKey = new Map<string, StatProgressRow>(
    (progress?.stats ?? []).map((row) => [row.stat_key, row]),
  )
  const cardByKey = new Map<string, CardKeyStat>(
    (card?.key_stats ?? []).map((stat) => [stat.stat_key, stat]),
  )
  const reportByKey = new Map<string, MyReportStat>(
    (report?.stats ?? []).map((stat) => [stat.stat_key, stat]),
  )

  return keys.map((key) => {
    const row = progressByKey.get(key)
    const keyStat = cardByKey.get(key)
    const reportStat = reportByKey.get(key)
    const label = row?.label ?? reportStat?.label ?? keyStat?.label ?? key
    return {
      stat_key: key,
      label,
      label_short: row?.label_short ?? keyStat?.label_short ?? label,
      group_name: row?.group_name ?? reportStat?.group_name ?? 'general',
      value_type: row?.value_type ?? reportStat?.value_type ?? keyStat?.value_type ?? 'flat',
      stat_direction: row?.stat_direction ?? 'higher',
      points: keyStat?.points ?? reportStat?.points ?? null,
      own_value: row?.own_value ?? reportStat?.own_value ?? keyStat?.own_value ?? null,
      history: row?.history ?? [],
      class_average: row?.class_average ?? null,
      class_sample_size: row?.class_sample_size ?? 0,
      function_average: row?.function_average ?? null,
      function_sample_size: row?.function_sample_size ?? 0,
      // my_report.class_average IS the cohort (class + function) basis — the
      // documented fallback when the progress fetch failed.
      cohort_average: row?.cohort_average ?? reportStat?.class_average ?? null,
      cohort_sample_size: row?.cohort_sample_size ?? (reportStat?.data_sufficient ? 3 : 0),
    }
  })
}

/**
 * Chronological series for the chart (the RPC returns newest first). A copy is
 * returned so callers can never mutate the payload; a single/empty series is
 * passed through unchanged.
 */
export function historySeries(history: readonly StatProgressPoint[]): StatProgressPoint[] {
  return [...history].reverse()
}

export interface ChartDomain {
  min: number
  max: number
}

/**
 * Padded y-domain over the own series + reference lines. A flat series (or a
 * single point) gets a symmetric pad so the polyline never collapses onto the
 * axis; an empty input yields the neutral 0..1 domain.
 */
export function chartDomain(values: readonly number[]): ChartDomain {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return { min: 0, max: 1 }
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1)
    return { min: min - pad, max: max + pad }
  }
  const pad = (max - min) * 0.08
  return { min: min - pad, max: max + pad }
}

/** Signed gap against a reference; null when either side is unknown. */
export function signedDelta(own: number | null, reference: number | null): number | null {
  if (own === null || reference === null) return null
  return own - reference
}

/**
 * pt-BR `dd/mm` from an ISO timestamp. Reads the date part of the string
 * directly (no timezone shift) so the hover read-out is stable everywhere.
 */
export function formatHistoryDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (match === null) return '—'
  return `${match[3]}/${match[2]}`
}
