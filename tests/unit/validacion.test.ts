import { describe, it, expect } from 'vitest'
import { esquemaRegistro, esquemaLogin, esquemaPropiedad } from '@/lib/validacion/esquemas'

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

describe('esquemaPropiedad', () => {
  // Lo que llega ya relleno de un FormData real.
  const base = {
    titulo: 'Apartamento con vista al parque',
    operacion: 'venta' as const,
    tipo_inmueble: 'apartamento' as const,
    precio: '350000000',
  }

  // Un input HTML vacio no envia undefined, envia ''. Cada uno de los cinco
  // campos opcionales tiene que tratar esa cadena vacia como "sin dato": ni
  // un valor por defecto silencioso (habitaciones/banos) ni un error
  // (area_m2/barrio_id) pese a estar marcados .optional().
  it('trata la cadena vacia de habitaciones como ausente, no como cero', () => {
    const r = esquemaPropiedad.parse({ ...base, habitaciones: '' })
    expect(r.habitaciones).toBeUndefined()
  })

  it('trata la cadena vacia de banos como ausente, no como cero', () => {
    const r = esquemaPropiedad.parse({ ...base, banos: '' })
    expect(r.banos).toBeUndefined()
  })

  it('trata la cadena vacia de area_m2 como ausente, no como error', () => {
    const r = esquemaPropiedad.parse({ ...base, area_m2: '' })
    expect(r.area_m2).toBeUndefined()
  })

  it('trata la cadena vacia de barrio_id como ausente, no como error', () => {
    const r = esquemaPropiedad.parse({ ...base, barrio_id: '' })
    expect(r.barrio_id).toBeUndefined()
  })

  it('trata la cadena vacia de direccion como ausente', () => {
    const r = esquemaPropiedad.parse({ ...base, direccion: '' })
    expect(r.direccion).toBeUndefined()
  })

  // La columna es numeric(14,2): 12 digitos enteros + 2 decimales.
  it('rechaza un precio que supera la cota de numeric(14,2)', () => {
    expect(esquemaPropiedad.safeParse({ ...base, precio: '1000000000000000' }).success).toBe(false)
  })

  it('acepta un precio justo en la cota de numeric(14,2)', () => {
    const r = esquemaPropiedad.parse({ ...base, precio: '999999999999.99' })
    expect(r.precio).toBe(999999999999.99)
  })

  // El caso que promete el sub-proyecto: guardar un borrador a medias. El
  // vendedor solo lleno titulo, operacion, tipo_inmueble y precio; el resto
  // del formulario llega en blanco, como cadenas vacias.
  it('valida un borrador a medias con el resto de campos en blanco, como en un FormData real', () => {
    const formData = {
      ...base,
      descripcion: '',
      habitaciones: '',
      banos: '',
      area_m2: '',
      barrio_id: '',
      direccion: '',
    }
    const r = esquemaPropiedad.parse(formData)
    expect(r.habitaciones).toBeUndefined()
    expect(r.banos).toBeUndefined()
    expect(r.area_m2).toBeUndefined()
    expect(r.barrio_id).toBeUndefined()
    expect(r.direccion).toBeUndefined()
    expect(r.descripcion).toBe('')
  })
})
