import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const respuesta = vi.fn()
vi.mock('@/lib/supabase/cliente-publico', () => ({ crearClientePublico: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: respuesta }) }) }) }) }))
vi.mock('@/lib/catalogo/consultas', () => ({ listarPropiedadesPublicas: async () => ({ propiedades: [], total: 0 }), TAMANO_PAGINA: 12 }))
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
