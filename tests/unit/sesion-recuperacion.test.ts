import { describe, it, expect } from 'vitest'
import { sesionDeRecuperacionReciente } from '@/lib/auth/recuperacion'

const AHORA = 1_800_000_000

describe('sesionDeRecuperacionReciente', () => {
  it('acepta otp y recovery dentro de los 15 minutos', () => {
    expect(sesionDeRecuperacionReciente({ amr: [{ method: 'otp', timestamp: AHORA - 900 }] }, AHORA)).toBe(true)
    expect(sesionDeRecuperacionReciente({ amr: [{ method: 'recovery', timestamp: AHORA }] }, AHORA)).toBe(true)
  })

  it('rechaza fuera de la ventana o con marca de tiempo en el futuro', () => {
    expect(sesionDeRecuperacionReciente({ amr: [{ method: 'otp', timestamp: AHORA - 901 }] }, AHORA)).toBe(false)
    expect(sesionDeRecuperacionReciente({ amr: [{ method: 'otp', timestamp: AHORA + 3600 }] }, AHORA)).toBe(false)
  })

  it('rechaza otros metodos, el formato de cadenas y entradas mal formadas', () => {
    expect(sesionDeRecuperacionReciente({ amr: [{ method: 'password', timestamp: AHORA }] }, AHORA)).toBe(false)
    expect(sesionDeRecuperacionReciente({ amr: ['otp'] }, AHORA)).toBe(false)
    expect(sesionDeRecuperacionReciente({ amr: [null, { method: 'otp', timestamp: '1' }] }, AHORA)).toBe(false)
    expect(sesionDeRecuperacionReciente({}, AHORA)).toBe(false)
    expect(sesionDeRecuperacionReciente(null, AHORA)).toBe(false)
  })
})
