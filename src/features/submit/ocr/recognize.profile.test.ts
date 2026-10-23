import { describe, expect, it } from 'vitest'
import {
  IDENTITY_READ_WIDTH,
  identityReadDimensions,
  readBasicProfile,
  profileFromRawText,
  readScreenshot,
} from './recognize'

// Plan 08-03 task 1: the Basic-profile read is one full-canvas OCR pass whose
// text is parsed by the pure identity module. Vitest runs in the node
// environment, so the worker-driven readBasicProfile cannot be executed here —
// these tests lock the parse seam (profileFromRawText), the public export and
// the fact that the profile read never invents a build role.
describe('profileFromRawText — Basic screenshot seam', () => {
  it('parses the canonical sample text exactly like the identity module', () => {
    expect(profileFromRawText('Ahrya\nJob Gypsy\nID 32980\nPower 288115')).toEqual({
      nickname: 'Ahrya',
      char_id: '32980',
      char_class: 'Gypsy',
    })
  })

  it('parses the live pt-BR client text (Classe Criador) end to end', () => {
    // 08.10 hotfix: the English fixture below is not what the live client emits.
    expect(
      profileFromRawText('SoldierHelIz\nClasse Criador\nID 17069\nLíder da Guilda Suprema'),
    ).toEqual({
      nickname: 'SoldierHelIz',
      char_id: '17069',
      char_class: 'Biochemist',
    })
  })

  it('keeps the three fields independent when only one is readable', () => {
    expect(profileFromRawText('Ahrya\nJob Gypsy')).toEqual({
      nickname: 'Ahrya',
      char_id: null,
      char_class: 'Gypsy',
    })
    expect(profileFromRawText('Ahrya\nID 32980')).toEqual({
      nickname: 'Ahrya',
      char_id: '32980',
      char_class: null,
    })
  })

  it('never produces a build role (D-03: role is a human choice)', () => {
    expect(Object.keys(profileFromRawText('Ahrya\nJob Gypsy\nID 32980')).sort()).toEqual([
      'char_class',
      'char_id',
      'nickname',
    ])
  })
})

describe('public OCR surface', () => {
  it('exports readBasicProfile alongside the existing readScreenshot', () => {
    expect(typeof readBasicProfile).toBe('function')
    expect(typeof readScreenshot).toBe('function')
  })
})

// The identity read runs at ONE operating width: the calibrated corpus
// (691/707/725/739px captures) stays untouched; every other resolution — the
// tester's 1200-2800px Snipping-Tool originals (owner report 2026-10-23:
// 1200px lost the nick, 1000px glued the badge into the ID as "399432",
// 2800px produced "0170696"/"Aryahrd") and tight small crops — resamples to
// the canonical width so the reader sees the geometry it was calibrated on.
describe('identityReadDimensions — the identity read resamples to one operating width', () => {
  it('keeps the calibrated corpus (691-739px) untouched', () => {
    for (const width of [691, 707, 725, 739]) {
      expect(identityReadDimensions(width, Math.round(width / 1.66))).toEqual({
        width,
        height: Math.round(width / 1.66),
      })
    }
    expect(identityReadDimensions(IDENTITY_READ_WIDTH, 430)).toEqual({ width: 715, height: 430 })
  })

  it('resamples larger and smaller captures to the canonical width', () => {
    // A 1200px original (the tester's failing width) and a 2800px snip.
    expect(identityReadDimensions(1200, 726)).toEqual({ width: 715, height: 433 })
    expect(identityReadDimensions(2800, 1694)).toEqual({ width: 715, height: 433 })
    // A tight crop is upscaled to the same operating point.
    expect(identityReadDimensions(300, 181)).toEqual({ width: 715, height: 431 })
    // Just outside the ±5% band in both directions.
    expect(identityReadDimensions(753, 454)).toEqual({ width: 715, height: 431 })
    expect(identityReadDimensions(679, 409)).toEqual({ width: 715, height: 431 })
  })

  it('never divides by zero and passes invalid dimensions through untouched', () => {
    expect(identityReadDimensions(0, 0)).toEqual({ width: 0, height: 0 })
    expect(identityReadDimensions(-10, 100)).toEqual({ width: -10, height: 100 })
    expect(identityReadDimensions(Number.NaN, 100)).toEqual({
      width: Number.NaN,
      height: 100,
    })
  })
})
