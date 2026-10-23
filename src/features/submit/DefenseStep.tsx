// DefenseStep — Especial sub-section for raw physical/magical defense
// (Phase 9.1, DEF-02/DEF-03).
//
// Two tooltip cards live INSIDE the existing Especial step (no new wizard
// step, no new catalog group). Each card: tooltip example + OcrCapture +
// editable Equipment value + read-only calculated RPDEF/RMDEF.
//
// Each capture owns its own failed/filled/running state so one tooltip read
// never blanks the other's equipment value. The raw values are read-only and
// computed via withDerivedDefenses (floor(equipment / (1 + pct / 100))).
//
// Pure presentational: the parent owns inputs + verification; this component
// reports equipment edits and its own OCR state.

import { useState } from 'react'
import type { GroupInputs } from './wizard'
import { OcrCapture } from './OcrCapture'
import type { OcrFieldOutcome } from './ocr/recognize'
import { OCR_FIELD_FAILURE } from './StatGroupStep'
import { INVALID_HINT, statFieldFeedback } from './fieldValidation'
import {
  withDerivedDefenses,
  EQUIPMENT_RAW_KEYS,
  type RawDefenseCard,
} from './rawDefense'
import { formatStatValue } from '../../lib/parseStatValue'

interface DefenseStepProps {
  inputs: GroupInputs
  onEquipmentChange: (key: (typeof EQUIPMENT_RAW_KEYS)[number], raw: string) => void
  disabled: boolean
}

const CARDS: RawDefenseCard[] = [
  {
    capture: 'pdef_tooltip',
    equipmentKey: 'equip_pdef_raw',
    pctKey: 'equip_pdef_pct',
    rawKey: 'rpdef',
    label: 'PDEF',
    title: 'Defesa Física Bruta (RPDEF)',
    example: '/examples/pdef-tooltip.png',
  },
  {
    capture: 'mdef_tooltip',
    equipmentKey: 'equip_mdef_raw',
    pctKey: 'equip_mdef_pct',
    rawKey: 'rmdef',
    label: 'MDEF',
    title: 'Defesa Mágica Bruta (RMDEF)',
    example: '/examples/mdef-tooltip.png',
  },
]

export function DefenseStep({ inputs, onEquipmentChange, disabled }: DefenseStepProps) {
  const derived = withDerivedDefenses(inputs)

  // Per-capture OCR state — local so one tooltip read never blanks the other.
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const [filled, setFilled] = useState<ReadonlySet<string>>(new Set())
  const [running, setRunning] = useState<ReadonlySet<string>>(new Set())
  const [blurred, setBlurred] = useState<ReadonlySet<string>>(new Set())

  function handleOutcomes(card: RawDefenseCard, outcomes: OcrFieldOutcome[]) {
    const outcome = outcomes.find((o) => o.stat_key === card.equipmentKey)
    if (outcome?.status === 'filled') {
      const next = new Set(filled)
      next.add(card.equipmentKey)
      setFilled(next)
      setFailed((prev) => {
        const n = new Set(prev)
        n.delete(card.equipmentKey)
        return n
      })
      onEquipmentChange(card.equipmentKey, outcome.raw)
    } else {
      setFailed((prev) => {
        const n = new Set(prev)
        n.add(card.equipmentKey)
        return n
      })
    }
  }

  function handleRunState(card: RawDefenseCard, runningNow: boolean) {
    setRunning((prev) => {
      const n = new Set(prev)
      if (runningNow) n.add(card.capture)
      else n.delete(card.capture)
      return n
    })
  }

  function handleEquipmentBlur(key: (typeof EQUIPMENT_RAW_KEYS)[number]) {
    setBlurred((prev) => {
      const n = new Set(prev)
      n.add(key)
      return n
    })
  }

  const cardIsRunning = (card: RawDefenseCard) => running.has(card.capture)
  const cardIsFailed = (card: RawDefenseCard) => failed.has(card.equipmentKey) && !filled.has(card.equipmentKey)
  const equipmentEngaged = (key: (typeof EQUIPMENT_RAW_KEYS)[number]) =>
    blurred.has(key) || filled.has(key)

  return (
    <section className="mt-8 rounded-lg border border-line bg-surface p-6">
      <h3 className="mb-4 text-lg font-semibold text-content">Defesas ocultas</h3>
      <p className="mb-5 text-sm text-muted">
        Capturas de tooltip do equipamento. O valor bruto é calculado e somente leitura:
        <code className="text-xs font-mono text-accent">RPDEF = ⌊Equip. PDEF ÷ (1 + Equip. PDEF %)⌋</code>
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {CARDS.map((card) => {
          const equipRaw = inputs[card.equipmentKey] ?? ''
          const pctRaw = inputs[card.pctKey] ?? ''
          const rawValue = derived[card.rawKey]
          const feedback = statFieldFeedback(equipRaw, 'flat', equipmentEngaged(card.equipmentKey))
          const isRunning = cardIsRunning(card)
          const isFailed = cardIsFailed(card)
          return (
            <div
              key={card.rawKey}
              className="rounded-lg border border-line bg-card p-4"
            >
              <div className="flex items-start gap-3 mb-3">
                <a
                  href={card.example}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  <img
                    src={card.example}
                    alt={`Exemplo tooltip ${card.label}`}
                    width={160}
                    height={120}
                    className="rounded border border-line"
                    loading="lazy"
                  />
                </a>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-content">{card.title}</h4>
                  <p className="text-xs text-muted">
                    Anexe a captura do tooltip do {card.label} do equipamento.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <OcrCapture
                  capture={card.capture}
                  disabled={disabled || isRunning}
                  onOutcomes={(o) => handleOutcomes(card, o)}
                  onReadFailed={() => {
                    setFailed((prev) => {
                      const n = new Set(prev)
                      n.add(card.equipmentKey)
                      return n
                    })
                    setFilled((prev) => {
                      const n = new Set(prev)
                      n.delete(card.equipmentKey)
                      return n
                    })
                  }}
                  onRunStateChange={(runningNow) => handleRunState(card, runningNow)}
                />
                <label className="flex flex-col gap-1 text-sm font-semibold text-content">
                  Equipment {card.label} (valor)
                  <input
                    type="text"
                    value={equipRaw}
                    onChange={(e) => onEquipmentChange(card.equipmentKey, e.target.value)}
                    onBlur={() => handleEquipmentBlur(card.equipmentKey)}
                    disabled={disabled || isRunning}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="4913"
                  />
                  {feedback.invalid && (
                    <p role="alert" aria-live="polite" className="text-xs font-semibold text-destructive">
                      {INVALID_HINT}
                    </p>
                  )}
                </label>
                {isFailed && !feedback.invalid && (
                  <p role="alert" aria-live="polite" className="text-xs font-semibold text-destructive">
                    {OCR_FIELD_FAILURE}
                  </p>
                )}
                <div className="flex items-end justify-between gap-2 text-xs text-muted">
                  <span>Equip. {card.label} % (da captura)</span>
                  <span className="font-mono">{pctRaw.trim() === '' ? '—' : pctRaw}</span>
                </div>
                <div className="flex items-end justify-between gap-2 pt-2 border-t border-line/50">
                  <span className="text-sm text-muted">Bruto calculado</span>
                  <span className="text-sm font-mono font-semibold text-content">
                    {rawValue === '' ? '—' : formatStatValue(Number(rawValue), 'flat')}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
