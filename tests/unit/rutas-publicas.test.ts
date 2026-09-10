import { expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { esRutaFicha, resolverRutaPublica } from '@/lib/catalogo/rutas'
function cliente(historial: unknown, propiedad: unknown) {
  return { from: (tabla: string) => {
    const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: tabla === 'rutas_publicas_propiedad' ? historial : propiedad, error: null }) }
    q.select.mockReturnValue(q); q.eq.mockReturnValue(q)
    return q
  } } as unknown as SupabaseClient
}
it('solo intercepta fichas y nunca rutas privadas ni imágenes', () => {
  expect(esRutaFicha('/prado/casa-a123')).toBe(true)
  for (const ruta of ['/panel/propiedades', '/imagen/123', '/login', '/control/moderar', '/mi-cuenta/favoritos', '/_next/static']) expect(esRutaFicha(ruta)).toBe(false)
})
it('un borrador nunca público es indistinguible de un slug inexistente', async () => {
  expect(await resolverRutaPublica(cliente(null, null), '/prado/desconocida')).toEqual({ estado: 404 })
})
it('la URL conocida responde 410 si ya no existe publicación visible', async () => {
  expect(await resolverRutaPublica(cliente({ propiedad_id: 'id' }, null), '/prado/casa')).toEqual({ estado: 410 })
})
it('la URL antigua de barrio redirige 301 al destino publicado actual', async () => {
  expect(await resolverRutaPublica(cliente({ propiedad_id: 'id' }, { slug: 'casa', barrios: { slug: 'nuevo' } }), '/viejo/casa')).toEqual({ estado: 301, destino: '/nuevo/casa' })
})
it('una ruta publicada válida continúa hacia la ficha', async () => {
  expect(await resolverRutaPublica(cliente(null, { slug: 'casa', barrios: { slug: 'prado' } }), '/prado/casa')).toEqual({ estado: 200 })
})
it('un barrio inventado no gana redirección sin historial', async () => {
  expect(await resolverRutaPublica(cliente(null, { slug: 'casa', barrios: { slug: 'prado' } }), '/inventado/casa')).toEqual({ estado: 404 })
})
