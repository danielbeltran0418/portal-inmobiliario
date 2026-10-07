import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const respuesta = vi.fn()
vi.mock('@/lib/supabase/cliente-publico', () => ({ crearClientePublico: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: respuesta }) }) }) }) }))
const listado = vi.fn(async () => ({ propiedades: [] as unknown[], total: 0 }))
const sesion = vi.fn(async () => ({ hayUsuario: false, accessToken: null as string | null, idUsuario: null as string | null }))
const favoritos = vi.fn(async () => new Set<string>())
vi.mock('@/lib/catalogo/consultas', () => ({ listarPropiedadesPublicas: () => listado(), TAMANO_PAGINA: 12 }))
vi.mock('@/lib/auth/sesion', () => ({ sesionActual: () => sesion() }))
vi.mock('@/lib/comprador/favoritos', () => ({ idsFavoritos: (...a: unknown[]) => favoritos(...(a as [])) }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({}) }))
vi.mock('@/lib/comprador/acciones-favoritos', () => ({ conmutarFavoritoAction: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') } }))
const { default: Barrio } = await import('@/app/[barrio]/page')
it('muestra barrio real, filtros GET y estado vacio honesto', async () => {
  respuesta.mockResolvedValue({ data: { id: 'id', nombre: 'El Prado', slug: 'el-prado' }, error: null })
  const html = renderToStaticMarkup(await Barrio({ params: Promise.resolve({ barrio: 'el-prado' }), searchParams: Promise.resolve({}) }))
  expect(html).toContain('El Prado')
  expect(html).toContain('method="get"')
  expect(html).toContain('No hay propiedades')
})
it('devuelve notFound para barrios inexistentes', async () => {
  respuesta.mockResolvedValue({ data: null, error: null })
  await expect(Barrio({ params: Promise.resolve({ barrio: 'inexistente' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NOT_FOUND')
})
it('[diseño Figma Make] filtros en columna lateral: operacion con radios, Filtrar y Limpiar filtros', async () => {
  respuesta.mockResolvedValue({ data: { id: 'id', nombre: 'El Prado', slug: 'el-prado' }, error: null })
  const html = renderToStaticMarkup(await Barrio({ params: Promise.resolve({ barrio: 'el-prado' }), searchParams: Promise.resolve({ operacion: 'arriendo' }) }))
  const lateral = html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? ''
  expect(lateral).toContain('method="get"')
  expect(lateral).toMatch(/type="radio"[^>]*name="operacion"[^>]*value=""|name="operacion"[^>]*value=""[^>]*type="radio"/)
  expect(lateral).toMatch(/value="arriendo"[^>]*checked=""|checked=""[^>]*value="arriendo"/)
  expect(lateral).toMatch(/<button[^>]*type="submit"[^>]*>Filtrar<\/button>/)
  expect(lateral).toContain('Limpiar filtros')
  expect(lateral).toMatch(/<label[^>]*>[^<]*Precio mínimo/)
  expect(lateral).toMatch(/<label[^>]*>[^<]*Precio máximo/)
})

const CASA = {
  id: 'p1', slug: 'casa-a1', titulo: 'Casa', operacion: 'venta', tipo_inmueble: 'casa', precio: 1,
  habitaciones: 3, banos: 2, area_m2: 90, imagenes_propiedad: [],
}
it('[diseño Figma Make] el corazon de cada tarjeta lleva al login con vuelta al catalogo filtrado', async () => {
  respuesta.mockResolvedValue({ data: { id: 'id', nombre: 'El Prado', slug: 'el-prado' }, error: null })
  listado.mockResolvedValueOnce({ propiedades: [CASA], total: 1 })
  const html = renderToStaticMarkup(await Barrio({ params: Promise.resolve({ barrio: 'el-prado' }), searchParams: Promise.resolve({ tipo: 'casa' }) }))
  expect(html).toContain('href="/login?volver=%2Fel-prado%3Ftipo%3Dcasa"')
})
it('con sesion marca los favoritos del usuario', async () => {
  respuesta.mockResolvedValue({ data: { id: 'id', nombre: 'El Prado', slug: 'el-prado' }, error: null })
  listado.mockResolvedValueOnce({ propiedades: [CASA], total: 1 })
  sesion.mockResolvedValueOnce({ hayUsuario: true, accessToken: 'x', idUsuario: 'u1' })
  favoritos.mockResolvedValueOnce(new Set(['p1']))
  const html = renderToStaticMarkup(await Barrio({ params: Promise.resolve({ barrio: 'el-prado' }), searchParams: Promise.resolve({}) }))
  expect(html).toContain('aria-label="Eliminar de favoritos"')
})
