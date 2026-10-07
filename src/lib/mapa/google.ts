import 'server-only'
import { createHmac } from 'node:crypto'
import { ALTO_MAPA, ANCHO_MAPA, RADIO_ZONA_METROS, ZOOM_ZONA } from './coordenadas'

/**
 * Mapa de la ZONA aproximada de un inmueble (ficha publica), con Google Maps.
 *
 * Privacidad: el punto exacto nunca sale de la base. zona_aproximada_propiedad()
 * (migracion 20261011000100) devuelve el centro de una celda de 0.005 grados
 * (~550 m) y el mapa dibuja un circulo de RADIO_ZONA_METROS alrededor: el
 * inmueble esta dentro, pero no se puede deducir donde. La direccion exacta
 * sigue llegando solo 2 horas antes de la visita.
 *
 * Es la Maps Static API (una imagen), pedida desde el SERVIDOR por
 * /imagen/zona/[id]: la clave no llega nunca al navegador, la CSP no se abre a
 * Google (la imagen sale de nuestro dominio) y la respuesta se cachea, asi que
 * cada zona se le paga a Google una vez por dia y no una por visita.
 */
/** El mapa solo existe con una clave de Google configurada en el servidor. */
export function mapaDisponible(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY)
}

/** Vertices del circulo (la Static API no tiene circulos: se dibuja un poligono). */
export function puntosDelCirculo(latitud: number, longitud: number, metros = RADIO_ZONA_METROS, lados = 36) {
  const dLat = metros / 111_320
  const dLng = metros / (111_320 * Math.cos((latitud * Math.PI) / 180))
  return Array.from({ length: lados + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / lados
    return `${(latitud + dLat * Math.sin(a)).toFixed(5)},${(longitud + dLng * Math.cos(a)).toFixed(5)}`
  })
}

/**
 * Firma de URL de Google (HMAC-SHA1 de ruta + consulta con el secreto en
 * base64 "url-safe"). Con la firma activada en la consola de Google, una URL
 * con la clave pero sin firma valida no sirve para gastar la cuota.
 */
export function firmarUrl(url: string, secreto: string): string {
  const { pathname, search } = new URL(url)
  const clave = Buffer.from(secreto.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const firma = createHmac('sha1', clave).update(pathname + search).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_')
  return `${url}&signature=${firma}`
}

export function urlMapaEstatico(
  zona: { latitud: number; longitud: number },
  clave: string,
  secreto?: string,
): string {
  const parametros = new URLSearchParams({
    center: `${zona.latitud},${zona.longitud}`,
    zoom: String(ZOOM_ZONA),
    size: `${ANCHO_MAPA}x${ALTO_MAPA}`,
    scale: '2',
    maptype: 'roadmap',
    language: 'es',
    region: 'CO',
    path: `color:0x0B6B5FFF|weight:2|fillcolor:0x0B6B5F33|${puntosDelCirculo(zona.latitud, zona.longitud).join('|')}`,
    key: clave,
  })
  const url = `https://maps.googleapis.com/maps/api/staticmap?${parametros}`
  return secreto ? firmarUrl(url, secreto) : url
}

/** Enlace "Ver la zona en Google Maps": al centro aproximado, nunca al punto. */
export function enlaceGoogleMaps(zona: { latitud: number; longitud: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${zona.latitud}%2C${zona.longitud}`
}
