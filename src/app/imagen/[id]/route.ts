import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
export const dynamic = 'force-dynamic'
const cabeceras = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

/**
 * Antes cada vista de cada foto pedia una firma nueva (60 s, no-store): la URL
 * firmada cambiaba siempre y ni el navegador ni la CDN reutilizaban nada.
 *
 * Ahora la firma dura 10 minutos y la REDIRECCION se puede cachear 5 (navegador
 * y CDN), siempre por debajo de la vida de la firma, asi que una redireccion
 * cacheada nunca apunta a una firma caducada. El precio, aceptado: al pausar
 * una propiedad, sus fotos pueden seguir cargando hasta 5 minutos -- antes ya
 * pasaba durante la vida de cada firma emitida. Los errores no se cachean.
 */
const SEGUNDOS_FIRMA = 600
const CACHE_REDIRECCION = 'public, max-age=300, s-maxage=300'
export async function GET(_peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return new Response(null, { status: 404, headers: cabeceras })
  const { data, error } = await crearClientePublico().from('imagenes_propiedad')
    .select('ruta_storage,propiedades!inner(estado)').eq('id', id).maybeSingle()
  if (error) return new Response(null, { status: 503, headers: cabeceras })
  const propiedad = Array.isArray(data?.propiedades) ? data.propiedades[0] : data?.propiedades
  if (!data || propiedad?.estado !== 'publicada') return new Response(null, { status: 404, headers: cabeceras })
  // El cliente privilegiado solo firma la ruta previamente autorizada por la lectura anónima.
  const { data: firma, error: errorFirma } = await crearClienteAdmin().storage.from('propiedades').createSignedUrl(data.ruta_storage, SEGUNDOS_FIRMA)
  // Un objeto ausente es un 404, no un 503: 503 significa "problema temporal,
  // reintentalo", y hace que el navegador y los rastreadores insistan sobre algo
  // que nunca va a aparecer. Solo un fallo real de Storage merece 503.
  if (errorFirma || !firma) {
    const noExiste = /not.?found/i.test(errorFirma?.message ?? '')
    return new Response(null, { status: noExiste ? 404 : 503, headers: cabeceras })
  }
  return new Response(null, {
    status: 307,
    headers: { 'Cache-Control': CACHE_REDIRECCION, 'X-Robots-Tag': 'noindex', Location: firma.signedUrl },
  })
}
