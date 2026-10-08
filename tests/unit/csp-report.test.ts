import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/seguridad/csp-report/route'
import type { NextRequest } from 'next/server'

function crearPeticion(body: string, headers: Record<string, string> = {}) {
  return {
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
    text: async () => body,
  } as unknown as NextRequest
}

describe('CN-018: Endpoint de reporte de violaciones CSP', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rechaza con 413 si la cabecera content-length supera 10 KB', async () => {
    const req = crearPeticion('{}', { 'content-length': '20000' })
    const res = await POST(req)
    expect(res.status).toBe(413)
  })

  it('rechaza con 413 si el cuerpo del texto supera 10 KB', async () => {
    const bodyGrande = 'x'.repeat(10241)
    const req = crearPeticion(bodyGrande)
    const res = await POST(req)
    expect(res.status).toBe(413)
  })

  it('rechaza con 400 si el JSON es inválido', async () => {
    const req = crearPeticion('invalido {')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('procesa reporte en formato legacy csp-report, anonimiza URLs y devuelve 204', async () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const payload = JSON.stringify({
      'csp-report': {
        'document-uri': 'https://portal.test/mi-cuenta/datos?token=secreto123#fragmento',
        'blocked-uri': 'https://malicioso.test/script.js?usuario=pepe',
        'effective-directive': 'script-src-elem',
        'disposition': 'enforce',
      },
    })

    const req = crearPeticion(payload)
    const res = await POST(req)
    expect(res.status).toBe(204)

    expect(spyWarn).toHaveBeenCalledWith(
      '[Seguridad] Violación de CSP detectada:',
      expect.objectContaining({
        directiva: 'script-src-elem',
        urlDocumento: 'https://portal.test/mi-cuenta/datos',
        urlBloqueada: 'https://malicioso.test/script.js',
        disposicion: 'enforce',
      }),
    )
  })

  it('procesa reporte en formato moderno Reporting API, anonimiza URLs y devuelve 204', async () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const payload = JSON.stringify([
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://portal.test/panel?email=test@correo.com',
          blockedURL: 'https://cdn-externo.test/lib.js?key=xyz',
          effectiveDirective: 'script-src',
          disposition: 'enforce',
        },
      },
    ])

    const req = crearPeticion(payload)
    const res = await POST(req)
    expect(res.status).toBe(204)

    expect(spyWarn).toHaveBeenCalledWith(
      '[Seguridad] Violación de CSP detectada:',
      expect.objectContaining({
        directiva: 'script-src',
        urlDocumento: 'https://portal.test/panel',
        urlBloqueada: 'https://cdn-externo.test/lib.js',
        disposicion: 'enforce',
      }),
    )
  })
})
