import { afterEach, expect, it, vi } from 'vitest'
import { metadatosBarrio, descripcionCorta, catalogoIndexable } from '@/lib/catalogo/seo'

afterEach(() => vi.unstubAllEnvs())

const barrio = { nombre: 'El Prado', slug: 'el-prado' }

it('el catalogo base de un barrio es indexable y no declara robots', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
  expect(metadatosBarrio(barrio).robots).toBeUndefined()
  expect(metadatosBarrio(barrio, { indexable: true }).robots).toBeUndefined()
})

it('las variantes con filtros o paginas siguientes no se indexan pero se siguen', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
  expect(metadatosBarrio(barrio, { indexable: false }).robots).toEqual({ index: false, follow: true })
})

it.each([
  ['sin filtros', { pagina: 1 }, true],
  ['operacion', { pagina: 1, operacion: 'venta' as const }, false],
  ['tipo', { pagina: 1, tipo: 'casa' as const }, false],
  ['precio minimo', { pagina: 1, precioMin: 100 }, false],
  ['precio maximo', { pagina: 1, precioMax: 100 }, false],
  ['pagina 2', { pagina: 2 }, false],
])('catalogoIndexable: %s', (_caso, filtros, esperado) => {
  expect(catalogoIndexable(filtros)).toBe(esperado)
})

it('descripcionCorta colapsa saltos de linea y no corta a mitad de palabra', () => {
  const texto = 'Casa\n\n  amplia   con terraza. ' + 'palabra '.repeat(40)
  const corta = descripcionCorta(texto)
  expect(corta).not.toMatch(/\s{2,}|\n/)
  expect(corta.length).toBeLessThanOrEqual(160)
  expect(corta.endsWith('…')).toBe(true)
  expect(corta.slice(0, -1).endsWith('palabra')).toBe(true)
})

it('descripcionCorta deja intacto un texto corto', () => {
  expect(descripcionCorta('  Una casa en El Prado  ')).toBe('Una casa en El Prado')
})
