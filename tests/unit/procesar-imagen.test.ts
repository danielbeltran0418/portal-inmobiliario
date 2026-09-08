import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { procesarImagen, ANCHO_MAXIMO } from '@/lib/imagenes/procesar'

async function jpegDePrueba(ancho: number, alto: number, conGps = false) {
  let imagen = sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 120, b: 60 } },
  }).jpeg()
  if (conGps) {
    // El brief original usa la clave `GPS`, pero el tipo `Exif` de esta
    // version de sharp (0.35.4) solo admite IFD0..IFD3 -- IFD3 es la IFD de
    // GPS, tal como documenta el propio JSDoc de sharp para withExif().
    imagen = imagen.withExif({ IFD0: { Copyright: 'prueba' }, IFD3: { GPSLatitude: '10/1 59/1 0/1' } })
  }
  return imagen.toBuffer()
}

/**
 * Construye a mano el segmento APP1/Exif de un JPEG con un tag Orientation
 * (0x0112, tipo SHORT) puesto justo despues del SOI.
 *
 * No se usa sharp .withExif() para esto: esa API escribe los pares
 * clave/valor como cadenas ASCII, y el tag Orientation es binario (SHORT).
 * Al reinyectarlo asi, sharp lo relee como orientation=1 (normal) en vez
 * del valor pedido -- se comprobo empiricamente -- asi que no sirve para
 * demostrar que procesarImagen aplica la rotacion antes de descartarla.
 * Construyendo el segmento TIFF/EXIF en binario se consigue un tag
 * Orientation real que sharp .rotate() si interpreta.
 */
function jpegConOrientacion(valorOrientacion: number, base: Buffer) {
  const tiff = Buffer.alloc(26)
  tiff.write('II', 0, 'ascii')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4) // offset a la IFD0
  tiff.writeUInt16LE(1, 8) // 1 entrada en la IFD0
  tiff.writeUInt16LE(0x0112, 10) // tag Orientation
  tiff.writeUInt16LE(3, 12) // type SHORT
  tiff.writeUInt32LE(1, 14) // count
  tiff.writeUInt16LE(valorOrientacion, 18) // valor, en los primeros 2 bytes del campo de 4
  tiff.writeUInt16LE(0, 20)
  tiff.writeUInt32LE(0, 22) // offset a la siguiente IFD = 0 (no hay)

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff])
  const segmento = Buffer.alloc(4 + payload.length)
  segmento.writeUInt8(0xff, 0)
  segmento.writeUInt8(0xe1, 1)
  segmento.writeUInt16BE(payload.length + 2, 2)
  payload.copy(segmento, 4)

  return Buffer.concat([base.subarray(0, 2), segmento, base.subarray(2)])
}

describe('procesarImagen', () => {
  it('devuelve WebP', async () => {
    const salida = await procesarImagen(await jpegDePrueba(800, 600))
    expect((await sharp(salida).metadata()).format).toBe('webp')
  })

  it('reduce las imagenes mas anchas que el maximo', async () => {
    const salida = await procesarImagen(await jpegDePrueba(3000, 2000))
    expect((await sharp(salida).metadata()).width).toBe(ANCHO_MAXIMO)
  })

  it('NO amplia las mas pequenas', async () => {
    const salida = await procesarImagen(await jpegDePrueba(400, 300))
    expect((await sharp(salida).metadata()).width).toBe(400)
  })

  it('ELIMINA los metadatos EXIF, incluidas las coordenadas GPS', async () => {
    const conGps = await jpegDePrueba(800, 600, true)
    expect((await sharp(conGps).metadata()).exif).toBeDefined()

    const salida = await procesarImagen(conGps)
    expect((await sharp(salida).metadata()).exif).toBeUndefined()
  })

  it('el resultado pesa menos que el original', async () => {
    const original = await jpegDePrueba(3000, 2000)
    const salida = await procesarImagen(original)
    expect(salida.byteLength).toBeLessThan(original.byteLength)
  })

  it('aplica la rotacion EXIF antes de descartar los metadatos (fotos verticales de movil)', async () => {
    const base = await jpegDePrueba(800, 600)
    const entrada = jpegConOrientacion(6, base) // 6 = rotar 90 grados

    const metaEntrada = await sharp(entrada).metadata()
    expect(metaEntrada.orientation).toBe(6)
    expect(metaEntrada.width).toBe(800)
    expect(metaEntrada.height).toBe(600)

    const salida = await procesarImagen(entrada)
    const metaSalida = await sharp(salida).metadata()
    // Si .rotate() no se aplicara (o se aplicara despues de perder el tag),
    // la salida seguiria siendo 800x600. Al aplicarse antes de descartar los
    // metadatos, el pixel fisico queda transpuesto: 600x800.
    expect(metaSalida.width).toBe(600)
    expect(metaSalida.height).toBe(800)
    expect(metaSalida.orientation).toBeUndefined()
  })
})
