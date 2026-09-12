import { describe, it, expect } from 'vitest'
import { esquemaLead } from '@/lib/validacion/esquemas'

const valido = { mensaje: 'Me interesa esta propiedad, quisiera visitarla.', telefono: '3001234567' }

describe('esquemaLead', () => {
  it('acepta un lead valido', () => {
    expect(esquemaLead.safeParse(valido).success).toBe(true)
  })

  it('rechaza un mensaje de menos de 10 caracteres', () => {
    expect(esquemaLead.safeParse({ ...valido, mensaje: 'hola' }).success).toBe(false)
  })

  // El limite alto tiene que coincidir con el CHECK de la tabla. Si el esquema
  // dejara pasar 1001, el usuario recibiria un error de base de datos en vez de
  // uno del formulario.
  it('rechaza un mensaje de mas de 1000 caracteres', () => {
    expect(esquemaLead.safeParse({ ...valido, mensaje: 'x'.repeat(1001) }).success).toBe(false)
    expect(esquemaLead.safeParse({ ...valido, mensaje: 'x'.repeat(1000) }).success).toBe(true)
  })

  // FormData devuelve cadena vacia, no undefined, para un campo vacio: por eso
  // se prueba '' y no la ausencia del campo.
  it('rechaza el telefono vacio', () => {
    expect(esquemaLead.safeParse({ ...valido, telefono: '' }).success).toBe(false)
    expect(esquemaLead.safeParse({ ...valido, telefono: '   ' }).success).toBe(false)
  })
})
