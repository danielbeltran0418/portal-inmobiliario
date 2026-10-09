#!/usr/bin/env node
/**
 * Script de verificación del mapa de zona aproximada (Google Maps).
 *
 * Uso:
 *   node scripts/verificar-mapa.mjs --base https://<dominio> --id <uuid> --ficha /<barrio>/<slug> [--exacta "lat,lng"]
 *
 * Comprobaciones:
 *   a) GET {base}/imagen/zona/{id} -> 200, Content-Type image/png y Cache-Control que contenga "public, max-age=86400"
 *      (si da 404/502/503, explica la causa según la documentación).
 *   b) GET {base}{ficha} -> 200, contiene <img ... src="/imagen/zona/{id}"> y un enlace
 *      "Ver la zona en Google Maps" cuyo query lat,lng sea un centro aproximado: ((valor - 0.0025) / 0.005) entero con tolerancia 1e-6.
 *   c) Si se pasa --exacta, la ficha debe tener imagen de mapa y NO debe contener esas coordenadas exactas ni la clave de Google en ninguna forma.
 */

import { fileURLToPath } from 'node:url'

export function esCentroAproximado(valor, tolerancia = 1e-6) {
  const k = (valor - 0.0025) / 0.005
  return Math.abs(k - Math.round(k)) <= tolerancia
}

export function parsearArgumentos(argv) {
  const params = {}
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const igualIdx = arg.indexOf('=')
      if (igualIdx !== -1) {
        params[arg.slice(2, igualIdx)] = arg.slice(igualIdx + 1)
      } else {
        const clave = arg.slice(2)
        const valor = argv[i + 1]
        if (valor && !valor.startsWith('--')) {
          params[clave] = valor
          i++
        } else {
          params[clave] = true
        }
      }
    }
  }
  return params
}

/**
 * @param {{
 *   base: string,
 *   id: string,
 *   ficha: string,
 *   exacta?: string,
 *   fetchFn?: typeof fetch,
 *   logger?: Console
 * }} opciones
 */
