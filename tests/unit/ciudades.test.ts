import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { slugDeTexto, listarCiudades, cargarCiudad } from '@/lib/catalogo/ciudades'

describe('slugDeTexto (misma regla que public.slug_de_texto)', () => {
  it.each([
    ['Bogotá', 'bogota'],
    ['  BOGOTÁ ', 'bogota'],
    ['Medellín', 'medellin'],
    ['San Andrés', 'san-andres'],
    ['Cúcuta', 'cucuta'],
    ['Santa Fe de Antioquia', 'santa-fe-de-antioquia'],
    ['Peñol', 'penol'],
    ['La 70', 'la-70'],
  ])('%j -> %s', (texto, slug) => {
    expect(slugDeTexto(texto)).toBe(slug)
  })

  it('la migracion quita las mismas tildes y la eñe', () => {
    const sql = readFileSync('supabase/migrations/20261012000200_ciudades.sql', 'utf8')
    for (const letra of ['Á', 'É', 'Í', 'Ó', 'Ú', 'Ü', 'Ñ', 'á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ']) expect(sql).toContain(letra)
  })
})

function cliente(data: unknown, error: unknown = null) {
  const q: Record<string, unknown> = {}
  q.select = vi.fn(() => q)
  q.eq = vi.fn(() => q)
  q.order = vi.fn(async () => ({ data, error }))
  q.then = (resolver: (v: unknown) => unknown) => resolver({ data, error })
  return { db: { from: vi.fn(() => q) } as unknown as SupabaseClient, q }
}

describe('listarCiudades', () => {
  it('agrupa los barrios por ciudad y ordena por cantidad de barrios', async () => {
    const { db } = cliente([
      { ciudad: 'Barranquilla', ciudad_slug: 'barranquilla' },
      { ciudad: 'Bogotá', ciudad_slug: 'bogota' },
      { ciudad: 'Bogotá', ciudad_slug: 'bogota' },
    ])
    expect(await listarCiudades(db)).toEqual([
      { nombre: 'Bogotá', slug: 'bogota', barrios: 2 },
      { nombre: 'Barranquilla', slug: 'barranquilla', barrios: 1 },
    ])
  })

  it('un fallo no rompe la portada: lista vacia', async () => {
    expect(await listarCiudades(cliente(null, { message: 'x' }).db)).toEqual([])
  })
})

describe('cargarCiudad', () => {
  it('devuelve la ciudad con sus barrios activos', async () => {
    const { db, q } = cliente([{ id: 'b1', nombre: 'Chapinero', slug: 'chapinero', ciudad: 'Bogotá' }])
    expect(await cargarCiudad(db, 'bogota')).toEqual({ nombre: 'Bogotá', slug: 'bogota', barrios: [{ id: 'b1', nombre: 'Chapinero', slug: 'chapinero' }] })
    expect(q.eq).toHaveBeenCalledWith('ciudad_slug', 'bogota')
    expect(q.eq).toHaveBeenCalledWith('activo', true)
  })

  it('un slug invalido no consulta y una ciudad sin barrios es null', async () => {
    const { db } = cliente([])
    expect(await cargarCiudad(db, '../panel')).toBeNull()
    expect(await cargarCiudad(db, 'atlantida')).toBeNull()
  })
})
