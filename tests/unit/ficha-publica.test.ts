import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const resultado = vi.fn()
vi.mock('@/lib/supabase/cliente-publico', () => ({ crearClientePublico: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: resultado }) }) }) }) }) }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') }, permanentRedirect: (url: string) => { throw new Error(`REDIRECT:${url}`) } }))
const { default: Ficha } = await import('@/app/[barrio]/[slug]/page')
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
const params = Promise.resolve({ barrio: 'prado', slug: 'casa-a123' })
it('no muestra una ficha invisible', async () => {
  resultado.mockResolvedValue({ data: null, error: null })
  await expect(Ficha({ params })).rejects.toThrow('NOT_FOUND')
})
it('renderiza la ficha publicada sin necesitar dirección exacta ni fotos', async () => {
  resultado.mockResolvedValue({ data: { titulo: 'Casa del Prado', slug: 'casa-a123', descripcion: 'Casa luminosa', precio: 100000000, operacion: 'venta', barrios: { nombre: 'Prado', slug: 'prado' }, imagenes_propiedad: [] }, error: null })
  const html = renderToStaticMarkup(await Ficha({ params }))
  expect(html).toContain('Casa del Prado')
  expect(html).toContain('Casa luminosa')
  expect(html).toContain('Prado')
})
