import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * El area de administracion usa la paleta del portal (tokens de globals.css),
 * como el diseño de Figma Make. Los colores sueltos de Tailwind (amber, red,
 * emerald, slate...) no siguen el modo oscuro ni el contraste de los tokens.
 */
const RAICES = ['src/components/admin', 'src/app/(admin)']
const COLOR_SUELTO = /\b(?:bg|text|border|ring|from|to|accent)-(?:slate|gray|zinc|neutral|stone|blue|sky|amber|yellow|orange|rose|red|pink|emerald|green|lime|teal|cyan|indigo|violet|purple)-\d{2,3}\b|\bbg-black\b/

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    return statSync(ruta).isDirectory() ? archivos(ruta) : ruta.endsWith('.tsx') ? [ruta] : []
  })
}

describe('administracion con la paleta del portal', () => {
  it.each(RAICES.flatMap(archivos))('%s no usa colores sueltos de Tailwind', (ruta) => {
    const lineas = readFileSync(ruta, 'utf8').split('\n')
    const malas = lineas
      .map((linea, i) => [i + 1, linea.match(COLOR_SUELTO)?.[0]] as const)
      .filter(([, color]) => color)
    expect(malas).toEqual([])
  })
})
