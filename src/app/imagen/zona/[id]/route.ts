import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { urlMapaEstatico } from '@/lib/mapa/google'

export const dynamic = 'force-dynamic'

const SIN_CACHE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

/**
 * Imagen del mapa de la zona aproximada (Google Maps Static API), servida desde
 * nuestro dominio. La pide el servidor con GOOGLE_MAPS_API_KEY (y la firma con
 * GOOGLE_MAPS_SIGNING_SECRET si esta definido): la clave no llega al navegador.
 *
 * Solo hay imagen si zona_aproximada_propiedad() devuelve zona -- propiedad
 * publicada y con coordenadas --, y el centro que se le manda a Google ya es el
 * redondeado: el punto exacto tampoco sale hacia Google.
 *
 * Cache de un dia: la zona casi nunca cambia, y cada peticion a Google cuesta.
 */
export async function GET(_peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params
  const clave = process.env.GOOGLE_MAPS_API_KEY
  if (!UUID.test(id) || !clave) return new Response(null, { status: 404, headers: SIN_CACHE })

  const { data, error } = await crearClientePublico().rpc('zona_aproximada_propiedad', { p_propiedad_id: id })
  if (error) return new Response(null, { status: 503, headers: SIN_CACHE })
  const zona = (data as { latitud: number; longitud: number }[] | null)?.[0]
  if (!zona) return new Response(null, { status: 404, headers: SIN_CACHE })

  let respuesta: Response
  try {
    respuesta = await fetch(urlMapaEstatico(zona, clave, process.env.GOOGLE_MAPS_SIGNING_SECRET || undefined))
  } catch {
    return new Response(null, { status: 502, headers: SIN_CACHE })
  }
  const tipo = respuesta.headers.get('content-type') ?? ''
  if (!respuesta.ok || !tipo.startsWith('image/')) {
    // El cuerpo de error de Google puede traer la URL con la clave: no se reenvia.
    console.error('[mapa] Google Static Maps respondio', respuesta.status)
    return new Response(null, { status: 502, headers: SIN_CACHE })
  }

  return new Response(await respuesta.arrayBuffer(), {
    headers: {
      'Content-Type': tipo,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'X-Robots-Tag': 'noindex',
    },
  })
}
