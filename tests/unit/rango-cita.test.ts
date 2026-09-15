import { describe, it, expect } from 'vitest'
import { leerRango } from '@/lib/citas/rango'

describe('leerRango', () => {
  it('lee el tstzrange tal como lo serializa PostgREST', () => {
    expect(leerRango('["2026-09-17 20:00:00+00","2026-09-17 21:00:00+00")')).toEqual({
      inicio: '2026-09-17T20:00:00.000Z',
      fin: '2026-09-17T21:00:00.000Z',
    })
  })

  it('conserva los milisegundos', () => {
    expect(leerRango('["2026-09-17 20:00:00.123+00","2026-09-17 21:00:00.123+00")')).toEqual({
      inicio: '2026-09-17T20:00:00.123Z',
      fin: '2026-09-17T21:00:00.123Z',
    })
  })

  it('respeta el desfase que traiga el texto', () => {
    expect(leerRango('["2026-09-17 15:00:00-05","2026-09-17 16:00:00-05")').inicio)
      .toBe('2026-09-17T20:00:00.000Z')
  })

  it('rechaza lo que no es un rango de cita en vez de inventar una fecha', () => {
    expect(() => leerRango('basura')).toThrow('Rango de cita ilegible')
    expect(() => leerRango('empty')).toThrow('Rango de cita ilegible')
    expect(() => leerRango('["no es fecha","tampoco")')).toThrow('Instante de cita ilegible')
  })
})
