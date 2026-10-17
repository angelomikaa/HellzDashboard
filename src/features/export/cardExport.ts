// cardExport.ts — the code-drawn JPEG EAFC card export (plan 07.2-05,
// CARD-03/D-09/D-10/D-12). RED stub — implementation lands in the GREEN commit.
import type { Tier } from '../dashboard/presentation'

export interface CardExportStat {
  label_short: string
  value: string
  points: number | null
  tier: Tier | null
}

export interface CardExportData {
  name: string
  charClass: string
  charFunction: 'dps' | 'mdps' | 'suporte'
  ovr: number
  stats: CardExportStat[]
  crestSrc: string | null
}

export function buildCardPlan(_data: CardExportData, _width = 750): never {
  throw new Error('not implemented (RED phase)')
}

export function cardFilename(_name: string): never {
  throw new Error('not implemented (RED phase)')
}
