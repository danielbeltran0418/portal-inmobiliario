import sharp from 'sharp'

export const ANCHO_MAXIMO = 1600
export const MAXIMO_IMAGENES_POR_PROPIEDAD = 12
export const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024
export const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp'] as const

/**
 * Procesa la imagen del vendedor antes de guardarla.
 *
 * El .rotate() SIN argumentos es imprescindible y va PRIMERO: aplica la
 * orientacion que declara el EXIF y luego la descarta. Si se quitara, las
 * fotos verticales de movil -- que se guardan apaisadas con una etiqueta de
 * rotacion -- apareceran giradas, porque al eliminar los metadatos se pierde
 * la etiqueta que las enderezaba.
 *
 * sharp descarta los metadatos salvo que se pida .withMetadata(), asi que
 * NO se pide: una foto tomada en la propiedad lleva las coordenadas GPS
 * exactas incrustadas, y el spec dice que la direccion exacta no es publica.
 */
export async function procesarImagen(entrada: Buffer): Promise<Buffer> {
  return sharp(entrada)
    .rotate()
    .resize({ width: ANCHO_MAXIMO, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
}
