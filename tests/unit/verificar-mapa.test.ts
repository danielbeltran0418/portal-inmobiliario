import { describe, it, expect, vi } from 'vitest'
import {
  esCentroAproximado,
  parsearArgumentos,
  verificarMapa,
} from '../../scripts/verificar-mapa.mjs'

describe('scripts/verificar-mapa.mjs', () => {
  describe('esCentroAproximado', () => {
    it('detecta centros de celda validos (formula: (v - 0.0025) / 0.005 es entero)', () => {
      // 10.9878 -> 10.9875
      expect(esCentroAproximado(10.9875)).toBe(true)
      // -74.7889 -> -74.7875
      expect(esCentroAproximado(-74.7875)).toBe(true)
      // 0.0025 (k=0)
      expect(esCentroAproximado(0.0025)).toBe(true)
      // 0.0075 (k=1)
      expect(esCentroAproximado(0.0075)).toBe(true)
      // -0.0025 (k=-1)
      expect(esCentroAproximado(-0.0025)).toBe(true)
    })

    it('rechaza coordenadas exactas o que no caen en el centro de celda', () => {
      expect(esCentroAproximado(10.9878)).toBe(false)
      expect(esCentroAproximado(-74.7889)).toBe(false)
      expect(esCentroAproximado(10.0)).toBe(false)
      expect(esCentroAproximado(-74.0)).toBe(false)
    })
  })

  describe('parsearArgumentos', () => {
    it('parsea argumentos con espacios', () => {
      const argv = [
        'node',
        'scripts/verificar-mapa.mjs',
        '--base',
        'https://ejemplo.com',
        '--id',
        'uuid-1234',
        '--ficha',
        '/el-prado/casa-slug',
        '--exacta',
        '10.9878,-74.7889',
      ]
      const res = parsearArgumentos(argv)
      expect(res).toEqual({
        base: 'https://ejemplo.com',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        exacta: '10.9878,-74.7889',
      })
    })

    it('parsea argumentos con signo igual', () => {
      const argv = [
        'node',
        'scripts/verificar-mapa.mjs',
        '--base=https://ejemplo.com',
        '--id=uuid-1234',
        '--ficha=/el-prado/casa-slug',
      ]
      const res = parsearArgumentos(argv)
      expect(res).toEqual({
        base: 'https://ejemplo.com',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
      })
    })
  })

  describe('verificarMapa', () => {
    const loggerMock = { ...console, log: vi.fn(), error: vi.fn(), warn: vi.fn() } as Console

    const HTML_VALIDO = `
      <!DOCTYPE html>
      <html>
        <body>
          <div class="ficha">
            <h1>Hermosa casa en El Prado</h1>
            <figure>
              <img src="/imagen/zona/uuid-1234" alt="Mapa de la zona aproximada" width="600" height="300" />
              <figcaption>
                <span>Zona aproximada en El Prado</span>
                <a href="https://www.google.com/maps/search/?api=1&query=10.9875%2C-74.7875" target="_blank">
                  Ver la zona en Google Maps
                </a>
              </figcaption>
            </figure>
          </div>
        </body>
      </html>
    `

    it('pasa exitosamente cuando todas las condiciones se cumplen', async () => {
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/uuid-1234')) {
          return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
            },
          })
        }
        if (urlStr.includes('/el-prado/casa-slug')) {
          return new Response(HTML_VALIDO, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        }
        return new Response('Not found', { status: 404 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        exacta: '10.9878,-74.7889',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(true)
      expect(resultado.resultados).toHaveLength(4)
      expect(resultado.resultados.every((r) => r.estado === 'PASS')).toBe(true)
    })

    it('reporta FAIL y explica causa en error 404 de /imagen/zona', async () => {
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/')) {
          return new Response(null, { status: 404 })
        }
        return new Response(HTML_VALIDO, { status: 200 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-invalido',
        ficha: '/el-prado/casa-slug',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      const pasoZona = resultado.resultados.find((r) => r.paso === 'imagen-zona')
      expect(pasoZona?.estado).toBe('FAIL')
      expect(pasoZona?.httpStatus).toBe(404)
      expect(pasoZona?.detalle).toContain('sin GOOGLE_MAPS_API_KEY o sin zona')
    })

    it('reporta FAIL y explica causa en error 502 de /imagen/zona (Google rechazo)', async () => {
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/')) {
          return new Response(null, { status: 502 })
        }
        return new Response(HTML_VALIDO, { status: 200 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      const pasoZona = resultado.resultados.find((r) => r.paso === 'imagen-zona')
      expect(pasoZona?.estado).toBe('FAIL')
      expect(pasoZona?.httpStatus).toBe(502)
      expect(pasoZona?.detalle).toMatch(/Google rechaz[oó] la petici[oó]n a Static Maps/)
    })

    it('reporta FAIL y explica causa en error 503 de /imagen/zona (RPC fallando)', async () => {
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/')) {
          return new Response(null, { status: 503 })
        }
        return new Response(HTML_VALIDO, { status: 200 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      const pasoZona = resultado.resultados.find((r) => r.paso === 'imagen-zona')
      expect(pasoZona?.estado).toBe('FAIL')
      expect(pasoZona?.httpStatus).toBe(503)
      expect(pasoZona?.detalle).toContain('error en la llamada RPC zona_aproximada_propiedad')
    })

    it('reporta FAIL si /imagen/zona responde 200 con cabeceras invalidas', async () => {
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/')) {
          return new Response('no image', {
            status: 200,
            headers: {
              'Content-Type': 'text/plain',
              'Cache-Control': 'no-cache',
            },
          })
        }
        return new Response(HTML_VALIDO, { status: 200 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      const pasoZona = resultado.resultados.find((r) => r.paso === 'imagen-zona')
      expect(pasoZona?.estado).toBe('FAIL')
      expect(pasoZona?.detalle).toMatch(/cabeceras inv[aá]lidas/)
    })

    it('reporta FAIL si la ficha no responde 200', async () => {
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/')) {
          return new Response(new Uint8Array([1]), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }
        return new Response('Not found', { status: 404 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/inexistente',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      const pasoFicha = resultado.resultados.find((r) => r.paso === 'ficha-publica')
      expect(pasoFicha?.estado).toBe('FAIL')
      expect(pasoFicha?.httpStatus).toBe(404)
    })

    it('reporta FAIL si la ficha no contiene <img ... src="/imagen/zona/{id}">', async () => {
      const htmlSinImg = `<html><body><a href="https://maps.google.com/?query=10.9875,-74.7875">Ver la zona en Google Maps</a></body></html>`
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/')) {
          return new Response(new Uint8Array([1]), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }
        return new Response(htmlSinImg, { status: 200 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      const pasoImg = resultado.resultados.find((r) => r.paso === 'ficha-img')
      expect(pasoImg?.estado).toBe('FAIL')
      expect(pasoImg?.detalle).toContain('NO contiene <img ... src="/imagen/zona/uuid-1234">')
    })

    it('reporta FAIL si las coordenadas del enlace a Google Maps no son un centro aproximado', async () => {
      const htmlCoordenadasExactas = `
        <html><body>
          <img src="/imagen/zona/uuid-1234" />
          <a href="https://www.google.com/maps/search/?api=1&query=10.9878%2C-74.7889">Ver la zona en Google Maps</a>
        </body></html>
      `
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/')) {
          return new Response(new Uint8Array([1]), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }
        return new Response(htmlCoordenadasExactas, { status: 200 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      const pasoEnlace = resultado.resultados.find((r) => r.paso === 'ficha-enlace-maps')
      expect(pasoEnlace?.estado).toBe('FAIL')
      expect(pasoEnlace?.detalle).toContain('Las coordenadas no son centro aproximado')
    })

    it('reporta FAIL si --exacta esta presente y la ficha expone esas coordenadas exactas', async () => {
      const htmlConFuga = `
        <html><body>
          <img src="/imagen/zona/uuid-1234" />
          <a href="https://www.google.com/maps/search/?api=1&query=10.9875%2C-74.7875">Ver la zona en Google Maps</a>
          <!-- Fuga accidental en script RSC o atributo -->
          <script>{"coordenadasExactas":{"lat":10.9878,"lng":-74.7889}}</script>
        </body></html>
      `
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/')) {
          return new Response(new Uint8Array([1]), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }
        return new Response(htmlConFuga, { status: 200 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        exacta: '10.9878,-74.7889',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      const pasoPrivacidad = resultado.resultados.find((r) => r.paso === 'privacidad-exacta')
      expect(pasoPrivacidad?.estado).toBe('FAIL')
      expect(pasoPrivacidad?.detalle).toContain('La ficha expone las coordenadas exactas configuradas')
    })

    it('reporta FAIL ante error de red en fetch', async () => {
      const fetchFn = vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      expect(resultado.resultados.some((r) => r.detalle.includes('ECONNREFUSED'))).toBe(true)
    })

    it('reporta FAIL en ficha-img si la ruta aparece solo como texto plano sin etiqueta img src', async () => {
      const htmlConTextoPlano = `
        <html><body>
          <p>Ruta: /imagen/zona/uuid-1234</p>
          <a href="https://www.google.com/maps/search/?api=1&query=10.9875%2C-74.7875">Ver la zona en Google Maps</a>
        </body></html>
      `
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/')) {
          return new Response(new Uint8Array([1]), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }
        return new Response(htmlConTextoPlano, { status: 200 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      const pasoImg = resultado.resultados.find((r) => r.paso === 'ficha-img')
      expect(pasoImg?.estado).toBe('FAIL')
      expect(pasoImg?.detalle).toContain('NO contiene <img ... src="/imagen/zona/uuid-1234">')
    })

    it('reporta FAIL en privacidad-exacta si --exacta esta presente pero la ficha no tiene imagen de mapa', async () => {
      const htmlSinMapa = `
        <html><body>
          <a href="https://www.google.com/maps/search/?api=1&query=10.9875%2C-74.7875">Ver la zona en Google Maps</a>
        </body></html>
      `
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/')) {
          return new Response(new Uint8Array([1]), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }
        return new Response(htmlSinMapa, { status: 200 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        exacta: '10.9878,-74.7889',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      const pasoPrivacidad = resultado.resultados.find((r) => r.paso === 'privacidad-exacta')
      expect(pasoPrivacidad?.estado).toBe('FAIL')
      expect(pasoPrivacidad?.detalle).toContain('La ficha no tiene imagen de mapa; no se puede validar la privacidad del mapa')
    })

    it('reporta FAIL en privacidad-exacta si la URL de la imagen del mapa contiene las coordenadas exactas', async () => {
      const htmlConImgExacta = `
        <html><body>
          <img src="/imagen/zona/uuid-1234?center=10.9878,-74.7889" />
          <a href="https://www.google.com/maps/search/?api=1&query=10.9875%2C-74.7875">Ver la zona en Google Maps</a>
        </body></html>
      `
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/')) {
          return new Response(new Uint8Array([1]), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }
        return new Response(htmlConImgExacta, { status: 200 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        exacta: '10.9878,-74.7889',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      const pasoPrivacidad = resultado.resultados.find((r) => r.paso === 'privacidad-exacta')
      expect(pasoPrivacidad?.estado).toBe('FAIL')
      expect(pasoPrivacidad?.detalle).toContain('La URL de la imagen del mapa contiene las coordenadas exactas')
    })

    it('reporta FAIL en privacidad-exacta si la URL de la imagen contiene la clave de Google Maps', async () => {
      const htmlConClaveEnImg = `
        <html><body>
          <img src="/imagen/zona/uuid-1234?key=AIzaSyDUMMYTESTKEY000000000000000000" />
          <a href="https://www.google.com/maps/search/?api=1&query=10.9875%2C-74.7875">Ver la zona en Google Maps</a>
        </body></html>
      `
      const fetchFn = vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url)
        if (urlStr.includes('/imagen/zona/')) {
          return new Response(new Uint8Array([1]), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }
        return new Response(htmlConClaveEnImg, { status: 200 })
      })

      const resultado = await verificarMapa({
        base: 'https://portal.test',
        id: 'uuid-1234',
        ficha: '/el-prado/casa-slug',
        exacta: '10.9878,-74.7889',
        fetchFn: fetchFn as unknown as typeof fetch,
        logger: loggerMock,
      })

      expect(resultado.ok).toBe(false)
      const pasoPrivacidad = resultado.resultados.find((r) => r.paso === 'privacidad-exacta')
      expect(pasoPrivacidad?.estado).toBe('FAIL')
      expect(pasoPrivacidad?.detalle).toContain('La URL de la imagen del mapa contiene la clave de API de Google')
    })
  })
})
