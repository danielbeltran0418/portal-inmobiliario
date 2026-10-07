import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { leerCoordenadas, teselasDeZona, urlTesela, RADIO_ZONA_METROS } from '@/lib/mapa/zona'
import { MapaZona } from '@/components/mapa-zona'

describe('leerCoordenadas (lo que pega el vendedor)', () => {
  it.each([
    ['10.9878, -74.7889', { latitud: 10.9878, longitud: -74.7889 }],
    ['  4.6097,-74.0817 ', { latitud: 4.6097, longitud: -74.0817 }],
    ['6.2442 -75.5812', { latitud: 6.2442, longitud: -75.5812 }],
  ])('acepta %s', (texto, esperado) => {
    expect(leerCoordenadas(texto)).toEqual(esperado)
  })

  it.each(['', 'Calle 72 # 50-20', '10.98', '200, 10', '40.4168, -3.7038', 'NaN, NaN'])(
    'rechaza %j (vacio, texto, incompleto o fuera de Colombia)',
    (texto) => {
      expect(leerCoordenadas(texto)).toBeNull()
    },
  )
})

describe('teselasDeZona', () => {
  const zona = teselasDeZona(10.9875, -74.7875, 15)

  it('cubre el ancho del recuadro con teselas de 256 px alrededor del centro', () => {
    expect(zona.teselas.length).toBeGreaterThanOrEqual(8)
    for (const t of zona.teselas) {
      expect(Number.isInteger(t.x) && Number.isInteger(t.y)).toBe(true)
      expect(Math.abs(t.dx)).toBeLessThanOrEqual(512 + 256)
    }
    // Alguna tesela contiene el centro: dx <= 0 < dx + 256.
    expect(zona.teselas.some((t) => t.dx <= 0 && t.dx + 256 > 0 && t.dy <= 0 && t.dy + 256 > 0)).toBe(true)
  })

  it('el radio en pixeles corresponde a los metros del circulo a ese zoom y latitud', () => {
    // ~4.69 m/px a zoom 15 en latitud 11.
    expect(zona.radioPx).toBeGreaterThan(RADIO_ZONA_METROS / 5)
    expect(zona.radioPx).toBeLessThan(RADIO_ZONA_METROS / 4.4)
  })

  it('arma la URL de cada tesela con la plantilla configurada', () => {
    expect(urlTesela('https://t.example/{z}/{x}/{y}.png', { x: 1, y: 2 }, 15)).toBe('https://t.example/15/1/2.png')
  })
})

describe('MapaZona', () => {
  const html = renderToStaticMarkup(createElement(MapaZona, { latitud: 10.9875, longitud: -74.7875, barrio: 'El Prado' }))

  it('es una figura accesible con su descripcion y la atribucion de OpenStreetMap', () => {
    expect(html).toMatch(/<figure[^>]*>/)
    expect(html).toMatch(/role="img"[^>]*aria-label="Mapa de la zona aproximada del inmueble en El Prado"/)
    expect(html).toContain('OpenStreetMap')
    expect(html).toMatch(/zona aproximada/i)
  })

  it('las teselas son decorativas y cargan diferido', () => {
    expect(html).toMatch(/<img[^>]*alt=""[^>]*loading="lazy"|<img[^>]*loading="lazy"[^>]*alt=""/)
  })
})
