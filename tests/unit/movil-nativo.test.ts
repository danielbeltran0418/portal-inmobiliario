import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('next/font/google', () => ({
  Fraunces: () => ({ variable: 'fuente-titulo' }),
  Karla: () => ({ variable: 'fuente-texto' }),
}))

const css = readFileSync('src/app/globals.css', 'utf8')

describe('viewport y barra de estado', () => {
  it('pinta de borde a borde y da un theme-color por esquema, sin bloquear el zoom', async () => {
    const { viewport } = await import('../../src/app/layout')
    expect(viewport?.viewportFit).toBe('cover')
    const temas = viewport?.themeColor as { media: string; color: string }[]
    expect(temas.map((t) => t.media)).toEqual([
      '(prefers-color-scheme: light)',
      '(prefers-color-scheme: dark)',
    ])
    expect(viewport).not.toHaveProperty('userScalable')
    expect(viewport).not.toHaveProperty('maximumScale')
  })
})

describe('capa de plataforma en globals.css', () => {
  it('quita el destello gris al tocar', () => {
    expect(css).toMatch(/-webkit-tap-highlight-color:\s*transparent/)
  })

  it('sube los campos a 16px en punteros tactiles (iOS hace zoom con menos)', () => {
    expect(css).toMatch(/@media \(pointer: coarse\)\s*{[^}]*input[^}]*textarea[^}]*select[^}]*{[^}]*font-size:\s*16px/)
  })

  it('evita el retardo de toque y la seleccion de texto en los controles', () => {
    expect(css).toMatch(/touch-action:\s*manipulation/)
    expect(css).toMatch(/user-select:\s*none/)
  })

  it('gatea el :hover propio por capacidad, para que no se quede pegado al tocar', () => {
    const fuera = css.replace(/@media \(hover: hover\) and \(pointer: fine\)\s*{(?:[^{}]*{[^{}]*})*[^{}]*}/g, '')
    expect(fuera).not.toMatch(/\.tarjeta-interactiva:hover/)
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\)/)
  })
})

describe('alturas del viewport', () => {
  it('no usa 100vh/min-h-screen en las vistas (la barra del navegador las desborda)', () => {
    const vistas = [
      readFileSync('src/app/(admin)/control/layout.tsx', 'utf8'),
      readFileSync('src/app/(vendedor)/panel/page.tsx', 'utf8'),
    ].join('\n')
    expect(vistas).not.toMatch(/min-h-screen|100vh/)
  })
})
