import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks -- vi.hoisted() crea las referencias antes del izado de vi.mock
// ---------------------------------------------------------------------------

const { resolverRutaPublicaMock, esRutaFichaMock } = vi.hoisted(() => ({
  resolverRutaPublicaMock: vi.fn(),
  esRutaFichaMock: vi.fn(),
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
  rutaPermitida: vi.fn(() => true),
  rutaDePanel: vi.fn(() => '/'),
}))

vi.mock('@/lib/http/origen-peticion', () => ({
  origenReal: vi.fn(() => 'http://localhost:3000'),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  })),
}))

// ---------------------------------------------------------------------------
// Stub minimo de NextResponse
//
// El middleware usa NextResponse de tres formas:
//   1. NextResponse.next(opts)      -- respuesta passthrough
//   2. NextResponse.redirect(url)   -- redireccion 301/307
//   3. new NextResponse(body, init) -- respuesta custom (410, 404)
//
// Nuestro stub cubre las tres.
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
  // NextResponse como clase para soportar `new NextResponse(body, init)`
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

import { middleware } from '@/middleware'

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

describe('middleware: degradacion ante fallo de base de datos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve 200 (degrada) en vez de 503 cuando resolverRutaPublica lanza', async () => {
    esRutaFichaMock.mockReturnValue(true)
    resolverRutaPublicaMock.mockRejectedValue(new Error('Fallo transitorio de BD'))

    const peticion = crearPeticion('/alto-prado/casa-prueba')
    const respuesta = await middleware(peticion as unknown as NextRequest)

    // La degradacion entrega la respuesta normal: el middleware no intercepta
    // y la pagina se encarga. El status debe ser 200, nunca 503.
    expect(respuesta.status).toBe(200)
    // Las cabeceras de seguridad deben seguir presentes
    expect(respuesta.headers.get('x-nonce')).toBe('test-nonce')
  })

  it('devuelve 200 normal cuando resolverRutaPublica resuelve sin redireccion', async () => {
    esRutaFichaMock.mockReturnValue(true)
    resolverRutaPublicaMock.mockResolvedValue({ estado: 200 })

    const peticion = crearPeticion('/alto-prado/casa-ok')
    const respuesta = await middleware(peticion as unknown as NextRequest)

    expect(respuesta.status).toBe(200)
  })

  it('redirige 301 cuando resolverRutaPublica indica cambio de barrio', async () => {
    esRutaFichaMock.mockReturnValue(true)
    resolverRutaPublicaMock.mockResolvedValue({ estado: 301, destino: '/nuevo-barrio/casa-ok' })

    const peticion = crearPeticion('/viejo-barrio/casa-ok')
    const respuesta = await middleware(peticion as unknown as NextRequest)

    expect(respuesta.status).toBe(301)
  })

  it('devuelve 410 cuando resolverRutaPublica indica publicacion retirada', async () => {
    esRutaFichaMock.mockReturnValue(true)
    resolverRutaPublicaMock.mockResolvedValue({ estado: 410 })

    const peticion = crearPeticion('/barrio/casa-retirada')
    const respuesta = await middleware(peticion as unknown as NextRequest)

    expect(respuesta.status).toBe(410)
  })

  it('no consulta rutas para peticiones que no son fichas', async () => {
    esRutaFichaMock.mockReturnValue(false)

    const peticion = crearPeticion('/login')
    const respuesta = await middleware(peticion as unknown as NextRequest)

    expect(resolverRutaPublicaMock).not.toHaveBeenCalled()
    expect(respuesta.status).toBe(200)
  })
})
