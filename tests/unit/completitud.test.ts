import { describe, it, expect } from 'vitest'
import { faltantesParaPublicar } from '@/lib/propiedades/completitud'

const COMPLETA = {
  descripcion: 'Una descripcion con suficiente detalle para el catalogo.',
  barrio_id: '11111111-1111-1111-1111-111111111111',
  precio: 250000000,
  numeroDeImagenes: 3,
}

describe('faltantesParaPublicar', () => {
  it('una propiedad completa no tiene faltantes', () => {
    expect(faltantesParaPublicar(COMPLETA)).toEqual([])
  })

  it('sin imagenes lo reporta', () => {
    expect(faltantesParaPublicar({ ...COMPLETA, numeroDeImagenes: 0 }))
      .toContain('Al menos una foto')
  })

  it('sin barrio lo reporta', () => {
    expect(faltantesParaPublicar({ ...COMPLETA, barrio_id: null }))
      .toContain('El barrio')
  })

  it('con descripcion demasiado corta lo reporta', () => {
    expect(faltantesParaPublicar({ ...COMPLETA, descripcion: 'Corta' }))
      .toContain('Una descripcion de al menos 40 caracteres')
  })

  it('acumula todos los faltantes, no solo el primero', () => {
    const faltan = faltantesParaPublicar({
      descripcion: '', barrio_id: null, precio: 0, numeroDeImagenes: 0,
    })
    expect(faltan).toHaveLength(4)
  })
})
