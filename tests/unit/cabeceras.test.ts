import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { construirCabeceras, generarNonce } from '@/lib/seguridad/cabeceras'

function directivaDeScripts(csp: string): string {
  return csp.split(';').find((d) => d.trim().startsWith('script-src'))!
}

function directivaDeImagenes(csp: string): string {
  return csp.split(';').find((d) => d.trim().startsWith('img-src'))!.trim()
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

  /**
   * Task 12 es la primera pantalla que carga un <img> (next/image
   * `unoptimized`) apuntando de verdad a Storage con una URL firmada. Visto
   * en vivo probando el flujo a mano: en local, Storage corre en
   * http://127.0.0.1:<puerto>, que "https://*.supabase.co" no cubre (ni el
   * esquema ni el host coinciden), y el navegador bloqueaba la imagen aunque
   * la URL firmada fuera correcta. Mismo patron que 'unsafe-eval': las dos
   * caras se fijan juntas, condicionadas a NODE_ENV.
   */
  describe('el origen local de Supabase en img-src, solo fuera de produccion', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('en produccion, img-src NO anade el origen de NEXT_PUBLIC_SUPABASE_URL', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://algun-proyecto.supabase.co')
      const csp = construirCabeceras('abc123')['Content-Security-Policy']

      // El comodin de produccion ya cubre https://<ref>.supabase.co: anadir
      // el origen exacto tambien seria redundante, no inseguro, pero la
      // regla es "nada nuevo en produccion" -- igual que unsafe-eval.
      expect(directivaDeImagenes(csp)).toBe(`img-src 'self' data: blob: https://*.supabase.co`)
    })

    it('fuera de produccion, img-src SI incluye el origen de NEXT_PUBLIC_SUPABASE_URL', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
      const csp = construirCabeceras('abc123')['Content-Security-Policy']

      expect(directivaDeImagenes(csp)).toContain('http://127.0.0.1:54321')
    })

    it('si la URL de Supabase no esta definida, no revienta la construccion de cabeceras', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
      expect(() => construirCabeceras('abc123')).not.toThrow()
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

it('solo fuerza HTTPS en producción; las redirecciones a Storage local conservan HTTP', () => {
  try {
    vi.stubEnv('NODE_ENV', 'development')
    expect(construirCabeceras('nonce')['Content-Security-Policy']).not.toContain('upgrade-insecure-requests')
    vi.stubEnv('NODE_ENV', 'production')
    expect(construirCabeceras('nonce')['Content-Security-Policy']).toContain('upgrade-insecure-requests')
  } finally { vi.unstubAllEnvs() }
})
