import { describe, it, expect } from 'vitest'
import { esCambioTardio } from '@/lib/citas/faltas'

describe('esCambioTardio', () => {
  const ahora = new Date('2026-10-01T12:00:00Z')
  it('con 8 horas o mas de antelacion no hay falta', () => {
    expect(esCambioTardio('2026-10-01T20:00:00Z', ahora)).toBe(false)
    expect(esCambioTardio('2026-10-02T12:00:00Z', ahora)).toBe(false)
  })
  it('con menos de 8 horas si', () => {
    expect(esCambioTardio('2026-10-01T19:59:00Z', ahora)).toBe(true)
    expect(esCambioTardio('2026-10-01T13:00:00Z', ahora)).toBe(true)
  })
})
