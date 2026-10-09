import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks -- vi.hoisted() crea las referencias antes del izado de vi.mock
// ---------------------------------------------------------------------------

const { resolverRutaPublicaMock, esRutaFichaMock, getUserMock, getClaimsMock, rutaPermitidaMock } = vi.hoisted(() => ({
  resolverRutaPublicaMock: vi.fn(),
  esRutaFichaMock: vi.fn(),
  getUserMock: vi.fn(),
  getClaimsMock: vi.fn(),
  rutaPermitidaMock: vi.fn(() => true),
}))

vi.mock('@/lib/catalogo/rutas', () => ({
  esRutaFicha: esRutaFichaMock,
  resolverRutaPublica: resolverRutaPublicaMock,
}))

vi.mock('@/lib/supabase/cliente-publico', () => ({
  crearClientePublico: vi.fn(() => ({})),
}))

vi.mock('@/lib/seguridad/cabeceras', () => ({
  construirCabeceras: vi.fn(() => ({
    'Content-Security-Policy': "default-src 'self'",
  })),
  generarNonce: vi.fn(() => 'test-nonce'),
}))

vi.mock('@/lib/auth/roles', () => ({
  rolDesdeToken: vi.fn(() => 'visitante'),
  rolDesdeClaims: vi.fn((c: { app_metadata?: { rol?: string } } | null) => c?.app_metadata?.rol ?? 'comprador'),
  rutaPermitida: rutaPermitidaMock,
  rutaDePanel: vi.fn(() => '/'),
  RUTA_DOBLE_FACTOR: '/doble-factor',
  sesionConSegundoFactor: (c: { aal?: unknown } | null) => c?.aal === 'aal2',
}))

vi.mock('@/lib/http/origen-peticion', () => ({
  origenReal: vi.fn(() => 'http://localhost:3000'),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: getUserMock,
      getClaims: getClaimsMock,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  })),
}))

// ---------------------------------------------------------------------------
// Stub minimo de NextResponse
// ---------------------------------------------------------------------------

class FakeHeaders extends Map<string, string> {
  constructor(init?: Record<string, string> | HeadersInit | Iterable<[string, string]>) {
    if (init && typeof init === 'object' && !(init instanceof Map) && !(Symbol.iterator in Object(init))) {
      super(Object.entries(init as Record<string, string>))
    } else {
      super(init as Iterable<[string, string]> | undefined)
    }
  }
}

function fakeCookies() {
  const jar = new Map<string, { name: string; value: string; options?: Record<string, unknown> }>()
  return {
    getAll: () => [...jar.values()],
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      jar.set(name, { name, value, options })
    },
    get: (name: string) => jar.get(name),
  }
}

vi.mock('next/server', () => {
  class NextResponse {
    status: number
    headers: FakeHeaders
    cookies: ReturnType<typeof fakeCookies>

    constructor(_body?: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.status = init?.status ?? 200
      this.headers = new FakeHeaders(init?.headers)
      this.cookies = fakeCookies()
    }

    static next() {
      return new NextResponse(null, { status: 200 })
    }

    static redirect(url: URL | string, status?: number) {
      const u = typeof url === 'string' ? new URL(url) : url
      return new NextResponse(null, { status: status ?? 307, headers: { Location: u.toString() } })
    }
  }

  return { NextResponse }
})

import { proxy } from '@/proxy'

// ---------------------------------------------------------------------------
// Fabrica de peticiones falsas
// ---------------------------------------------------------------------------

function crearPeticion(ruta: string, metodo = 'GET') {
  const url = new URL(ruta, 'http://localhost:3000')
  return {
    method: metodo,
    url: url.toString(),
    headers: new FakeHeaders({ host: 'localhost:3000' }),
    nextUrl: { pathname: url.pathname },
    cookies: fakeCookies(),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: null } })
  getClaimsMock.mockReset().mockResolvedValue({ data: null, error: null })
  rutaPermitidaMock.mockReset().mockReturnValue(true)
})

