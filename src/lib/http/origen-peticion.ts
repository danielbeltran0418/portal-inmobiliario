import type { NextRequest } from 'next/server'

/**
 * En next dev (Next 16, con el proxy interno que reemplazo al "middleware"
 * file convention), peticion.url y peticion.nextUrl.origin quedan
 * canonicalizados al host propio del servidor de desarrollo (localhost),
 * incluso cuando el cliente en verdad llego por otro host -- 127.0.0.1, que
 * es exactamente el host que usa site_url en supabase/config.toml para los
 * enlaces de los correos locales. La cabecera Host (y x-forwarded-host
 * detras de un proxy) si conserva el host real de la peticion.
 *
 * Si una ruta arma una URL de redireccion ABSOLUTA a partir de peticion.url
 * en vez de esta funcion, el navegador termina saltando a un origen
 * distinto de aquel donde se fijaron las cookies de sesion (127.0.0.1 vs
 * localhost no comparten cookies aunque resuelvan al mismo servidor), y la
 * sesion recien creada se pierde en el salto. Verificado con logging
 * temporal contra el servidor real: hostHeader/x-forwarded-host mostraban
 * 127.0.0.1:3000 mientras nextUrlOrigin ya decia http://localhost:3000.
 */
export function origenReal(peticion: NextRequest): string {
  const host = peticion.headers.get('x-forwarded-host') ?? peticion.headers.get('host')
  const protocolo =
    peticion.headers.get('x-forwarded-proto') ?? new URL(peticion.url).protocol.replace(':', '')
  return `${protocolo}://${host}`
}
