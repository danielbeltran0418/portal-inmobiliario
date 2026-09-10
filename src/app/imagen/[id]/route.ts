import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
export const dynamic = 'force-dynamic'
const cabeceras = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
export async function GET(_peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return new Response(null, { status: 404, headers: cabeceras })
  const { data, error } = await crearClientePublico().from('imagenes_propiedad')
    .select('ruta_storage,propiedades!inner(estado)').eq('id', id).maybeSingle()
  if (error) return new Response(null, { status: 503, headers: cabeceras })
  const propiedad = Array.isArray(data?.propiedades) ? data.propiedades[0] : data?.propiedades
  if (!data || propiedad?.estado !== 'publicada') return new Response(null, { status: 404, headers: cabeceras })
  // El cliente privilegiado solo firma la ruta previamente autorizada por la lectura anónima.
  // Una firma ya emitida sigue siendo válida hasta expirar, aunque se pause la propiedad.
  const { data: firma, error: errorFirma } = await crearClienteAdmin().storage.from('propiedades').createSignedUrl(data.ruta_storage, 60)
  if (errorFirma || !firma) return new Response(null, { status: 503, headers: cabeceras })
  return new Response(null, { status: 307, headers: { ...cabeceras, Location: firma.signedUrl } })
}
