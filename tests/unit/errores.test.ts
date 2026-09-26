import { describe, it, expect } from 'vitest'
import {
  mapearError,
  MENSAJE_GENERICO,
  MENSAJE_CREDENCIALES,
  MENSAJE_CORREO_SIN_VERIFICAR,
} from '@/lib/errores/mapear'

describe('mapearError', () => {
  it('nunca revela nombres de tablas ni restricciones de Postgres', () => {
    const error = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "perfiles_pkey"',
      details: 'Key (id)=(abc) already exists.',
    }
    const r = mapearError(error)
    expect(r.mensaje).toBe(MENSAJE_GENERICO)
    expect(r.mensaje).not.toContain('perfiles')
    expect(r.mensaje).not.toContain('constraint')
  })

  it('usa el mismo mensaje para credenciales invalidas', () => {
    const r = mapearError({ code: 'invalid_credentials', message: 'Invalid login credentials' })
    expect(r.mensaje).toBe(MENSAJE_CREDENCIALES)
  })

  it('usa el mismo mensaje para un usuario inexistente', () => {
    const r = mapearError({ code: 'user_not_found', message: 'User not found' })
    expect(r.mensaje).toBe(MENSAJE_CREDENCIALES)
  })

  it('avisa de que falta verificar el correo en vez del generico', () => {
    const r = mapearError({ code: 'email_not_confirmed', message: 'Email not confirmed' })
    expect(r.mensaje).toBe(MENSAJE_CORREO_SIN_VERIFICAR)
  })

  it('genera un id de correlacion distinto en cada llamada', () => {
    const a = mapearError(new Error('x'))
    const b = mapearError(new Error('x'))
    expect(a.idCorrelacion).not.toBe(b.idCorrelacion)
    expect(a.idCorrelacion).toMatch(/^[0-9a-f-]{36}$/)
  })
})
