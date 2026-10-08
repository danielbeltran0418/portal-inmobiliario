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
/**
 * Formato REAL del archivo por sus primeros bytes. archivo.type lo decide el
 * navegador (o quien llame al server action a mano), y sharp detecta el
 * formato por el contenido: un SVG subido como "image/png" llegaba a librsvg,
 * el decodificador con historial de vulnerabilidades (GHSA-wq5f-xc86-pv6w en
 * sharp < 0.35.5). Solo JPEG, PNG y WebP pasan a sharp.
 */
export function formatoReal(bytes: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

export async function procesarImagen(entrada: Buffer): Promise<Buffer> {
  if (!formatoReal(entrada)) throw new Error('Formato de imagen no admitido')
  // limitInputPixels: una imagen de 5 MB puede declarar dimensiones enormes
  // (bomba de descompresion); 40 MP sobra para cualquier foto de movil.
  return sharp(entrada, { limitInputPixels: 40_000_000, failOn: 'error' })
    .rotate()
    .resize({ width: ANCHO_MAXIMO, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
}
