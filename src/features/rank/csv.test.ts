import { describe, expect, it } from 'vitest'
import { csvCell, csvFilename, toCsv } from './csv'

describe('csvCell', () => {
  it('keeps plain values untouched', () => {
    expect(csvCell('Gohan')).toBe('Gohan')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(0)).toBe('0')
  })

  it('renders null/undefined as an empty cell', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('quotes separators, quotes and line breaks', () => {
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""')
    expect(csvCell('line\r\nbreak')).toBe('"line\r\nbreak"')
  })
})

describe('toCsv', () => {
  it('writes a BOM, a header and CRLF rows with a semicolon separator', () => {
    const csv = toCsv(['nome', 'valor'], [['Gohan', 95.29], ['Chud', null]])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toBe('\uFEFFnome;valor\r\nGohan;95.29\r\nChud;\r\n')
  })

  it('escapes a value that contains the separator', () => {
    expect(toCsv(['a'], [['x;y']])).toContain('"x;y"')
  })
})

describe('csvFilename', () => {
  it('slugs the parts and stamps the date', () => {
    expect(csvFilename(['stat', 'RPDEF'], new Date('2026-11-02T12:00:00Z'))).toBe(
      'hellz-stat-rpdef-2026-11-02.csv',
    )
  })

  it('strips accents and collapses separators', () => {
    expect(csvFilename(['Função', '  Médiana '], new Date('2026-11-02T12:00:00Z'))).toBe(
      'hellz-funcao-mediana-2026-11-02.csv',
    )
  })

  it('falls back to "export" for an empty slug', () => {
    expect(csvFilename(['***'], new Date('2026-11-02T12:00:00Z'))).toBe(
      'hellz-export-2026-11-02.csv',
    )
  })
})
