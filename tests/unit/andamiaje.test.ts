import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

describe('andamiaje del proyecto', () => {
  it('.gitignore excluye los archivos de entorno', () => {
    const contenido = readFileSync('.gitignore', 'utf8')
    expect(contenido).toContain('.env.local')
    expect(contenido).toContain('.env*.local')
  })

  it('.env.example no contiene valores de llaves', () => {
    const contenido = readFileSync('.env.example', 'utf8')
    expect(contenido).toMatch(/SUPABASE_SERVICE_ROLE_KEY=\s*$/m)
  })

  it('ninguna variable publica expone la llave de servicio', () => {
    const contenido = readFileSync('.env.example', 'utf8')
    expect(contenido).not.toMatch(/NEXT_PUBLIC_.*SERVICE_ROLE/)
  })

  it('existe el flujo de CI', () => {
    expect(existsSync('.github/workflows/ci.yml')).toBe(true)
  })
})
