import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const insert = vi.fn()
vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ insert: (fila: unknown) => { insert(fila); return { select: () => ({ single: async () => ({ data: { id: 'b1' }, error: null }) }) } } }),
  }),
}))

const { normalizarFiltrosGuardados } = await import('@/lib/comprador/busquedas')
const { guardarBusquedaAction } = await import('@/lib/comprador/acciones-busquedas')
const { TarjetaBusquedaGuardada } = await import('@/components/comprador/TarjetaBusquedaGuardada')

describe('filtros de una busqueda guardada', () => {
  it('solo conserva los filtros del catalogo, ya validados, incluidas las palabras clave', () => {
    expect(normalizarFiltrosGuardados({
      barrio: 'el-prado', operacion: 'venta', tipo: 'casa', precio_min: 100, precio_max: '200',
      q: '  patio (grande) ', inventado: 'x'.repeat(10000), pagina: 3,
    })).toEqual({ barrio: 'el-prado', operacion: 'venta', tipo: 'casa', precio_min: 100, precio_max: 200, q: 'patio grande' })
  })

  it('descarta un barrio que no es un slug y valores invalidos', () => {
    expect(normalizarFiltrosGuardados({ barrio: '../panel', operacion: 'trueque', q: 'a' })).toEqual({})
  })
})

describe('guardarBusquedaAction', () => {
  beforeEach(() => insert.mockReset())

  it('guarda los filtros normalizados, no lo que mande el cliente', async () => {
    await guardarBusquedaAction('Con patio', { barrio: 'el-prado', q: 'patio', basura: { a: 1 } }, true)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      filtros: { barrio: 'el-prado', q: 'patio' }, notificaciones_activas: true,
    }))
  })
})

describe('TarjetaBusquedaGuardada', () => {
  it('muestra las palabras clave con su nombre y enlaza al catalogo con q', () => {
    const html = renderToStaticMarkup(createElement(TarjetaBusquedaGuardada, {
      busqueda: {
        id: 'b1', usuario_id: 'u1', nombre: 'Con patio', notificaciones_activas: false,
        creado_en: '', actualizado_en: '', filtros: { barrio: 'el-prado', q: 'patio grande', precio_max: 200 },
      },
    }))
    expect(html).toContain('Palabras clave')
    expect(html).toContain('patio grande')
    expect(html).toContain('Precio máximo')
    expect(html).toMatch(/href="\/el-prado\?[^"]*q=patio\+grande/)
  })
})
