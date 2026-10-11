import { describe, it, expect, vi, afterEach } from 'vitest'
import { construirCabeceras } from '@/lib/seguridad/cabeceras'

afterEach(() => vi.unstubAllEnvs())
describe('CSP del mapa opcional', () => {
  it('no permite recursos de mapas con la integración desactivada o incompleta', () => {
    vi.stubEnv('MAPS_INTERACTIVE_ENABLED', 'false')
    expect(construirCabeceras('n')['Content-Security-Policy']).not.toContain('https://*.googleapis.com')
    vi.stubEnv('MAPS_INTERACTIVE_ENABLED', 'true')
    vi.stubEnv('GOOGLE_MAPS_BROWSER_KEY', '')
    expect(construirCabeceras('n')['Content-Security-Policy']).not.toContain('https://*.googleapis.com')
  })
  it('habilita recursos del mapa sin relajar la ejecución de scripts en producción', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('MAPS_INTERACTIVE_ENABLED', 'true')
    vi.stubEnv('GOOGLE_MAPS_BROWSER_KEY', 'prueba'); vi.stubEnv('GOOGLE_MAPS_MAP_ID', 'mapa')
    const csp = construirCabeceras('n')['Content-Security-Policy']
    expect(csp).toContain('https://*.googleapis.com')
    const scripts = csp.split(';').find((valor) => valor.trim().startsWith('script-src'))!
    expect(scripts).toContain("'nonce-n' 'strict-dynamic'")
    expect(scripts).not.toContain('unsafe-eval')
    expect(scripts).not.toContain('unsafe-inline')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("form-action 'self'")
  })
})