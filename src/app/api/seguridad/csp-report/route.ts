import { NextResponse, type NextRequest } from 'next/server'

const LIMITE_TAMANO_BYTES = 10 * 1024 // 10 KB

/**
 * Elimina parámetros de consulta y fragmentos para evitar registrar tokens o datos personales.
 */
function limpiarUrl(urlStr: unknown): string {
  if (typeof urlStr !== 'string' || !urlStr) return ''
  try {
    const u = new URL(urlStr)
    return `${u.protocol}//${u.host}${u.pathname}`
  } catch {
    return urlStr.split('?')[0].split('#')[0]
  }
}

interface RegistroViolacionCsp {
  directiva: string
  urlDocumento: string
  urlBloqueada: string
  disposicion: string
}

function sanitizarCspReport(raw: Record<string, unknown>): RegistroViolacionCsp {
  return {
    directiva: String(raw['effective-directive'] || raw['violated-directive'] || 'desconocida'),
    urlDocumento: limpiarUrl(raw['document-uri']),
    urlBloqueada: limpiarUrl(raw['blocked-uri']),
    disposicion: String(raw['disposition'] || 'enforce'),
  }
}

function sanitizarReportingApi(raw: Record<string, unknown>): RegistroViolacionCsp {
  const body = (raw['body'] && typeof raw['body'] === 'object' ? raw['body'] : {}) as Record<string, unknown>
  return {
    directiva: String(body['effectiveDirective'] || 'desconocida'),
    urlDocumento: limpiarUrl(body['documentURL'] || raw['url']),
    urlBloqueada: limpiarUrl(body['blockedURL']),
    disposicion: String(body['disposition'] || 'enforce'),
  }
}

export async function POST(peticion: NextRequest): Promise<NextResponse> {
  const longitudEncabezado = peticion.headers.get('content-length')
  if (longitudEncabezado && parseInt(longitudEncabezado, 10) > LIMITE_TAMANO_BYTES) {
    return new NextResponse('Payload Too Large', { status: 413 })
  }

  let texto: string
  try {
    texto = await peticion.text()
  } catch {
    return new NextResponse('Error al leer cuerpo', { status: 400 })
  }

  if (texto.length > LIMITE_TAMANO_BYTES) {
    return new NextResponse('Payload Too Large', { status: 413 })
  }

  let cuerpo: unknown
  try {
    cuerpo = JSON.parse(texto)
  } catch {
    return new NextResponse('JSON inválido', { status: 400 })
  }

  const violaciones: RegistroViolacionCsp[] = []

  if (Array.isArray(cuerpo)) {
    // Formato moderno Reporting API (Reporting-Endpoints)
    for (const item of cuerpo) {
      if (item && typeof item === 'object') {
        violaciones.push(sanitizarReportingApi(item as Record<string, unknown>))
      }
    }
  } else if (cuerpo && typeof cuerpo === 'object') {
    const obj = cuerpo as Record<string, unknown>
    if (obj['csp-report'] && typeof obj['csp-report'] === 'object') {
      // Formato legacy application/csp-report
      violaciones.push(sanitizarCspReport(obj['csp-report'] as Record<string, unknown>))
    } else {
      violaciones.push(sanitizarReportingApi(obj))
    }
  }

  for (const v of violaciones) {
    console.warn('[Seguridad] Violación de CSP detectada:', {
      directiva: v.directiva,
      urlDocumento: v.urlDocumento,
      urlBloqueada: v.urlBloqueada,
      disposicion: v.disposicion,
    })
  }

  return new NextResponse(null, { status: 204 })
}
