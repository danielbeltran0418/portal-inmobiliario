import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { esquemaEventoWompi, firmaCheckout, verificarEvento, urlCheckout } from '@/lib/planes/wompi'
import { precioConfigurado } from '@/lib/planes/catalogo'
import { leerFiltros, parametrosDeFiltros } from '@/lib/catalogo/filtros'

function evento() {
  const valor = { event: 'transaction.updated', environment: 'test', timestamp: 1700000000, data: { transaction: { id: 'tx-123', reference: '00000000-0000-4000-8000-000000000001', amount_in_cents: 3500000, currency: 'COP', status: 'APPROVED' } }, signature: { properties: ['transaction.id','transaction.status','transaction.amount_in_cents'], checksum: createHash('sha256').update('tx-123APPROVED35000001700000000secreto').digest('hex') } }
  return esquemaEventoWompi.parse(valor)
}
describe('integridad de pagos Wompi', () => {
  it('acepta una firma válida y rechaza cambiar monto, estado o secreto', () => {
    expect(verificarEvento(evento(), 'secreto')).toBe(true)
    expect(verificarEvento(evento(), 'otro')).toBe(false)
    const alterado = evento(); alterado.data.transaction.amount_in_cents++
    expect(verificarEvento(alterado, 'secreto')).toBe(false)
    alterado.data.transaction.amount_in_cents--; alterado.data.transaction.status = 'DECLINED'
    expect(verificarEvento(alterado, 'secreto')).toBe(false)
  })
  it('respeta el orden dinámico de properties', () => {
    const valor = evento(); valor.signature.properties.reverse()
    valor.signature.checksum = createHash('sha256').update('3500000APPROVEDtx-1231700000000secreto').digest('hex')
    expect(verificarEvento(valor, 'secreto')).toBe(true)
  })
  it('rechaza rutas inexistentes o sin los campos críticos firmados', () => {
    const valor = evento(); valor.signature.properties.push('__proto__.foo')
    expect(verificarEvento(valor, 'secreto')).toBe(false)
    valor.signature.properties = ['transaction.id']
    expect(verificarEvento(valor, 'secreto')).toBe(false)
  })
  it('firma también la expiración y nunca pone el secreto en la URL', () => {
    const url = new URL(urlCheckout('referencia', 10000, 'pub_test_x', 'secreto', 'https://portal.test/planes/resultado', '2026-10-11T12:00:00.000Z'))
    expect(url.origin).toBe('https://checkout.wompi.co')
    expect(url.searchParams.get('signature:integrity')).toBe(firmaCheckout('referencia', 10000, 'secreto', '2026-10-11T12:00:00.000Z'))
    expect(url.href).not.toContain('secreto')
  })
  it.each([undefined, '', '0', '-1', '1e3', '1.5', 'Infinity', '1000000000'])('no activa tarifas inválidas: %s', (valor) => expect(precioConfigurado(valor)).toBeNull())
  it('convierte una tarifa COP válida', () => expect(precioConfigurado('49000')).toBe(49000))
})
describe('filtros nuevos', () => {
  it('conserva metraje y comodidades al navegar o guardar búsquedas', () => {
    const filtros = leerFiltros({ operacion: 'temporal', area_min: '45.5', area_max: '120', piscina: '1', mascotas: '1' })
    expect(filtros).toMatchObject({ operacion: 'temporal', areaMin: 45.5, areaMax: 120, caracteristicas: ['mascotas','piscina'] })
    expect(leerFiltros(Object.fromEntries(parametrosDeFiltros(filtros)))).toEqual(filtros)
  })
  it('rechaza metraje invertido, fuera de rango y comodidades duplicadas', () => {
    expect(leerFiltros({ area_min: '100', area_max: '50', piscina: ['1','1'], mascotas: 'true' })).toEqual({ pagina: 1 })
    expect(leerFiltros({ area_min: '1000000' })).toEqual({ pagina: 1 })
  })
})