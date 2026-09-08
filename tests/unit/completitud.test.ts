import { describe, it, expect } from 'vitest'
import { faltantesParaPublicar, puedePublicar } from '@/lib/propiedades/completitud'

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

  // El tipo de precio es `number | null`: desde la migracion 20260907000100
  // un borrador recien creado nace con precio NULL de verdad (antes,
  // crearBorrador mandaba un marcador `precio: 1` que pasaba este chequeo
  // sin ser un precio real). null debe reportarse igual que 0.
  it('sin precio (null, como nace un borrador nuevo) lo reporta', () => {
    expect(faltantesParaPublicar({ ...COMPLETA, precio: null }))
      .toContain('El precio')
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

/**
 * Hallazgo Importante de la revision final de rama: el boton "Publicar" del
 * panel se deshabilitaba con faltantesParaPublicar(...).length > 0 completo,
 * que ademas de foto y precio tambien exige barrio y una descripcion de 40+
 * caracteres -- dos requisitos que la base NO impone. puedePublicar() es la
 * funcion que debe decidir el `disabled` del boton: solo mira las DOS
 * condiciones reales (propiedades_exigir_imagen y propiedades_exigir_precio).
 */
describe('puedePublicar', () => {
  it('una propiedad completa puede publicarse', () => {
    expect(puedePublicar(COMPLETA)).toBe(true)
  })

  // La prueba que exige el brief: foto y precio presentes, SIN barrio (y con
  // una descripcion corta) deben bastar. Antes de este arreglo, el boton se
  // habria quedado deshabilitado para siempre pese a que la base publica sin
  // problema.
  it('con foto y precio, SIN barrio y con descripcion corta, SI puede publicarse', () => {
    expect(puedePublicar({ ...COMPLETA, barrio_id: null, descripcion: 'Corta' })).toBe(true)
  })

  it('sin ninguna foto, NO puede publicarse', () => {
    expect(puedePublicar({ ...COMPLETA, numeroDeImagenes: 0 })).toBe(false)
  })

  it('sin precio (null), NO puede publicarse', () => {
    expect(puedePublicar({ ...COMPLETA, precio: null })).toBe(false)
  })

  it('con precio en 0, NO puede publicarse', () => {
    expect(puedePublicar({ ...COMPLETA, precio: 0 })).toBe(false)
  })
})
