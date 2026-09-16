import { expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { esRutaFicha, resolverRutaPublica } from '@/lib/catalogo/rutas'

function cliente(historial: unknown, propiedad: unknown) {
  return { from: (tabla: string) => {
    const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: tabla === 'rutas_publicas_propiedad' ? historial : propiedad, error: null }) }
    q.select.mockReturnValue(q)
    q.eq.mockReturnValue(q)
    return q
  } } as unknown as SupabaseClient
}

it('solo intercepta fichas y nunca rutas privadas ni imágenes', () => {
  expect(esRutaFicha('/prado/casa-a123')).toBe(true)
  for (const ruta of ['/panel/propiedades', '/imagen/123', '/login', '/control/moderar', '/mi-cuenta/favoritos', '/_next/static']) {
    expect(esRutaFicha(ruta)).toBe(false)
  }
})

it('una ruta sin historial público no consulta propiedades y delega a la página con 200', async () => {
  const c = cliente(null, null)
  const spy = vi.spyOn(c, 'from')
  expect(await resolverRutaPublica(c, '/prado/desconocida')).toEqual({ estado: 200 })
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy).toHaveBeenCalledWith('rutas_publicas_propiedad')
})

it('la URL conocida responde 410 si ya no existe publicación visible', async () => {
  expect(await resolverRutaPublica(cliente({ propiedad_id: 'id' }, null), '/prado/casa')).toEqual({ estado: 410 })
})

it('la URL antigua de barrio redirige 301 al destino publicado actual', async () => {
  expect(await resolverRutaPublica(cliente({ propiedad_id: 'id' }, { slug: 'casa', barrios: { slug: 'nuevo' } }), '/viejo/casa')).toEqual({ estado: 301, destino: '/nuevo/casa' })
})

it('una ruta publicada válida continúa hacia la ficha con 200', async () => {
  expect(await resolverRutaPublica(cliente({ propiedad_id: 'id' }, { slug: 'casa', barrios: { slug: 'prado' } }), '/prado/casa')).toEqual({ estado: 200 })
})

it('un barrio inventado no gana redirección sin historial y delega con 200', async () => {
  expect(await resolverRutaPublica(cliente(null, null), '/inventado/casa')).toEqual({ estado: 200 })
})

it('un fallo de la base lanza error para que el middleware lo capture y degrade', async () => {
  const c = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('Fallo transitorio') }) }) }) }) } as unknown as SupabaseClient
  await expect(resolverRutaPublica(c, '/prado/casa')).rejects.toThrow('No se pudo resolver la URL pública')
})
