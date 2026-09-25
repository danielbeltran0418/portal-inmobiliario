import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

describe('aislamiento de la llave de servicio', () => {
  it('cliente-admin declara server-only en la primera linea', () => {
    const contenido = readFileSync('src/lib/supabase/cliente-admin.ts', 'utf8')
    expect(contenido.trimStart().startsWith("import 'server-only'")).toBe(true)
  })

  it('el cliente de navegador nunca menciona la llave de servicio', () => {
    const contenido = readFileSync('src/lib/supabase/cliente-navegador.ts', 'utf8')
    expect(contenido).not.toContain('SERVICE_ROLE')
    // Verify no import from cliente-admin in any form
    expect(contenido).not.toMatch(/from\s+['"]\.\/cliente-admin['"]/)
    expect(contenido).not.toMatch(/from\s+['"]@\/lib\/supabase\/cliente-admin['"]/)
    expect(contenido).not.toMatch(/export\s+\*\s+from\s+['"]\.\/cliente-admin['"]/)
    expect(contenido).not.toMatch(/export\s+\*\s+from\s+['"]@\/lib\/supabase\/cliente-admin['"]/)
    expect(contenido).not.toMatch(/export\s+{[^}]*}\s+from\s+['"]\.\/cliente-admin['"]/)
    expect(contenido).not.toMatch(/export\s+{[^}]*}\s+from\s+['"]@\/lib\/supabase\/cliente-admin['"]/)
  })

  it('el cliente de servidor nunca menciona la llave de servicio', () => {
    const contenido = readFileSync('src/lib/supabase/cliente-servidor.ts', 'utf8')
    expect(contenido).not.toContain('SERVICE_ROLE')
    // Verify no import from cliente-admin in any form
    expect(contenido).not.toMatch(/from\s+['"]\.\/cliente-admin['"]/)
    expect(contenido).not.toMatch(/from\s+['"]@\/lib\/supabase\/cliente-admin['"]/)
    expect(contenido).not.toMatch(/export\s+\*\s+from\s+['"]\.\/cliente-admin['"]/)
    expect(contenido).not.toMatch(/export\s+\*\s+from\s+['"]@\/lib\/supabase\/cliente-admin['"]/)
    expect(contenido).not.toMatch(/export\s+{[^}]*}\s+from\s+['"]\.\/cliente-admin['"]/)
    expect(contenido).not.toMatch(/export\s+{[^}]*}\s+from\s+['"]@\/lib\/supabase\/cliente-admin['"]/)
  })
})

describe('crearClienteAdmin sin configurar', () => {
  it('nombra la variable que falta en vez del error generico de supabase-js', async () => {
    vi.resetModules()
    vi.doMock('server-only', () => ({}))
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const { crearClienteAdmin } = await import('@/lib/supabase/cliente-admin')
    expect(() => crearClienteAdmin()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
    vi.unstubAllEnvs()
  })
})
