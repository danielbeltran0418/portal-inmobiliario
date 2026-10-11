import { describe, it, expect, vi, beforeEach } from 'vitest'
let POST: typeof import('@/app/api/seguridad/csp-report/route').POST
import type { NextRequest } from 'next/server'

function crearPeticion(body: string, headers: Record<string, string> = {}) {
  return new Request('https://portal.test/api/seguridad/csp-report', {
    method: 'POST', body, headers,
  }) as NextRequest
}
describe('CN-018: Endpoint de reporte de violaciones CSP', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    vi.resetModules()
    ;({ POST } = await import('@/app/api/seguridad/csp-report/route'))
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
        urlDocumento: 'https://portal.test',
        urlBloqueada: 'https://malicioso.test',
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
        urlDocumento: 'https://portal.test',
        urlBloqueada: 'https://cdn-externo.test',
        disposicion: 'enforce',
      }),
    )
  })

  it('aplica tope de logs por ventana: más de 30 reportes seguidos no generan más de 30 logs y devuelven 204', async () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const payload = JSON.stringify({
      'csp-report': {
        'document-uri': 'https://portal.test/panel',
        'blocked-uri': 'https://malicioso.test/script.js',
        'effective-directive': 'script-src',
        'disposition': 'enforce',
      },
    })

    for (let i = 0; i < 35; i++) {
      const req = crearPeticion(payload)
      const res = await POST(req)
      expect(res.status).toBe(204)
    }

    expect(spyWarn).toHaveBeenCalledTimes(30)
  })
  it('limita bytes UTF-8 sin confiar en content-length', async () => {
    const res = await POST(crearPeticion(JSON.stringify({ texto: 'ñ'.repeat(6000) })))
    expect(res.status).toBe(413)
  })

  it('no registra rutas con datos personales ni URLs inválidas', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await POST(crearPeticion(JSON.stringify({ 'csp-report': {
      'document-uri': 'https://portal.test/persona/pepe@correo.test',
      'blocked-uri': 'correo-privado@ejemplo.test',
    } })))
    expect(JSON.stringify(aviso.mock.calls)).not.toContain('correo')
  })
})
