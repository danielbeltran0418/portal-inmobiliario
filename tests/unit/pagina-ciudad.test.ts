import { expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('server-only', () => ({}))
const ciudad = vi.fn()
const listado = vi.fn()
vi.mock('@/lib/catalogo/ciudades', () => ({ cargarCiudad: (...a: unknown[]) => ciudad(...a) }))
vi.mock('@/lib/catalogo/consultas', () => ({ listarPropiedadesPublicas: (...a: unknown[]) => listado(...a), TAMANO_PAGINA: 12 }))
vi.mock('@/lib/supabase/cliente-publico', () => ({ crearClientePublico: () => ({}) }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({}) }))
vi.mock('@/lib/auth/sesion', () => ({ sesionActual: async () => ({ hayUsuario: false, accessToken: null, idUsuario: null }) }))
vi.mock('@/lib/comprador/favoritos', () => ({ idsFavoritos: async () => new Set() }))
vi.mock('@/lib/comprador/acciones-favoritos', () => ({ conmutarFavoritoAction: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') } }))

const { default: Ciudad, generateMetadata } = await import('@/app/ciudad/[ciudad]/page')

const BOGOTA = {
  nombre: 'Bogotá', slug: 'bogota',
  barrios: [{ id: 'b1', nombre: 'Chapinero', slug: 'chapinero' }, { id: 'b2', nombre: 'Usaquén', slug: 'usaquen' }],
}
const CASA = {
  id: 'p1', slug: 'casa-a1', barrio_id: 'b2', titulo: 'Casa en Usaquén', operacion: 'venta', tipo_inmueble: 'casa', precio: 1,
  habitaciones: 3, banos: 2, area_m2: 90, imagenes_propiedad: [],
}
const entrada = (searchParams = {}) => ({ params: Promise.resolve({ ciudad: 'bogota' }), searchParams: Promise.resolve(searchParams) })

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
  ciudad.mockReset().mockResolvedValue(BOGOTA)
  listado.mockReset().mockResolvedValue({ propiedades: [CASA], total: 1 })
})

it('lista las propiedades de todos los barrios de la ciudad, cada una enlazada a su barrio', async () => {
  const html = renderToStaticMarkup(await Ciudad(entrada()))
  expect(listado).toHaveBeenCalledWith(expect.anything(), ['b1', 'b2'], expect.objectContaining({ pagina: 1 }))
  expect(html).toMatch(/<h1[^>]*>Propiedades en Bogotá<\/h1>/)
  expect(html).toContain('href="/usaquen/casa-a1"')
})

it('muestra los barrios de la ciudad como accesos y los mismos filtros laterales', async () => {
  const html = renderToStaticMarkup(await Ciudad(entrada({ estrato_min: '3' })))
  expect(html).toContain('href="/chapinero"')
  expect(html).toContain('href="/usaquen"')
  expect(html).toMatch(/<aside[\s\S]*name="estrato_min"[\s\S]*<\/aside>/)
  expect(listado).toHaveBeenCalledWith(expect.anything(), ['b1', 'b2'], expect.objectContaining({ estratoMin: 3 }))
})

it('una ciudad sin barrios activos es 404', async () => {
  ciudad.mockResolvedValue(null)
  await expect(Ciudad(entrada())).rejects.toThrow('NOT_FOUND')
})

it('metadatos: canonica de la ciudad e indexable solo sin filtros', async () => {
  const base = await generateMetadata(entrada())
  expect(base.alternates?.canonical).toBe('https://portal.example/ciudad/bogota')
  expect(base.robots).toBeUndefined()
  const filtrada = await generateMetadata(entrada({ tipo: 'casa' }))
  expect(filtrada.robots).toEqual({ index: false, follow: true })
})
