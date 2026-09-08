import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'

export const BUCKET_PROPIEDADES = 'propiedades'

/** Una hora. Se firma al renderizar; una recarga renueva. */
const SEGUNDOS_DE_VIGENCIA = 3600

/**
 * El bucket es privado desde la migracion 20260904000100. NUNCA construir una
 * URL publica de Storage: no serviria el archivo, y si el bucket volviera a ser
 * publico por error, expondria las fotos de los borradores.
 *
 * Usa crearClienteServidor() (no crearClienteAdmin()) a proposito: la firma
 * respeta RLS. Un vendedor que intente firmar la ruta de una imagen ajena no
 * recibe una URL utilizable -- ver tests/rls/imagenes-firmadas.test.ts, que fija
 * ese comportamiento de forma empirica.
 */
export async function firmarImagenes(rutas: string[]): Promise<Map<string, string>> {
  const firmadas = new Map<string, string>()
  if (rutas.length === 0) return firmadas

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.storage
    .from(BUCKET_PROPIEDADES)
    .createSignedUrls(rutas, SEGUNDOS_DE_VIGENCIA)

  if (error || !data) return firmadas

  for (const entrada of data) {
    if (entrada.signedUrl && entrada.path) firmadas.set(entrada.path, entrada.signedUrl)
  }
  return firmadas
}
