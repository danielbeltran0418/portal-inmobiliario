import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { construirCabeceras, generarNonce } from '@/lib/seguridad/cabeceras'

describe('cabeceras de seguridad', () => {
  const cabeceras = construirCabeceras('abc123')

  it('impide que el sitio se embeba en un iframe', () => {
    expect(cabeceras['X-Frame-Options']).toBe('DENY')
  })

  it('desactiva el olfateo de tipo MIME', () => {
    expect(cabeceras['X-Content-Type-Options']).toBe('nosniff')
  })

  it('fuerza HTTPS por un ano con subdominios', () => {
    expect(cabeceras['Strict-Transport-Security']).toContain('max-age=31536000')
    expect(cabeceras['Strict-Transport-Security']).toContain('includeSubDomains')
  })

  it('restringe el referente entre origenes', () => {
    expect(cabeceras['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })

  it('incluye el nonce en la directiva de scripts', () => {
    expect(cabeceras['Content-Security-Policy']).toContain("'nonce-abc123'")
  })

  it('la CSP no permite unsafe-inline en scripts', () => {
    const script = cabeceras['Content-Security-Policy']
      .split(';').find((d) => d.trim().startsWith('script-src'))!
    expect(script).not.toContain('unsafe-inline')
  })

  it('la CSP bloquea la incrustacion por frame-ancestors', () => {
    expect(cabeceras['Content-Security-Policy']).toContain("frame-ancestors 'none'")
  })

  it('genera nonces distintos en cada llamada', () => {
    expect(generarNonce()).not.toBe(generarNonce())
  })

  it('no usa APIs de Node ausentes en el runtime Edge (Buffer, require, node:)', () => {
    const ruta = fileURLToPath(new URL('../../src/lib/seguridad/cabeceras.ts', import.meta.url))
    const codigo = readFileSync(ruta, 'utf-8')
    const sinComentarios = codigo
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

    expect(sinComentarios).not.toMatch(/\bBuffer\b/)
    expect(sinComentarios).not.toMatch(/\brequire\s*\(/)
    expect(sinComentarios).not.toMatch(/from\s+['"]node:/)
  })
})
