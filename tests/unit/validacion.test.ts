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

  // Un input HTML vacio no siempre envia undefined: puede llegar como ''
  // (input vacio), como una cadena de solo espacios (el vendedor toco el
  // campo y no escribio nada visible) o como null. Las tres significan lo
  // mismo -- "sin dato" -- y los cinco campos opcionales tienen que
  // tratarlas igual: ni un valor por defecto silencioso (habitaciones/banos
  // convertian cualquiera de las tres en 0) ni un error (area_m2/barrio_id
  // las rechazaban pese a estar marcados .optional(), y con null el mensaje
  // ademas era el crudo de zod, no el de formulario).
  const SIN_DATO: Array<[string, string | null]> = [
    ['cadena vacia', ''],
    ['solo espacios', '   '],
    ['null', null],
  ]

  it.each(SIN_DATO)('habitaciones con %s queda ausente, no en 0', (_etiqueta, valor) => {
    const r = esquemaPropiedad.parse({ ...base, habitaciones: valor })
    expect(r.habitaciones).toBeUndefined()
  })

  it.each(SIN_DATO)('banos con %s queda ausente, no en 0', (_etiqueta, valor) => {
    const r = esquemaPropiedad.parse({ ...base, banos: valor })
    expect(r.banos).toBeUndefined()
  })

  it.each(SIN_DATO)('area_m2 con %s queda ausente, no en error', (_etiqueta, valor) => {
    const r = esquemaPropiedad.parse({ ...base, area_m2: valor })
    expect(r.area_m2).toBeUndefined()
  })

  it.each(SIN_DATO)('barrio_id con %s queda ausente, no en error', (_etiqueta, valor) => {
    const r = esquemaPropiedad.parse({ ...base, barrio_id: valor })
    expect(r.barrio_id).toBeUndefined()
  })

  it.each(SIN_DATO)('direccion con %s queda ausente', (_etiqueta, valor) => {
    const r = esquemaPropiedad.parse({ ...base, direccion: valor })
    expect(r.direccion).toBeUndefined()
  })

  // El caso contrario al de arriba: normalizar de mas rompe un dato real.
  // Un valor de verdad en cada campo opcional tiene que sobrevivir intacto.
  it('un valor real en cada campo opcional se conserva intacto', () => {
    const r = esquemaPropiedad.parse({
      ...base,
      habitaciones: '3',
      banos: '2',
      area_m2: '85.5',
      barrio_id: '11111111-1111-4111-8111-111111111111',
      direccion: 'Calle 10 # 20-30',
    })
    expect(r.habitaciones).toBe(3)
    expect(r.banos).toBe(2)
    expect(r.area_m2).toBe(85.5)
    expect(r.barrio_id).toBe('11111111-1111-4111-8111-111111111111')
    expect(r.direccion).toBe('Calle 10 # 20-30')
  })

  // La columna es numeric(14,2): 12 digitos enteros + 2 decimales.
  it('rechaza un precio que supera la cota de numeric(14,2)', () => {
    expect(esquemaPropiedad.safeParse({ ...base, precio: '1000000000000000' }).success).toBe(false)
  })

  it('acepta un precio justo en la cota de numeric(14,2)', () => {
    const r = esquemaPropiedad.parse({ ...base, precio: '999999999999.99' })
    expect(r.precio).toBe(999999999999.99)
  })

  // Sin esta prueba, una cota generosa de mas (p. ej. 1e13) pasaria las dos
  // pruebas de arriba sin que nadie lo note: fija el borde exacto.
  it('rechaza el precio un centavo por encima de la cota de numeric(14,2)', () => {
    expect(esquemaPropiedad.safeParse({ ...base, precio: '1000000000000.00' }).success).toBe(false)
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
