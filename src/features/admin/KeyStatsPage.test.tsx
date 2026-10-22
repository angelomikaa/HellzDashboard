// Stats-Chave tests (plan 09-05).
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../lib/api'
import { toggleErrorCopy } from './KeyStatsPage'
import { FUNCTION_LABELS } from '../../lib/groups'

describe('toggleErrorCopy (enumeration-safe error mapping)', () => {
  it('forbidden -> SESSION_ERROR', () => {
    expect(toggleErrorCopy(new ApiError(403, 'server', 'forbidden'))).toBe(
      'Sua sessão expirou ou você não tem permissão. Entre novamente.',
    )
  })

  it('unauthorized -> SESSION_ERROR', () => {
    expect(toggleErrorCopy(new ApiError(401, 'unauthorized', 'unauthorized'))).toBe(
      'Sua sessão expirou ou você não tem permissão. Entre novamente.',
    )
  })

  it('unknown_class -> SAVE_ERROR', () => {
    expect(toggleErrorCopy(new ApiError(400, 'server', 'unknown_class'))).toBe(
      'Não foi possível salvar. Tente novamente.',
    )
  })

  it('unknown_function -> SAVE_ERROR', () => {
    expect(toggleErrorCopy(new ApiError(400, 'server', 'unknown_function'))).toBe(
      'Não foi possível salvar. Tente novamente.',
    )
  })

  it('generic server error -> SAVE_ERROR', () => {
    expect(toggleErrorCopy(new ApiError(500, 'server', 'boom'))).toBe(
      'Não foi possível salvar. Tente novamente.',
    )
  })

  it('network error -> NETWORK_ERROR', () => {
    expect(toggleErrorCopy(new Error('fetch failed'))).toBe(
      'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
    )
  })
})

describe('FUNCTION_LABELS (role selector vocabulary)', () => {
  it('covers the three build roles', () => {
    expect(FUNCTION_LABELS.dps).toBe('Dano Físico')
    expect(FUNCTION_LABELS.mdps).toBe('Dano Mágico')
    expect(FUNCTION_LABELS.suporte).toBe('Suporte')
  })

  it('keys match BuildRole union', () => {
    expect(Object.keys(FUNCTION_LABELS).sort()).toEqual(['dps', 'mdps', 'suporte'])
  })
})
