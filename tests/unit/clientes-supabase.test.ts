import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('aislamiento de la llave de servicio', () => {
  it('cliente-admin declara server-only en la primera linea', () => {
    const contenido = readFileSync('src/lib/supabase/cliente-admin.ts', 'utf8')
    expect(contenido.trimStart().startsWith("import 'server-only'")).toBe(true)
  })

  it('el cliente de navegador nunca menciona la llave de servicio', () => {
    const contenido = readFileSync('src/lib/supabase/cliente-navegador.ts', 'utf8')
    expect(contenido).not.toContain('SERVICE_ROLE')
  })

  it('el cliente de servidor nunca menciona la llave de servicio', () => {
    const contenido = readFileSync('src/lib/supabase/cliente-servidor.ts', 'utf8')
    expect(contenido).not.toContain('SERVICE_ROLE')
  })
})
