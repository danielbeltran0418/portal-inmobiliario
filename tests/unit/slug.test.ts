import { describe, it, expect } from 'vitest'
import { generarSlug } from '@/lib/propiedades/slug'

const PATRON = /^[a-z0-9]+(-[a-z0-9]+)*$/

describe('generarSlug', () => {
  it('convierte el titulo en un slug legible con sufijo', () => {
    expect(generarSlug('Casa en El Prado', 'a7f3')).toBe('casa-en-el-prado-a7f3')
  })

  it('quita las tildes y la enye', () => {
    expect(generarSlug('Apartamento con baño y jardín', 'b1c2'))
      .toBe('apartamento-con-bano-y-jardin-b1c2')
  })

  it('dos titulos iguales producen slugs distintos', () => {
    const uno = generarSlug('Casa en El Prado')
    const otro = generarSlug('Casa en El Prado')
    expect(uno).not.toBe(otro)
  })

  it('un titulo sin caracteres utilizables cae en la base propiedad', () => {
    expect(generarSlug('¿!¡---!?', 'c3d4')).toBe('propiedad-c3d4')
  })

  it('recorta sin partir palabras y sin dejar guion antes del sufijo', () => {
    const largo = 'Hermoso apartamento remodelado con vista al mar en el norte de Barranquilla'
    const slug = generarSlug(largo, 'e5f6')
    expect(slug).toMatch(PATRON)
    expect(slug.endsWith('-e5f6')).toBe(true)
    expect(slug.length).toBeLessThanOrEqual(65)
    expect(slug).not.toContain('--')
  })

  it('todo lo que genera cumple el CHECK de la base', () => {
    for (const titulo of ['Casa', '  ', '123 456', 'Ñandú --- Ñandú', 'A'.repeat(200)]) {
      expect(generarSlug(titulo)).toMatch(PATRON)
    }
  })
})
