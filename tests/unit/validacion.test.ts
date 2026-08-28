import { describe, it, expect } from 'vitest'
import { esquemaRegistro, esquemaLogin } from '@/lib/validacion/esquemas'

const valido = {
  nombre: 'Ana Perez',
  correo: 'Ana@Ejemplo.COM',
  telefono: '3001234567',
  password: 'ClaveLargaSegura1',
  rol: 'comprador' as const,
}

describe('esquemaRegistro', () => {
  it('acepta datos validos y normaliza el correo a minusculas', () => {
    const r = esquemaRegistro.parse(valido)
    expect(r.correo).toBe('ana@ejemplo.com')
  })

  it('rechaza una contrasena de menos de 12 caracteres', () => {
    expect(esquemaRegistro.safeParse({ ...valido, password: 'Corta123' }).success).toBe(false)
  })

  it('rechaza el rol super_admin en la capa de validacion', () => {
    expect(esquemaRegistro.safeParse({ ...valido, rol: 'super_admin' }).success).toBe(false)
  })

  it('rechaza un celular que no es colombiano de 10 digitos', () => {
    expect(esquemaRegistro.safeParse({ ...valido, telefono: '12345' }).success).toBe(false)
  })

  it('rechaza un correo mal formado', () => {
    expect(esquemaRegistro.safeParse({ ...valido, correo: 'no-es-correo' }).success).toBe(false)
  })
})

describe('esquemaLogin', () => {
  it('acepta correo y contrasena', () => {
    expect(esquemaLogin.safeParse({ correo: 'a@b.com', password: 'x' }).success).toBe(true)
  })
})
