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
