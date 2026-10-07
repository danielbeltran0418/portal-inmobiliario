import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHmac } from 'node:crypto'

vi.mock('server-only', () => ({}))
const zonaRpc = vi.fn()
vi.mock('@/lib/supabase/cliente-publico', () => ({ crearClientePublico: () => ({ rpc: zonaRpc }) }))

const { leerCoordenadas, RADIO_ZONA_METROS } = await import('@/lib/mapa/coordenadas')
const { urlMapaEstatico, firmarUrl, puntosDelCirculo, enlaceGoogleMaps, mapaDisponible } = await import('@/lib/mapa/google')
const { MapaZona } = await import('@/components/mapa-zona')
const { GET } = await import('@/app/imagen/zona/[id]/route')

const ZONA = { latitud: 10.9875, longitud: -74.8125 }
const ID = '11111111-1111-4111-8111-111111111111'

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

describe('Google Maps Static API', () => {
  it('el circulo cierra y sus vertices quedan a ~500 m del centro', () => {
    const puntos = puntosDelCirculo(ZONA.latitud, ZONA.longitud)
    expect(puntos[0]).toBe(puntos.at(-1))
    for (const p of puntos) {
      const [lat, lng] = p.split(',').map(Number) as [number, number]
      const metros = Math.hypot((lat - ZONA.latitud) * 111_320, (lng - ZONA.longitud) * 111_320 * Math.cos(ZONA.latitud * Math.PI / 180))
      expect(Math.abs(metros - RADIO_ZONA_METROS)).toBeLessThan(5)
    }
  })

  it('la URL centra en la zona aproximada, en español, con el poligono y la clave', () => {
    const url = new URL(urlMapaEstatico(ZONA, 'CLAVE'))
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/staticmap')
    expect(url.searchParams.get('center')).toBe('10.9875,-74.8125')
    expect(url.searchParams.get('language')).toBe('es')
    expect(url.searchParams.get('path')).toMatch(/^color:0x0B6B5FFF\|weight:2\|fillcolor:0x0B6B5F33\|/)
    expect(url.searchParams.get('key')).toBe('CLAVE')
    expect(url.searchParams.has('signature')).toBe(false)
  })

  it('con secreto firma la URL como pide Google (HMAC-SHA1 de ruta y consulta)', () => {
    const secreto = Buffer.from('secreto-de-prueba').toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    const sinFirma = 'https://maps.googleapis.com/maps/api/staticmap?center=1,2&key=K'
    const esperada = createHmac('sha1', Buffer.from('secreto-de-prueba'))
      .update('/maps/api/staticmap?center=1,2&key=K').digest('base64').replace(/\+/g, '-').replace(/\//g, '_')
    expect(firmarUrl(sinFirma, secreto)).toBe(`${sinFirma}&signature=${esperada}`)
  })

  it('el enlace a Google Maps apunta al centro aproximado', () => {
    expect(enlaceGoogleMaps(ZONA)).toBe('https://www.google.com/maps/search/?api=1&query=10.9875%2C-74.8125')
  })
})

describe('MapaZona', () => {
  const html = renderToStaticMarkup(createElement(MapaZona, { propiedadId: ID, zona: ZONA, barrio: 'El Prado' }))

  it('la imagen sale de nuestro dominio, con descripcion y carga diferida', () => {
    expect(html).toContain(`src="/imagen/zona/${ID}"`)
    expect(html).toContain('alt="Mapa de la zona aproximada del inmueble en El Prado"')
    expect(html).toContain('loading="lazy"')
    expect(html).not.toContain('key=')
  })

  it('ofrece abrir la zona en Google Maps en otra pestaña', () => {
    expect(html).toMatch(/href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=10\.9875%2C-74\.8125"/)
    expect(html).toContain('rel="noopener noreferrer"')
  })
})

describe('GET /imagen/zona/[id]', () => {
  const pedir = (id = ID) => GET(new Request(`http://localhost/imagen/zona/${id}`), { params: Promise.resolve({ id }) })

  beforeEach(() => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'CLAVE-SERVIDOR')
    zonaRpc.mockReset().mockResolvedValue({ data: [ZONA], error: null })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('pide la imagen a Google desde el servidor y la sirve cacheada un dia', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await pedir()
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('image/png')
    expect(r.headers.get('cache-control')).toMatch(/public, max-age=86400/)
    expect(String(fetchMock.mock.calls[0]![0])).toContain('key=CLAVE-SERVIDOR')
    expect(zonaRpc).toHaveBeenCalledWith('zona_aproximada_propiedad', { p_propiedad_id: ID })
  })

  it('sin clave configurada no hay mapa', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '')
    expect(mapaDisponible()).toBe(false)
    expect((await pedir()).status).toBe(404)
  })

  it('sin zona (no publicada o sin coordenadas) es 404 y no gasta una peticion a Google', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    zonaRpc.mockResolvedValue({ data: [], error: null })
    expect((await pedir()).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un id que no es uuid no consulta nada', async () => {
    expect((await pedir('../../etc')).status).toBe(404)
    expect(zonaRpc).not.toHaveBeenCalled()
  })

  it('si Google falla no reenvia su cuerpo (puede traer la clave)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error key=CLAVE-SERVIDOR', { status: 403, headers: { 'content-type': 'text/html' } })))
    const r = await pedir()
    expect(r.status).toBe(502)
    expect(await r.text()).toBe('')
  })
})
