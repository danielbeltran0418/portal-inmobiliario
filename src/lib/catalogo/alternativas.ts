import 'server-only'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import type { FiltrosCatalogo } from './filtros'
import type { PropiedadDeTarjeta } from '@/components/tarjeta-propiedad'

export type Alternativa = PropiedadDeTarjeta & { barrioSlug: string; barrioNombre: string }
export async function alternativasCiudad(ciudadSlug: string | null | undefined, filtros: FiltrosCatalogo, excluir: readonly string[]): Promise<Alternativa[]> {
  if (!ciudadSlug) return []
  try {
    const db = crearClientePublico()
    const { data: barrios, error: errorBarrios } = await db.from('barrios').select('id').eq('ciudad_slug', ciudadSlug).eq('activo', true).limit(100)
    if (errorBarrios || !barrios?.length) return []
    let consulta = db.from('propiedades').select('id,slug,titulo,operacion,tipo_inmueble,precio,moneda,habitaciones,banos,area_m2,estrato,parqueaderos,barrios!inner(slug,nombre),imagenes_propiedad!inner(id,alt_text,orden)').eq('estado', 'publicada').in('barrio_id', barrios.map((b) => b.id))
    if (filtros.tipo) consulta = consulta.eq('tipo_inmueble', filtros.tipo)
    if (filtros.operacion) consulta = consulta.eq('operacion', filtros.operacion)
    if (filtros.precioMin) consulta = consulta.gte('precio', filtros.precioMin * 0.8)
    if (filtros.precioMax) consulta = consulta.lte('precio', filtros.precioMax * 1.2)
    const ids = excluir.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0,12)
    if (ids.length) consulta = consulta.not('id','in',`(${ids.join(',')})`)
    const { data, error } = await consulta.order('actualizado_en', { ascending: false }).limit(3)
    if (error) return []
    return (data ?? []).flatMap((fila) => {
      const barrio = Array.isArray(fila.barrios) ? fila.barrios[0] : fila.barrios
      return barrio ? [{ ...fila, barrioSlug: barrio.slug, barrioNombre: barrio.nombre }] : []
    })
  } catch { return [] }
}