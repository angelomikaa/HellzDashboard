import { describe, expect, it } from 'vitest'
import { readBasicProfile, profileFromRawText, readScreenshot } from './recognize'

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
