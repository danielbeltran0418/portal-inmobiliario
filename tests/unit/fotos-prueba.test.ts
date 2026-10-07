import { describe, expect, it } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import sharp from 'sharp'
import { fotosDePrueba, fotoComoWebp } from '../../scripts/fotos-prueba'

const TIPOS = ['apartamento', 'casa', 'local', 'lote', 'oficina'] as const

describe('fotos de las publicaciones de prueba', () => {
  it.each(TIPOS)('%s tiene al menos una foto real en el repo, y la primera es la de su tipo', (tipo) => {
    const fotos = fotosDePrueba(tipo)
    expect(fotos.length).toBeGreaterThan(0)
    for (const foto of fotos) {
      expect(existsSync(foto), foto).toBe(true)
      expect(statSync(foto).size).toBeGreaterThan(10_000)
    }
    expect(basename(fotos[0]!)).toBe(`${tipo}.jpg`)
  })

  it('las viviendas llevan ademas un interior, para que la galeria de la ficha tenga mas de una foto', () => {
    expect(fotosDePrueba('apartamento').map((f) => basename(f))).toEqual(['apartamento.jpg', 'interior.jpg'])
    expect(fotosDePrueba('casa').map((f) => basename(f))).toEqual(['casa.jpg', 'interior.jpg'])
  })

  it('local, lote y oficina no llevan el interior de una vivienda', () => {
    for (const tipo of ['local', 'lote', 'oficina'] as const) {
      expect(fotosDePrueba(tipo)).toHaveLength(1)
    }
  })

  it('convierte la foto a WebP, como hace la app al subir, y la acota a 1600 px', async () => {
    const webp = await fotoComoWebp(fotosDePrueba('casa')[0]!)
    const meta = await sharp(webp).metadata()
    expect(meta.format).toBe('webp')
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1600)
  })
})
