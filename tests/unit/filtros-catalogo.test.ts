import { describe, expect, it } from 'vitest'
import { leerFiltros } from '@/lib/catalogo/filtros'

describe('filtros del catalogo', () => {
  it('usa la primera pagina sin restricciones cuando no hay parametros', () => {
    expect(leerFiltros({})).toEqual({ pagina: 1 })
  })
  it('conserva filtros validos y convierte precios y pagina', () => {
    expect(leerFiltros({ operacion: 'venta', tipo: 'casa', precio_min: '100.50', precio_max: '200', pagina: '2' }))
      .toEqual({ operacion: 'venta', tipo: 'casa', precioMin: 100.5, precioMax: 200, pagina: 2 })
  })
  it('ignora valores repetidos sin elegir arbitrariamente uno', () => {
    expect(leerFiltros({ operacion: ['venta', 'arriendo'], precio_min: ['1', '2'], pagina: ['2', '3'] })).toEqual({ pagina: 1 })
  })
  it.each(['', ' ', '-1', '0', 'NaN', 'Infinity', '1e3', '0x10', '12pesos', '1.001', '1000000000000'])('ignora el precio invalido %s', valor => {
    expect(leerFiltros({ precio_min: valor, precio_max: valor })).toEqual({ pagina: 1 })
  })
  it('acepta el limite exacto de numeric(14,2)', () => {
    expect(leerFiltros({ precio_max: '999999999999.99' }).precioMax).toBe(999999999999.99)
  })
  it('ignora un rango invertido y conserva los otros filtros', () => {
    expect(leerFiltros({ precio_min: '200', precio_max: '100', tipo: 'local' })).toEqual({ pagina: 1, tipo: 'local' })
  })
  it.each(['0', '-1', '1.5', '1e2', '9007199254740992', 'basura'])('vuelve a pagina 1 ante %s', pagina => {
    expect(leerFiltros({ pagina }).pagina).toBe(1)
  })
  it('ignora enums desconocidos', () => {
    expect(leerFiltros({ operacion: 'borrar', tipo: 'castillo' })).toEqual({ pagina: 1 })
  })
  it('texto libre: recorta, colapsa espacios y quita lo que no es letra o numero', () => {
    expect(leerFiltros({ q: '  Balcón   con vista ' }).texto).toBe('Balcón con vista')
    expect(leerFiltros({ q: 'casa,(a).b*%_"x\\' }).texto).toBe('casa a b x')
  })
  it.each(['', ' ', 'a', '%%', '()', ['casa', 'lote']])('ignora el texto inutil o repetido %j', q => {
    expect(leerFiltros({ q }).texto).toBeUndefined()
  })
  it('corta el texto a 60 caracteres', () => {
    expect(leerFiltros({ q: 'a'.repeat(100) }).texto).toHaveLength(60)
  })
  it('[campos colombianos] estrato, habitaciones, parqueaderos y administracion', () => {
    expect(leerFiltros({ estrato_min: '3', estrato_max: '5', habitaciones_min: '2', banos_min: '2', parqueaderos_min: '1', administracion_max: '400000' }))
      .toMatchObject({ estratoMin: 3, estratoMax: 5, habitacionesMin: 2, banosMin: 2, parqueaderosMin: 1, administracionMax: 400000 })
  })
  it.each([['estrato_min', '0'], ['estrato_min', '7'], ['estrato_max', '3.5'], ['habitaciones_min', '-1'], ['parqueaderos_min', 'x'], ['habitaciones_min', '99']])(
    'ignora %s=%s', (clave, valor) => {
      expect(leerFiltros({ [clave]: valor })).toEqual({ pagina: 1 })
    })
  it('ignora un rango de estrato invertido', () => {
    expect(leerFiltros({ estrato_min: '5', estrato_max: '2' })).toEqual({ pagina: 1 })
  })
})
