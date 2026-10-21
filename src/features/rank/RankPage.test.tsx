import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { NeoFootSession } from '../auth/session'
import { RankPage } from './RankPage'
import {
  applyViewSort,
  type RankSortKey,
} from './rankView'
import type { RoleRankRow } from '../../lib/api'
import {
  rankCharId,
  hasRankCharId,
  formatRankCharId,
  rankIdentityLine,
} from './RankPage'

const session: NeoFootSession = {
  access_token: 't',
  member_id: '1',
  display_name: 'Owner',
  member_role: 'owner',
  expires_at: 0,
}

const rowWith: RoleRankRow = {
  member_id: 'm1',
  display_name: 'Player One',
  char_id: '32980',
  char_class: 'Gypsy',
  char_function: 'dps',
  ovr: 90,
  stats: [],
}

const rowWithout: RoleRankRow = {
  member_id: 'm2',
  display_name: 'Player Two',
  char_id: null,
  char_class: 'Gypsy',
  char_function: 'dps',
  ovr: 80,
  stats: [],
}

describe('RankPage render', () => {
  it('renders loading state', () => {
    const html = renderToStaticMarkup(<RankPage session={session} />)
    expect(html).toContain('Carregando')
  })
})

describe('RankPage identity helpers', () => {
  it('returns char_id for a row that has one', () => {
    expect(rankCharId(rowWith)).toBe('32980')
    expect(hasRankCharId(rowWith)).toBe(true)
    expect(formatRankCharId(rowWith)).toBe('32980')
    expect(rankIdentityLine(rowWith)).toBe('32980')
  })

  it('omits char_id for a null row', () => {
    expect(rankCharId(rowWithout)).toBeNull()
    expect(hasRankCharId(rowWithout)).toBe(false)
    expect(formatRankCharId(rowWithout)).toBe('')
    expect(rankIdentityLine(rowWithout)).toBe('')
  })
})

describe('RankPage ordering', () => {
  it('preserves mocked server array order when sort key is server', () => {
    const rows = [rowWith, rowWithout]
    const sorted = applyViewSort(rows, 'server' as RankSortKey)
    expect(sorted).toBe(rows)
    expect(sorted.map((r) => r.member_id)).toEqual(['m1', 'm2'])
  })
})