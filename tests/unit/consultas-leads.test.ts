import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listarLeadsDelVendedor, contarLeadsNuevos } from '@/lib/leads/consultas'

function clienteListado(resultado: { data: unknown; error: object | null }) {
  const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() }
  q.select.mockReturnValue(q)
  q.eq.mockReturnValue(q)
  q.order.mockReturnValue(q)
  q.limit.mockResolvedValue(resultado)
  return { q, db: { from: vi.fn().mockReturnValue(q) } as unknown as SupabaseClient }
}

function clienteConteo(resultado: { count: number | null; error: object | null }) {
  const q: { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; then?: unknown } = {
    select: vi.fn(),
    eq: vi.fn(),
  }
  q.select.mockReturnValue(q)
  q.eq.mockReturnValue(q)
  q.then = (onfulfilled: (v: unknown) => unknown, onrejected: (r: unknown) => unknown) =>
    Promise.resolve(resultado).then(onfulfilled, onrejected)
  return { q, db: { from: vi.fn().mockReturnValue(q) } as unknown as SupabaseClient }
}

describe('listarLeadsDelVendedor', () => {
  it('filtra explicitamente por vendedor_id (CN-011)', async () => {
    const { db, q } = clienteListado({ data: [], error: null })
    await listarLeadsDelVendedor(db, 'vendedor-123')
    expect(q.eq).toHaveBeenCalledWith('vendedor_id', 'vendedor-123')
  })

  it('pide leads_contacto SIEMPRE, sin condicion en el cliente', async () => {
    const { db, q } = clienteListado({ data: [], error: null })
    await listarLeadsDelVendedor(db, 'vendedor-123')
    const columnas = q.select.mock.calls[0][0] as string
    expect(columnas).toContain('leads_contacto(correo,telefono)')
    expect(columnas).toContain('propiedades(titulo,slug)')
  })

  it('ordena por estado y luego por fecha de creacion descendente', async () => {
    const { db, q } = clienteListado({ data: [], error: null })
    await listarLeadsDelVendedor(db, 'vendedor-123')
    expect(q.order).toHaveBeenCalledWith('estado', { ascending: true })
    expect(q.order).toHaveBeenCalledWith('creado_en', { ascending: false })
  })

  it('acota la bandeja: PostgREST corta en silencio en 1000 filas y las nuevas deben verse primero', async () => {
    const { db, q } = clienteListado({ data: [], error: null })
    await listarLeadsDelVendedor(db, 'vendedor-123')
    expect(q.limit).toHaveBeenCalledWith(200)
  })

  it('devuelve la lista tal cual la trae la consulta', async () => {
    const fila = {
      id: 'lead-1', nombre_mostrado: 'Comprador', mensaje: 'Hola', estado: 'nuevo',
      creado_en: '2026-09-11T00:00:00Z', propiedades: { titulo: 'Apto', slug: 'apto' },
      leads_contacto: null,
    }
    const { db } = clienteListado({ data: [fila], error: null })
    const resultado = await listarLeadsDelVendedor(db, 'vendedor-123')
    expect(resultado).toEqual([fila])
  })

  it('no convierte una caida del servicio en una bandeja vacia', async () => {
    const { db } = clienteListado({ data: null, error: { message: 'detalle interno' } })
    await expect(listarLeadsDelVendedor(db, 'vendedor-123')).rejects.toThrow('No se pudo cargar la bandeja de leads')
  })
})

describe('contarLeadsNuevos', () => {
  it('filtra por vendedor_id y por estado nuevo (CN-011)', async () => {
    const { db, q } = clienteConteo({ count: 3, error: null })
    await contarLeadsNuevos(db, 'vendedor-123')
    expect(q.eq).toHaveBeenCalledWith('vendedor_id', 'vendedor-123')
    expect(q.eq).toHaveBeenCalledWith('estado', 'nuevo')
  })

  it('devuelve el conteo', async () => {
    const { db } = clienteConteo({ count: 5, error: null })
    await expect(contarLeadsNuevos(db, 'vendedor-123')).resolves.toBe(5)
  })

  it('se degrada a cero si la consulta falla, sin tumbar el panel', async () => {
    const { db } = clienteConteo({ count: null, error: { message: 'detalle interno' } })
    await expect(contarLeadsNuevos(db, 'vendedor-123')).resolves.toBe(0)
  })

  it('devuelve cero cuando count viene null sin error', async () => {
    const { db } = clienteConteo({ count: null, error: null })
    await expect(contarLeadsNuevos(db, 'vendedor-123')).resolves.toBe(0)
  })
})
