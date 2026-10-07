/**
 * Fotos de las publicaciones de prueba (scripts/sembrar-publicaciones-prueba.ts).
 *
 * Las imagenes de scripts/fotos-prueba/ son fotografias generadas con IA (el
 * generador de imagenes de Figma): sin personas, texto ni marcas. Hay una por
 * tipo de inmueble y un interior que se anade a las viviendas, para que la
 * galeria de la ficha tenga mas de una foto.
 *
 * Solo sirven para datos de prueba: nunca se suben a publicaciones reales.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { procesarImagen } from '../src/lib/imagenes/procesar'

export type TipoInmueble = 'apartamento' | 'casa' | 'local' | 'lote' | 'oficina'

const CARPETA = join(__dirname, 'fotos-prueba')
const VIVIENDAS: ReadonlySet<TipoInmueble> = new Set(['apartamento', 'casa'])

/** Rutas de las fotos para una publicacion de ese tipo; la primera es la portada. */
export function fotosDePrueba(tipo: TipoInmueble): string[] {
  const fotos = [join(CARPETA, `${tipo}.jpg`)]
  if (VIVIENDAS.has(tipo)) fotos.push(join(CARPETA, 'interior.jpg'))
  return fotos
}

/** La foto lista para subir: el mismo procesamiento que una foto de un vendedor real. */
export async function fotoComoWebp(ruta: string): Promise<Buffer> {
  return procesarImagen(await readFile(ruta))
}
