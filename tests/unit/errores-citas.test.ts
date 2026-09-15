import { describe, it, expect } from 'vitest'
import {
  MENSAJE_GENERICO,
  MENSAJE_VISITA_FRANJA_NO_DISPONIBLE, MENSAJE_VISITA_INEXISTENTE, MENSAJE_VISITA_LEAD_NO_ACEPTADO,
  MENSAJE_VISITA_NO_PARTICIPA, MENSAJE_VISITA_SOLICITUD_INEXISTENTE, MENSAJE_VISITA_YA_CANCELADA,
  MENSAJE_VISITA_YA_EMPEZO, MENSAJE_VISITA_YA_RESERVADA,
  mensajeDeErrorCita,
} from '@/lib/errores/mapear'

// Codigos y textos de la seccion 11 del spec de SP5.
const CASOS = [
  ['VS001', MENSAJE_VISITA_SOLICITUD_INEXISTENTE, 'No encontramos esa solicitud.'],
  ['VS002', MENSAJE_VISITA_NO_PARTICIPA, 'No puedes gestionar esta visita.'],
  ['VS003', MENSAJE_VISITA_LEAD_NO_ACEPTADO, 'Solo puedes reservar cuando el vendedor haya aceptado tu solicitud.'],
  ['VS004', MENSAJE_VISITA_FRANJA_NO_DISPONIBLE, 'Esa franja ya no est\u00e1 disponible. Elige otra.'],
  ['VS005', MENSAJE_VISITA_YA_RESERVADA, 'Ya tienes una visita reservada para esta propiedad.'],
  ['VS006', MENSAJE_VISITA_INEXISTENTE, 'No encontramos esa visita.'],
  ['VS007', MENSAJE_VISITA_YA_CANCELADA, 'Esta visita ya estaba cancelada.'],
  ['VS008', MENSAJE_VISITA_YA_EMPEZO, 'No se puede cambiar una visita que ya empez\u00f3.'],
] as const

describe('mensajeDeErrorCita', () => {
  it.each(CASOS)('%s se traduce a su mensaje', (codigo, constante, texto) => {
    expect(constante).toBe(texto)
    expect(mensajeDeErrorCita({ code: codigo, message: 'detalle interno de postgres' })).toBe(texto)
  })

  it('decide por el codigo, nunca por el texto del mensaje', () => {
    // El message dice una cosa y el code otra: manda el code.
    expect(mensajeDeErrorCita({ code: 'VS002', message: 'Esa franja ya no est\u00e1 disponible. Elige otra.' }))
      .toBe(MENSAJE_VISITA_NO_PARTICIPA)
    // Un texto que contiene el codigo, sin code, no se traduce.
    expect(mensajeDeErrorCita({ message: 'VS004 La franja ya esta ocupada' })).toBe(MENSAJE_GENERICO)
  })

  it('cualquier otro error cae en el mensaje generico, sin filtrar el original', () => {
    const otros: unknown[] = [
      { code: '23P01', message: 'conflicting key value violates exclusion constraint "citas_sin_solape_por_vendedor"' },
      { code: '42501', message: 'permission denied for function reservar_cita_como' },
      { code: 'constructor' },
      { code: 'toString' },
      'VS004',
      null,
      undefined,
    ]
    for (const error of otros) {
      expect(mensajeDeErrorCita(error)).toBe(MENSAJE_GENERICO)
    }
  })
})
