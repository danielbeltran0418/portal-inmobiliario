import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { config } from '@/proxy'

describe('CN-016: Matcher de proxy para exclusión de estáticos de /public', () => {
  const matcherPattern = config.matcher[0]
  // Convierte el pattern del matcher de Next.js en RegExp
  // Next.js usa: /((?!...).*)
  const re = new RegExp(`^${matcherPattern}$`)

  it('excluye los archivos estáticos reales de /public', () => {
    const estaticosPublic = [
      '/acceso.jpg',
      '/file.svg',
      '/globe.svg',
      '/next.svg',
      '/og-fallback.jpg',
      '/portada.jpg',
      '/vercel.svg',
      '/window.svg',
      '/favicon.ico',
    ]

    for (const estatico of estaticosPublic) {
      expect(re.test(estatico), `Debe excluir ${estatico}`).toBe(false)
    }
  })

  it('excluye rutas internas estáticas de Next.js (_next/static y _next/image)', () => {
    expect(re.test('/_next/static/chunks/main.js')).toBe(false)
    expect(re.test('/_next/image')).toBe(false)
  })

  it('NO excluye rutas dinámicas con extensiones de imagen que requieren protección o cabeceras', () => {
    expect(re.test('/panel/propiedades/foto.png')).toBe(true)
    expect(re.test('/mi-cuenta/avatar.jpg')).toBe(true)
    expect(re.test('/control/moderacion/imagen.webp')).toBe(true)
  })

  it('NO excluye endpoints de imagen dinámica como /imagen/[id] o /imagen/zona/[id]', () => {
    expect(re.test('/imagen/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(true)
    expect(re.test('/imagen/zona/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(true)
  })

  it('NO excluye rutas públicas y protegidas de la aplicación', () => {
    expect(re.test('/')).toBe(true)
    expect(re.test('/catalogo')).toBe(true)
    expect(re.test('/login')).toBe(true)
    expect(re.test('/panel')).toBe(true)
    expect(re.test('/mi-cuenta')).toBe(true)
    expect(re.test('/control')).toBe(true)
  })
})
