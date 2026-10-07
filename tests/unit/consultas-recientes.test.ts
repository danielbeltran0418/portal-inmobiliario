import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listarRecientes } from '@/lib/catalogo/consultas'

function cliente(resultado: { data: unknown; error: object | null }) {
  const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() }
  q.select.mockReturnValue(q)
  q.eq.mockReturnValue(q)
  q.order.mockReturnValue(q)
  q.limit.mockResolvedValue(resultado)
  const from = vi.fn().mockReturnValue(q)
  return { q, from, db: { from } as unknown as SupabaseClient }
}

describe('listarRecientes (portada)', () => {
  it('pide solo publicadas con foto y con su barrio, destacadas primero y luego las mas nuevas', async () => {
    const { db, q, from } = cliente({ data: [], error: null })
    await listarRecientes(db)
    expect(from).toHaveBeenCalledWith('propiedades')
    const columnas = q.select.mock.calls[0][0] as string
    expect(columnas).toContain('imagenes_propiedad!inner')
    expect(columnas).toContain('barrios!inner(slug,nombre)')
    expect(q.eq).toHaveBeenCalledWith('estado', 'publicada')
    expect(q.order.mock.calls[0]).toEqual(['destacada', { ascending: false }])
    expect(q.order.mock.calls[1]).toEqual(['actualizado_en', { ascending: false }])
    expect(q.limit).toHaveBeenCalledWith(6)
  })

  it('devuelve las filas tal cual', async () => {
    const fila = { id: 'p1', slug: 'casa', barrios: { slug: 'el-prado', nombre: 'El Prado' } }
    const { db } = cliente({ data: [fila], error: null })
    expect(await listarRecientes(db)).toEqual([fila])
  })

  it('un fallo de la consulta no tumba la portada: devuelve lista vacia', async () => {
    const { db } = cliente({ data: null, error: { message: 'caida' } })
    expect(await listarRecientes(db)).toEqual([])
  })
})
