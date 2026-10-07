/**
 * Mapa de la ZONA aproximada de un inmueble (ficha publica).
 *
 * Privacidad: el punto exacto nunca sale de la base. zona_aproximada_propiedad()
 * (migracion 20261011000100) devuelve el centro de una celda de 0.005 grados
 * (~550 m) y la ficha pinta un circulo de RADIO_ZONA_METROS alrededor: el
 * inmueble esta dentro, pero no se puede deducir donde. La direccion exacta
 * sigue llegando solo 2 horas antes de la visita.
 *
 * Sin libreria de mapas ni JavaScript en el cliente: el mapa es estatico,
 * teselas de 256 px colocadas alrededor del centro y un circulo encima.
 */
export const RADIO_ZONA_METROS = 500
export const ZOOM_ZONA = 15
const LADO = 256

/** Recuadro cubierto: hasta 1024 px de ancho (cualquier pantalla) y este alto. */
export const ALTO_MAPA = 260
const MEDIO_ANCHO = 512

/**
 * Plantilla de teselas. Por defecto OpenStreetMap, cuya politica de uso no
 * admite trafico alto: para produccion a escala nacional, configurar un
 * proveedor (MapTiler, Stadia, Carto...) en NEXT_PUBLIC_MAPA_TESELAS. La CSP
 * (src/lib/seguridad/cabeceras.ts) autoriza el origen de esta misma plantilla.
 */
export const PLANTILLA_TESELAS =
  process.env.NEXT_PUBLIC_MAPA_TESELAS || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export const ATRIBUCION_MAPA =
  process.env.NEXT_PUBLIC_MAPA_ATRIBUCION || '© colaboradores de OpenStreetMap'

/** Colombia continental e insular (San Andres), con margen. */
const LIMITES = { latMin: -4.3, latMax: 13.6, lngMin: -82, lngMax: -66.8 }

/**
 * "10.98, -74.81" (lo que copia Google Maps al tocar un punto) a numeros.
 * null si no son dos numeros o caen fuera de Colombia: un punto en otro pais
 * es casi siempre latitud y longitud invertidas o mal pegadas.
 */
export function leerCoordenadas(texto: string): { latitud: number; longitud: number } | null {
  const partes = texto.trim().split(/[\s,;]+/).filter(Boolean)
  if (partes.length !== 2) return null
  const [latitud, longitud] = partes.map(Number) as [number, number]
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return null
  if (latitud < LIMITES.latMin || latitud > LIMITES.latMax) return null
  if (longitud < LIMITES.lngMin || longitud > LIMITES.lngMax) return null
  return { latitud, longitud }
}

export interface Tesela {
  x: number
  y: number
  /** Desplazamiento en px de su esquina superior izquierda respecto al centro. */
  dx: number
  dy: number
}

export function teselasDeZona(latitud: number, longitud: number, zoom = ZOOM_ZONA) {
  const n = 2 ** zoom
  const rad = (latitud * Math.PI) / 180
  // Centro en pixeles globales (proyeccion Web Mercator).
  const cx = ((longitud + 180) / 360) * n * LADO
  const cy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n * LADO

  const teselas: Tesela[] = []
  for (let x = Math.floor((cx - MEDIO_ANCHO) / LADO); x <= Math.floor((cx + MEDIO_ANCHO) / LADO); x++) {
    for (let y = Math.floor((cy - ALTO_MAPA / 2) / LADO); y <= Math.floor((cy + ALTO_MAPA / 2) / LADO); y++) {
      teselas.push({ x: ((x % n) + n) % n, y, dx: Math.round(x * LADO - cx), dy: Math.round(y * LADO - cy) })
    }
  }

  const metrosPorPx = (156543.03392 * Math.cos(rad)) / n
  return { teselas, radioPx: Math.round(RADIO_ZONA_METROS / metrosPorPx) }
}

export function urlTesela(plantilla: string, t: Pick<Tesela, 'x' | 'y'>, zoom = ZOOM_ZONA): string {
  return plantilla.replace('{z}', String(zoom)).replace('{x}', String(t.x)).replace('{y}', String(t.y))
}

/** Origen de la plantilla, para la CSP. null si la plantilla no es una URL https valida. */
export function origenTeselas(plantilla = PLANTILLA_TESELAS): string | null {
  try {
    const url = new URL(plantilla.replace(/\{[xyz]\}/g, '0'))
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}
