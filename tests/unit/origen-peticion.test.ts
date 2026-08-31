import { describe, it, expect, vi, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

// origen-peticion.ts declara 'server-only' -- correcto para Next (bloquea que
// se cuele en un bundle de cliente), pero ese paquete solo resuelve a un modulo
// vacio bajo la condicion de resolucion "react-server" que pone el bundler de
// Next. Vitest no la pone, asi que sin este mock la importacion de mas abajo
// lanzaria "This module cannot be imported from a Client Component module."
// El mismo problema ya se ve en cliente-admin.ts, que este repo evita
// probando el CODIGO FUENTE en vez de importar el modulo (ver
// tests/unit/clientes-supabase.test.ts) -- aqui hace falta importar de
// verdad para probar comportamiento, asi que se neutraliza el marcador en
// vez de evitarlo. vi.mock se iza automaticamente sobre los imports.
vi.mock('server-only', () => ({}))

import { origenReal } from '@/lib/http/origen-peticion'

// Stub minimo: origenReal solo lee peticion.headers.get(...), asi que no hace
// falta construir un NextRequest real.
function peticionCon(cabeceras: Record<string, string>): NextRequest {
  return {
    headers: { get: (nombre: string) => cabeceras[nombre] ?? null },
  } as unknown as NextRequest
}

describe('origenReal', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('en produccion usa la URL configurada e ignora el Host del cliente', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.ejemplo.test')

    // Host hostil: si esto se colara, seria una inyeccion de cabecera Host
    // que envenenaria el enlace de verificacion o el redirect de una guarda.
    const peticion = peticionCon({ host: 'atacante.example' })

    expect(origenReal(peticion)).toBe('https://portal.ejemplo.test')
  })

  it('en produccion sin NEXT_PUBLIC_APP_URL, falla cerrado en vez de confiar en el Host', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')

    const peticion = peticionCon({ host: 'atacante.example' })

    expect(() => origenReal(peticion)).toThrow(/NEXT_PUBLIC_APP_URL/)
  })

  it('en desarrollo deriva el origen de la cabecera Host', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')

    const peticion = peticionCon({ host: '127.0.0.1:3000' })

    expect(origenReal(peticion)).toBe('http://127.0.0.1:3000')
  })

  it('en desarrollo sin cabecera Host, no produce el literal "https://null"', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')

    const peticion = peticionCon({})

    expect(origenReal(peticion)).toBe('http://127.0.0.1:3000')
  })
})
