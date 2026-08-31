import 'server-only'
import type { NextRequest } from 'next/server'

/**
 * Origen absoluto para construir redirecciones.
 *
 * En PRODUCCION se usa siempre el valor configurado. Host y X-Forwarded-Host los
 * controla el cliente: derivar de ellos el destino de una redireccion en la ruta
 * de verificacion o en las guardas de sesion es inyeccion de cabecera Host de
 * manual -- un atacante cuyo X-Forwarded-Host no filtre el proxy podria llevarse
 * a la victima a su propio dominio o envenenar un enlace de correo.
 *
 * En DESARROLLO se deriva de la cabecera Host, y SOLO ahi, porque `next dev`
 * normaliza el origen de la peticion a `localhost` aunque el cliente entre por
 * 127.0.0.1 -- el host que usa site_url para los enlaces de correo. Cruzar de uno
 * a otro pierde la cookie de sesion, porque para el navegador son hosts distintos.
 * No se usa x-forwarded-host aqui: en desarrollo no hay proxy delante, asi que
 * Host solo es correcto y mas simple, y una entrada menos controlada por el
 * cliente es una cosa menos de la que hay que cuidarse.
 */
export function origenReal(peticion: NextRequest): string {
  const configurado = process.env.NEXT_PUBLIC_APP_URL

  if (process.env.NODE_ENV === 'production') {
    if (!configurado) {
      throw new Error('NEXT_PUBLIC_APP_URL es obligatoria en produccion')
    }
    return new URL(configurado).origin
  }

  const host = peticion.headers.get('host')
  if (!host) {
    return configurado ? new URL(configurado).origin : 'http://127.0.0.1:3000'
  }
  const protocolo = peticion.headers.get('x-forwarded-proto') ?? 'http'
  return `${protocolo}://${host}`
}
