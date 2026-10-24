// Locks the pt-BR class-label vocabulary (owner decision 2026-10-23):
// every canonical catalog class must carry exactly one non-empty label, the
// labels must be pairwise distinct (a duplicate would silently merge two
// class sections/rows in display), and the fallback contract must hold —
// unknown keys pass through, null/empty renders the em-dash.
import { describe, expect, it } from 'vitest'
import { OFFICIAL_CLASSES } from '../features/submit/identity'
import { classLabel, CLASS_LABELS } from './classLabels'

describe('CLASS_LABELS — the pt-BR class vocabulary', () => {
  it('covers every official catalog class with a non-empty label', () => {
    for (const name of OFFICIAL_CLASSES) {
      const label = CLASS_LABELS[name]
      expect(label, `class "${name}"`).toBeTypeOf('string')
      expect((label ?? '').trim(), `class "${name}"`).not.toBe('')
    }
  })

  it('labels are pairwise distinct', () => {
    const labels = OFFICIAL_CLASSES.map((name) => CLASS_LABELS[name])
    expect(new Set(labels).size).toBe(OFFICIAL_CLASSES.length)
  })

  it('renders the verified official names (owner calls included)', () => {
    expect(classLabel('Assassin Cross')).toBe('Algoz')
    expect(classLabel('Lord Knight')).toBe('Lorde')
    expect(classLabel('High Wizard')).toBe('Arquimago')
    expect(classLabel('Sniper')).toBe('Atirador de Elite')
    expect(classLabel('High Priest')).toBe('Sumo Sacerdote')
    expect(classLabel('Mastersmith')).toBe('Mestre-Ferreiro')
    expect(classLabel('Paladin')).toBe('Paladino')
    expect(classLabel('Professor')).toBe('Professor')
    expect(classLabel('Stalker')).toBe('Desordeiro')
    expect(classLabel('Biochemist')).toBe('Criador')
    expect(classLabel('Champion')).toBe('Mestre')
    // owner decisions (2026-10-23): the client print at the ranked stage
    expect(classLabel('Bard')).toBe('Menestrel')
    expect(classLabel('Gypsy')).toBe('Cigana')
    expect(classLabel('Summoner')).toBe('Invocador')
    expect(classLabel('Rebellion')).toBe('Insurgente')
  })

  it('unknown keys pass through, null/empty renders the em-dash', () => {
    expect(classLabel('Some Future Class')).toBe('Some Future Class')
    expect(classLabel('')).toBe('—')
    expect(classLabel(null)).toBe('—')
    expect(classLabel(undefined)).toBe('—')
  })
})