export async function verificarMapa({
  base,
  id,
  ficha,
  exacta,
  fetchFn = globalThis.fetch,
  logger = console,
}) {
  const resultados = []
  let okGlobal = true

  const urlBase = (base || '').replace(/\/+$/, '')
  const fichaNormalizada = (ficha || '').startsWith('/') ? ficha : `/${ficha || ''}`

  // --------------------------------------------------------------------------
  // Paso a: GET {base}/imagen/zona/{id}
  // --------------------------------------------------------------------------
  const urlZona = `${urlBase}/imagen/zona/${id}`
  let resZona = null
  let errorZona = null

  try {
    resZona = await fetchFn(urlZona)
  } catch (err) {
    errorZona = err
  }

  if (errorZona) {
    okGlobal = false
    resultados.push({
      paso: 'imagen-zona',
      estado: 'FAIL',
      detalle: `Error de red al conectar con ${urlZona}: ${errorZona.message}`,
    })
  } else {
    const statusZona = resZona.status
    const contentType = resZona.headers.get('content-type') || ''
    const cacheControl = resZona.headers.get('cache-control') || ''

    if (statusZona === 200) {
      const esPng = contentType.toLowerCase().includes('image/png')
      const tieneCache = cacheControl.includes('public, max-age=86400')

      if (esPng && tieneCache) {
        resultados.push({
          paso: 'imagen-zona',
          estado: 'PASS',
          httpStatus: statusZona,
          detalle: `GET ${urlZona} -> 200 OK (Content-Type: ${contentType}, Cache-Control: ${cacheControl})`,
        })
      } else {
        okGlobal = false
        const fallas = []
        if (!esPng) fallas.push(`Content-Type esperado 'image/png', recibido '${contentType}'`)
        if (!tieneCache) fallas.push(`Cache-Control esperado 'public, max-age=86400', recibido '${cacheControl}'`)
        resultados.push({
          paso: 'imagen-zona',
          estado: 'FAIL',
          httpStatus: statusZona,
          detalle: `GET ${urlZona} -> 200 OK pero cabeceras inválidas: ${fallas.join('; ')}`,
        })
      }
    } else {
      okGlobal = false
      let causa = ''
      if (statusZona === 404) {
        causa = '404 Not Found (UUID inválido, sin GOOGLE_MAPS_API_KEY o sin zona por propiedad no publicada / sin coordenadas)'
      } else if (statusZona === 502) {
        causa = '502 Bad Gateway (Google rechazó la petición a Static Maps o falló la comunicación)'
      } else if (statusZona === 503) {
        causa = '503 Service Unavailable (error en la llamada RPC zona_aproximada_propiedad)'
      } else {
        causa = `${statusZona} (error inesperado al consultar imagen de zona)`
      }

      resultados.push({
        paso: 'imagen-zona',
        estado: 'FAIL',
        httpStatus: statusZona,
        detalle: `GET ${urlZona} -> ${causa}`,
      })
    }
  }

  // --------------------------------------------------------------------------
  // Paso b: GET {base}{ficha}
  // --------------------------------------------------------------------------
  const urlFicha = `${urlBase}${fichaNormalizada}`
  let resFicha = null
  let errorFicha = null

  try {
    resFicha = await fetchFn(urlFicha)
  } catch (err) {
    errorFicha = err
  }

  if (errorFicha) {
    okGlobal = false
    resultados.push({
      paso: 'ficha-publica',
      estado: 'FAIL',
      detalle: `Error de red al conectar con ${urlFicha}: ${errorFicha.message}`,
    })
  } else if (resFicha.status !== 200) {
    okGlobal = false
    resultados.push({
      paso: 'ficha-publica',
      estado: 'FAIL',
      httpStatus: resFicha.status,
      detalle: `GET ${urlFicha} -> ${resFicha.status} (se esperaba 200 OK para la ficha)`,
    })
  } else {
    const html = await resFicha.text()

    // 1. Parsear todas las etiquetas <img> y extraer sus atributos src
    const imgTags = Array.from(html.matchAll(/<img\b([^>]*)>/gi)).map((m) => {
      const srcMatch = m[1].match(/\bsrc=["']([^"']*)["']/i)
      return { tag: m[0], src: srcMatch ? srcMatch[1] : '' }
    })

    // Localizar la imagen de mapa correspondiente a /imagen/zona/{id}
    const imgMapa = imgTags.find((img) => img.src === `/imagen/zona/${id}` || img.src.includes(`/imagen/zona/${id}`))
    const srcImgMapa = imgMapa ? imgMapa.src : null

    if (!srcImgMapa) {
      okGlobal = false
      resultados.push({
        paso: 'ficha-img',
        estado: 'FAIL',
        httpStatus: 200,
        detalle: `GET ${urlFicha} -> 200 OK, pero NO contiene <img ... src="/imagen/zona/${id}">`,
      })
    } else {
      resultados.push({
        paso: 'ficha-img',
        estado: 'PASS',
        httpStatus: 200,
        detalle: `GET ${urlFicha} -> contiene <img ... src="${srcImgMapa}">`,
      })
    }

    // 2. Verificar enlace "Ver la zona en Google Maps" con query lat,lng centro aproximado
    const enlaceRegex = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>[\s\S]*?Ver la zona en Google Maps[\s\S]*?<\/a>/i
    const matchEnlace = html.match(enlaceRegex)

    if (!matchEnlace) {
      okGlobal = false
      resultados.push({
        paso: 'ficha-enlace-maps',
        estado: 'FAIL',
        httpStatus: 200,
        detalle: `GET ${urlFicha} -> NO contiene el enlace 'Ver la zona en Google Maps'`,
      })
    } else {
      const href = matchEnlace[1]
      let lat = null
      let lng = null

      try {
        const u = new URL(href, 'https://www.google.com')
        const query = u.searchParams.get('query')
        if (query) {
          const partes = query.split(',').map((s) => s.trim())
          if (partes.length === 2) {
            lat = parseFloat(partes[0])
            lng = parseFloat(partes[1])
          }
        }
      } catch {
        const qMatch = href.match(/[?&]query=([^&"']+)/)
        if (qMatch) {
          const dec = decodeURIComponent(qMatch[1])
          const partes = dec.split(',').map((s) => s.trim())
          if (partes.length === 2) {
            lat = parseFloat(partes[0])
            lng = parseFloat(partes[1])
          }
        }
      }

      if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
        okGlobal = false
        resultados.push({
          paso: 'ficha-enlace-maps',
          estado: 'FAIL',
          httpStatus: 200,
          detalle: `El enlace 'Ver la zona en Google Maps' no contiene coordenadas lat,lng válidas: ${href}`,
        })
      } else {
        const latAprox = esCentroAproximado(lat)
        const lngAprox = esCentroAproximado(lng)

        if (latAprox && lngAprox) {
          resultados.push({
            paso: 'ficha-enlace-maps',
            estado: 'PASS',
            httpStatus: 200,
            detalle: `Enlace Google Maps válido con centro aproximado: lat=${lat}, lng=${lng}`,
          })
        } else {
          okGlobal = false
          resultados.push({
            paso: 'ficha-enlace-maps',
            estado: 'FAIL',
            httpStatus: 200,
            detalle: `Las coordenadas no son centro aproximado (fórmula ((v - 0.0025) / 0.005) entero): lat=${lat} (${latAprox ? 'OK' : 'FAIL'}), lng=${lng} (${lngAprox ? 'OK' : 'FAIL'})`,
          })
        }
      }
    }

    // ------------------------------------------------------------------------
    // Paso c: Si se pasa --exacta, comprobar privacidad
    // ------------------------------------------------------------------------
    if (exacta) {
      if (!srcImgMapa) {
        okGlobal = false
        resultados.push({
          paso: 'privacidad-exacta',
          estado: 'FAIL',
          httpStatus: 200,
          detalle: 'La ficha no tiene imagen de mapa; no se puede validar la privacidad del mapa',
        })
      } else {
        const partesExacta = exacta.split(',').map((s) => s.trim())
        const latExacta = partesExacta[0]
        const lngExacta = partesExacta[1]

        const imgContieneExacta = imgTags.some((img) => (
          (exacta && img.src.includes(exacta)) ||
          (latExacta && lngExacta && img.src.includes(`${latExacta}%2C${lngExacta}`)) ||
          (latExacta && img.src.includes(latExacta)) ||
          (lngExacta && img.src.includes(lngExacta))
        ))

        const imgContieneClaveGoogle = imgTags.some((img) => (
          /[?&]key=AIza|AIza[0-9A-Za-z-_]{35}/i.test(img.src) ||
          /[?&]key=[^&"'\s]+/i.test(img.src)
        ))

        const exponeLat = latExacta && html.includes(latExacta)
        const exponeLng = lngExacta && html.includes(lngExacta)
        const exponePar = html.includes(exacta) || (latExacta && lngExacta && html.includes(`${latExacta}%2C${lngExacta}`))

        if (imgContieneExacta) {
          okGlobal = false
          resultados.push({
            paso: 'privacidad-exacta',
            estado: 'FAIL',
            httpStatus: 200,
            detalle: `La URL de la imagen del mapa contiene las coordenadas exactas (${exacta})`,
          })
        } else if (imgContieneClaveGoogle) {
          okGlobal = false
          resultados.push({
            paso: 'privacidad-exacta',
            estado: 'FAIL',
            httpStatus: 200,
            detalle: 'La URL de la imagen del mapa contiene la clave de API de Google',
          })
        } else if (exponeLat || exponeLng || exponePar) {
          okGlobal = false
          resultados.push({
            paso: 'privacidad-exacta',
            estado: 'FAIL',
            httpStatus: 200,
            detalle: `La ficha expone las coordenadas exactas configuradas (${exacta}) en el HTML servido`,
          })
        } else {
          resultados.push({
            paso: 'privacidad-exacta',
            estado: 'PASS',
            httpStatus: 200,
            detalle: `La ficha no contiene las coordenadas exactas (${exacta}) en ninguna forma`,
          })
        }
      }
    }
  }

  // Reportar en logger
  logger.log('--- REPORTE VERIFICACION MAPA ---')
  for (const r of resultados) {
    const estadoStr = r.estado === 'PASS' ? '[PASS]' : '[FAIL]'
    const httpStr = r.httpStatus ? ` [HTTP ${r.httpStatus}]` : ''
    logger.log(`${estadoStr}${httpStr} (${r.paso}): ${r.detalle}`)
  }
  logger.log(`Resultado final: ${okGlobal ? 'TODAS LAS PRUEBAS SUPERADAS' : 'FALLOS ENCONTRADOS'}`)

  return { ok: okGlobal, resultados }
}

// Ejecución como CLI directo
const archivoActual = fileURLToPath(import.meta.url)
if (process.argv[1] === archivoActual) {
  const params = parsearArgumentos(process.argv)
  if (!params.base || !params.id || !params.ficha) {
    console.error('Uso: node scripts/verificar-mapa.mjs --base https://<dominio> --id <uuid> --ficha /<barrio>/<slug> [--exacta "lat,lng"]')
    console.error('Ejemplo:')
    console.error('  node scripts/verificar-mapa.mjs --base https://portal-inmobiliario-alpha.vercel.app --id 00000000-0000-0000-0000-000000000000 --ficha /el-prado/casa-linda-123 --exacta "10.9878,-74.7889"')
    process.exit(1)
  }

  verificarMapa(params).then(({ ok }) => {
    process.exit(ok ? 0 : 1)
  }).catch((err) => {
    console.error('Error fatal al ejecutar verificación:', err)
    process.exit(1)
  })
}
