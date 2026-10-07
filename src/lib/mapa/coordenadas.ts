/**
 * Coordenadas y medidas del mapa de la zona. Modulo puro, sin dependencias de
 * servidor: lo usa tambien el formulario del vendedor (en el navegador). Lo
 * que habla con Google vive en src/lib/mapa/google.ts.
 */
export const RADIO_ZONA_METROS = 500
export const ZOOM_ZONA = 15
export const ANCHO_MAPA = 640
export const ALTO_MAPA = 260

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

