import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Todo el portal usa su paleta (tokens de globals.css), como el diseño de
 * Figma Make. Los colores sueltos de Tailwind (amber, red, emerald, slate...)
 * no siguen el modo oscuro ni el contraste de los tokens. Empezo por el area de
 * administracion y se extendio a src/components y src/app enteros. Se permite
 * bg-black con opacidad (bg-black/50): es el velo de los modales, oscuro en
 * los dos modos a proposito.
 */
const RAICES = ['src/components', 'src/app']
const COLOR_SUELTO = /\b(?:bg|text|border|ring|from|to|accent)-(?:slate|gray|zinc|neutral|stone|blue|sky|amber|yellow|orange|rose|red|pink|emerald|green|lime|teal|cyan|indigo|violet|purple)-\d{2,3}\b|\bbg-black(?!\/\d)/

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    return statSync(ruta).isDirectory() ? archivos(ruta) : ruta.endsWith('.tsx') ? [ruta] : []
  })
}

describe('el portal usa su paleta', () => {
  it.each(RAICES.flatMap(archivos))('%s no usa colores sueltos de Tailwind', (ruta) => {
    const lineas = readFileSync(ruta, 'utf8').split('\n')
    const malas = lineas
      .map((linea, i) => [i + 1, linea.match(COLOR_SUELTO)?.[0]] as const)
      .filter(([, color]) => color)
    expect(malas).toEqual([])
  })
})
