// Shared group/function labels (04-UI-SPEC): one source for Stats-Chave and
// the member dashboard. Group headings are the wizard's real labels
// (03-04 decision: Geral / Quasi / Especial).
export const GROUP_ORDER = ['general', 'quasi', 'special'] as const
export type GroupKey = (typeof GROUP_ORDER)[number]
export const GROUP_LABELS: Record<GroupKey, string> = {
  general: 'Geral',
  quasi: 'Quasi',
  special: 'Especial',
}
export const FUNCTION_LABELS: Record<'dps' | 'tank', string> = {
  dps: 'DPS',
  tank: 'Tank',
}
