import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { construirCabeceras, generarNonce } from '@/lib/seguridad/cabeceras'

function directivaDeScripts(csp: string): string {
  return csp.split(';').find((d) => d.trim().startsWith('script-src'))!
}

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
    expect(directivaDeScripts(cabeceras['Content-Security-Policy'])).not.toContain('unsafe-inline')
  })

  // React necesita eval() en desarrollo (reconstruye pilas de llamada para el
  // depurador) y no lo usa nunca en produccion. La CSP lo refleja, y las dos
  // caras se fijan juntas: sin la de desarrollo, un 'unsafe-eval' borrado por
  // completo pasaria la de produccion; sin la de produccion, un 'unsafe-eval'
  // incondicional pasaria la de desarrollo.
  describe(`'unsafe-eval' solo en desarrollo`, () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('en produccion la CSP NO permite unsafe-eval', () => {
      vi.stubEnv('NODE_ENV', 'production')
      const csp = construirCabeceras('abc123')['Content-Security-Policy']
      expect(directivaDeScripts(csp)).not.toContain('unsafe-eval')
      // Y en ninguna otra directiva tampoco.
      expect(csp).not.toContain('unsafe-eval')
    })

    it('en desarrollo la CSP SI permite unsafe-eval', () => {
      vi.stubEnv('NODE_ENV', 'development')
      const csp = construirCabeceras('abc123')['Content-Security-Policy']
      expect(directivaDeScripts(csp)).toContain(`'unsafe-eval'`)
    })

    it('el nonce y strict-dynamic siguen presentes en produccion', () => {
      vi.stubEnv('NODE_ENV', 'production')
      const script = directivaDeScripts(construirCabeceras('abc123')['Content-Security-Policy'])
      expect(script).toContain(`'nonce-abc123'`)
      expect(script).toContain(`'strict-dynamic'`)
    })
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
