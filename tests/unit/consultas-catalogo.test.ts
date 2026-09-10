import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listarPropiedadesPublicas } from '@/lib/catalogo/consultas'

function cliente(error: object | null = null) {
  const q = { select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lte: vi.fn(), order: vi.fn(), range: vi.fn() }
  for (const metodo of ['select', 'eq', 'gte', 'lte', 'order'] as const) q[metodo].mockReturnValue(q)
  q.range.mockResolvedValue({ data: [], error, count: 0 })
  return { q, db: { from: vi.fn().mockReturnValue(q) } as unknown as SupabaseClient }
}
describe('consulta publica del catalogo', () => {
  it('solo consulta columnas publicas, publicaciones del barrio y con imagen', async () => {
    const { db, q } = cliente()
    await listarPropiedadesPublicas(db, 'barrio-id', { pagina: 1 })
    expect(q.eq).toHaveBeenCalledWith('estado', 'publicada')
    expect(q.eq).toHaveBeenCalledWith('barrio_id', 'barrio-id')
    const columnas = q.select.mock.calls[0][0] as string
    expect(columnas).toContain('imagenes_propiedad!inner')
    expect(columnas).not.toMatch(/direccion|latitud|longitud|vendedor_id|ruta_storage|\*/)
    expect(q.order).toHaveBeenCalledWith('actualizado_en', { ascending: false })
    expect(q.order).toHaveBeenCalledWith('id', { ascending: false })
    expect(q.range).toHaveBeenCalledWith(0, 11)
  })
  it('aplica todos los filtros y pagina en servidor', async () => {
    const { db, q } = cliente()
    await listarPropiedadesPublicas(db, 'barrio-id', { pagina: 2, operacion: 'arriendo', tipo: 'casa', precioMin: 100, precioMax: 200 })
    expect(q.eq).toHaveBeenCalledWith('operacion', 'arriendo')
    expect(q.eq).toHaveBeenCalledWith('tipo_inmueble', 'casa')
    expect(q.gte).toHaveBeenCalledWith('precio', 100)
    expect(q.lte).toHaveBeenCalledWith('precio', 200)
    expect(q.range).toHaveBeenCalledWith(12, 23)
  })
  it('no convierte una caida del servicio en un catalogo vacio', async () => {
    const { db } = cliente({ message: 'detalle interno' })
    await expect(listarPropiedadesPublicas(db, 'id', { pagina: 1 })).rejects.toThrow('No se pudo cargar el catálogo')
  })
  it('rechaza paginas cuyo desplazamiento no es seguro', async () => {
    const { db, q } = cliente()
    await expect(listarPropiedadesPublicas(db, 'id', { pagina: Number.MAX_SAFE_INTEGER })).rejects.toThrow()
    expect(q.range).not.toHaveBeenCalled()
  })
})
