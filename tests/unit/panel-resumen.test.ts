import { describe, expect, it } from 'vitest'
import { contarPorEstado, filasDelPanel, type PropiedadCruda } from '@/lib/propiedades/panel'

const base: PropiedadCruda = {
  id: 'p', titulo: 'Casa', estado: 'publicada', precio: 100, barrio_id: 'b', descripcion: 'd',
  imagenes_propiedad: [],
}

describe('resumen del panel por estado (diseño de Figma Make)', () => {
  it('cuenta publicadas, borradores, pausadas y vendidas', () => {
    const filas = filasDelPanel([
      { ...base, id: '1', estado: 'publicada' },
      { ...base, id: '2', estado: 'publicada' },
      { ...base, id: '3', estado: 'borrador' },
      { ...base, id: '4', estado: 'pausada' },
      { ...base, id: '5', estado: 'rechazada' },
    ])
    expect(contarPorEstado(filas)).toEqual({ publicadas: 2, borradores: 1, pausadas: 1, vendidas: 0 })
  })

  it('sin propiedades todo es cero', () => {
    expect(contarPorEstado([])).toEqual({ publicadas: 0, borradores: 0, pausadas: 0, vendidas: 0 })
  })
})

describe('miniatura de cada fila', () => {
  it('una publicada usa su primera foto por orden', () => {
    const [fila] = filasDelPanel([
      { ...base, imagenes_propiedad: [{ id: 'img-b', orden: 1 }, { id: 'img-a', orden: 0 }] },
    ])
    expect(fila!.portadaId).toBe('img-a')
  })

  it('una no publicada no tiene miniatura: /imagen solo sirve fotos de anuncios publicados', () => {
    const [fila] = filasDelPanel([
      { ...base, estado: 'borrador', imagenes_propiedad: [{ id: 'img-a', orden: 0 }] },
    ])
    expect(fila!.portadaId).toBeNull()
  })

  it('sin fotos tampoco', () => {
    expect(filasDelPanel([base])[0]!.portadaId).toBeNull()
  })
})
