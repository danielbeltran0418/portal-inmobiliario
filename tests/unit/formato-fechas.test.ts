import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { claveDia, formatearDia, formatearFechaHora, formatearHora } from '@/lib/fechas/formato'

/**
 * La zona del PROCESO se fija a una ajena antes de formatear. Sin esto, en una
 * maquina de Colombia quitar `timeZone` del formateador no cambia nada y la
 * falsificacion quedaria en verde en local. Tokio (UTC+9, sin horario de
 * verano) no coincide ni con Bogota ni con el UTC de CI.
 */
const ZONA_AJENA = 'Asia/Tokyo'
let zonaOriginal: string | undefined

// ICU puede separar con espacios especiales (U+00A0, U+202F) segun la version.
const normalizar = (texto: string) => texto.replace(/\s/g, ' ')

beforeAll(() => {
  zonaOriginal = process.env.TZ
  process.env.TZ = ZONA_AJENA
})

afterAll(() => {
  if (zonaOriginal === undefined) delete process.env.TZ
  else process.env.TZ = zonaOriginal
})

describe('formato de fechas en hora de Bogota', () => {
  it('autocomprobacion: el proceso corre de verdad en la zona ajena', () => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(ZONA_AJENA)
    const sinZona = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })
      .format(new Date('2026-09-17T20:00:00Z'))
    expect(normalizar(sinZona)).not.toBe('3:00 p. m.')
  })

  it('un instante a las 20:00 UTC se muestra como 3:00 p. m.', () => {
    expect(normalizar(formatearHora('2026-09-17T20:00:00Z'))).toBe('3:00 p. m.')
    expect(normalizar(formatearHora(new Date('2026-09-17T20:00:00Z')))).toBe('3:00 p. m.')
  })

  it('el dia es el de Bogota, no el de UTC ni el del proceso', () => {
    // 02:00 UTC del viernes 18 son las 9:00 p. m. del jueves 17 en Bogota
    // (y las 11:00 a. m. del viernes 18 en Tokio).
    expect(normalizar(formatearDia('2026-09-18T02:00:00Z'))).toBe('jueves, 17 de septiembre')
    expect(claveDia('2026-09-18T02:00:00Z')).toBe('2026-09-17')
  })

  it('fecha y hora juntas', () => {
    expect(normalizar(formatearFechaHora('2026-09-17T20:00:00+00:00')))
      .toBe('jueves, 17 de septiembre, 3:00 p. m.')
  })
})
