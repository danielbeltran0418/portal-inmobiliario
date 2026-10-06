import { describe, it, expect } from 'vitest'
import { cronAutorizado } from '@/lib/seguridad/secreto-cron'

describe('cronAutorizado (CN-012: comparacion en tiempo constante)', () => {
  it('acepta la cabecera Bearer con el secreto exacto', () => {
    expect(cronAutorizado('Bearer s3creto', 's3creto')).toBe(true)
  })

  it.each([
    ['cabecera ausente', null],
    ['cabecera vacia', ''],
    ['sin prefijo Bearer', 's3creto'],
    ['secreto distinto de igual longitud', 'Bearer s3crett'],
    ['secreto mas corto', 'Bearer s3cre'],
    ['secreto mas largo', 'Bearer s3creto-extra'],
  ])('rechaza: %s', (_caso, cabecera) => {
    expect(cronAutorizado(cabecera, 's3creto')).toBe(false)
  })

  it('falla cerrado si CRON_SECRET no esta configurado', () => {
    expect(cronAutorizado('Bearer ', undefined)).toBe(false)
    expect(cronAutorizado('Bearer ', '')).toBe(false)
  })
})