describe('proxy: autenticacion con getClaims()', () => {
  it('una ruta publica verifica con getClaims y no paga un getUser() de red', async () => {
    esRutaFichaMock.mockReturnValue(false)
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'u1' } }, error: null })
    const r = await proxy(crearPeticion('/ciudad/bogota') as unknown as NextRequest)
    expect(r.status).toBe(200)
    expect(getClaimsMock).toHaveBeenCalledTimes(1)
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it('una ruta protegida sin claims va al login sin consultar al servidor', async () => {
    const r = await proxy(crearPeticion('/panel') as unknown as NextRequest)
    expect(r.headers.get('Location')).toMatch(/\/login$/)
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it('una ruta protegida exige el correo verificado (getUser) y decide con el rol de las claims', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'u1', app_metadata: { rol: 'vendedor' } } }, error: null })
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email_confirmed_at: null } } })
    const sinVerificar = await proxy(crearPeticion('/panel') as unknown as NextRequest)
    expect(sinVerificar.headers.get('Location')).toMatch(/\/verificar-correo$/)

    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email_confirmed_at: '2026-10-01' } } })
    await proxy(crearPeticion('/panel') as unknown as NextRequest)
    expect(rutaPermitidaMock).toHaveBeenLastCalledWith('/panel', 'vendedor')
  })

  // M2: /control exige el segundo factor en la sesion.
  it('/control con sesion aal1 manda a /doble-factor; con aal2 deja pasar', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email_confirmed_at: '2026-10-01' } } })

    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'u1', aal: 'aal1', app_metadata: { rol: 'super_admin' } } }, error: null })
    for (const ruta of ['/control', '/control/moderacion']) {
      const r = await proxy(crearPeticion(ruta) as unknown as NextRequest)
      expect(r.headers.get('Location')).toMatch(/\/doble-factor$/)
    }

    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'u1', aal: 'aal2', app_metadata: { rol: 'super_admin' } } }, error: null })
    const r = await proxy(crearPeticion('/control') as unknown as NextRequest)
    expect(r.headers.get('Location') ?? '').not.toMatch(/doble-factor|login/)
  })

  it('las demas rutas protegidas no piden segundo factor', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email_confirmed_at: '2026-10-01' } } })
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'u1', aal: 'aal1', app_metadata: { rol: 'vendedor' } } }, error: null })
    const r = await proxy(crearPeticion('/panel') as unknown as NextRequest)
    expect(r.headers.get('Location') ?? '').not.toMatch(/doble-factor/)
  })

  it('un token que getClaims rechaza cuenta como sin sesion', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'invalid JWT signature' } })
    const r = await proxy(crearPeticion('/mi-cuenta') as unknown as NextRequest)
    expect(r.headers.get('Location')).toMatch(/\/login$/)
  })
})

describe('proxy: degradacion ante fallo de base de datos', () => {
  beforeEach(() => {
    resolverRutaPublicaMock.mockReset()
    esRutaFichaMock.mockReset()
  })

  it('devuelve 200 (degrada) en vez de 503 cuando resolverRutaPublica lanza', async () => {
    esRutaFichaMock.mockReturnValue(true)
    resolverRutaPublicaMock.mockRejectedValue(new Error('Fallo transitorio de BD'))

    const peticion = crearPeticion('/alto-prado/casa-prueba')
    const respuesta = await proxy(peticion as unknown as NextRequest)

    // La degradacion entrega la respuesta normal: el proxy no intercepta
    // y la pagina se encarga. El status debe ser 200, nunca 503.
    expect(respuesta.status).toBe(200)
    // Las cabeceras de seguridad deben seguir presentes
    expect(respuesta.headers.get('x-nonce')).toBe('test-nonce')
  })

  it('devuelve 200 normal cuando resolverRutaPublica resuelve sin redireccion', async () => {
    esRutaFichaMock.mockReturnValue(true)
    resolverRutaPublicaMock.mockResolvedValue({ estado: 200 })

    const peticion = crearPeticion('/alto-prado/casa-ok')
    const respuesta = await proxy(peticion as unknown as NextRequest)

    expect(respuesta.status).toBe(200)
  })

  it('redirige 301 cuando resolverRutaPublica indica cambio de barrio', async () => {
    esRutaFichaMock.mockReturnValue(true)
    resolverRutaPublicaMock.mockResolvedValue({ estado: 301, destino: '/nuevo-barrio/casa-ok' })

    const peticion = crearPeticion('/viejo-barrio/casa-ok')
    const respuesta = await proxy(peticion as unknown as NextRequest)

    expect(respuesta.status).toBe(301)
  })

  it('devuelve 410 cuando resolverRutaPublica indica publicacion retirada', async () => {
    esRutaFichaMock.mockReturnValue(true)
    resolverRutaPublicaMock.mockResolvedValue({ estado: 410 })

    const peticion = crearPeticion('/barrio/casa-retirada')
    const respuesta = await proxy(peticion as unknown as NextRequest)

    expect(respuesta.status).toBe(410)
  })

  it('no consulta rutas para peticiones que no son fichas', async () => {
    esRutaFichaMock.mockReturnValue(false)

    const peticion = crearPeticion('/login')
    const respuesta = await proxy(peticion as unknown as NextRequest)

    expect(resolverRutaPublicaMock).not.toHaveBeenCalled()
    expect(respuesta.status).toBe(200)
  })
})
