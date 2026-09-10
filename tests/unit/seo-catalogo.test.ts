import { afterEach, expect, it, vi } from 'vitest'
import { urlPublica, metadatosBarrio, metadatosFicha, datosFicha, serializarJsonLd } from '@/lib/catalogo/seo'
afterEach(() => vi.unstubAllEnvs())
const barrio = { nombre: 'El Prado', slug: 'el-prado' }
const ficha = { titulo: 'Casa luminosa', slug: 'casa-a123', descripcion: 'Una casa en El Prado', precio: 100000000, operacion: 'venta', imagenes_propiedad: [{ id: 'foto-1', alt_text: 'Fachada', orden: 0 }] }
it('construye URLs sobre el origen configurado, sin usar cabeceras Host', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
  expect(urlPublica('/el-prado')).toBe('https://portal.example/el-prado')
  expect(() => urlPublica('//otro.example')).toThrow()
})
it('no inventa un dominio si falta configuracion', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
  expect(() => urlPublica('/')).toThrow()
})
it('define titulos propios y canonicas de barrio y ficha', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
  expect(metadatosBarrio(barrio).alternates?.canonical).toBe('https://portal.example/el-prado')
  expect(metadatosBarrio(barrio).title).toContain('El Prado')
  expect(metadatosFicha(ficha, barrio).alternates?.canonical).toBe('https://portal.example/el-prado/casa-a123')
  expect(metadatosFicha(ficha, barrio).title).toContain('Casa luminosa')
})
it('los datos estructurados solo publican ubicacion por barrio y fotos estables', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
  const datos = datosFicha({ ...ficha, direccion: 'SECRETO' } as typeof ficha, barrio)
  expect(datos['@type']).toBe('RealEstateListing')
  expect(datos.offers.price).toBe(100000000)
  expect(datos.image).toEqual(['https://portal.example/imagen/foto-1'])
  expect(JSON.stringify(datos)).not.toMatch(/SECRETO|streetAddress|latitude|longitude/)
})
it('impide cerrar el script desde un titulo o descripcion', () => {
  const peligroso = { name: '</script><script>alert(1)</script>' }
  const texto = serializarJsonLd(peligroso)
  expect(texto).not.toContain('<')
  expect(JSON.parse(texto)).toEqual(peligroso)
})
