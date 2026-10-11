import 'server-only'
import { after } from 'next/server'
import { headers } from 'next/headers'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
export async function registrarVisitaFicha(id: string) {
  if (process.env.METRICAS_PORTAL_ENABLED !== 'true') return
  const cabeceras = await headers()
  if (cabeceras.has('next-router-prefetch') || cabeceras.get('purpose') === 'prefetch') return
  after(async () => {
    const { error } = await crearClienteAdmin().rpc('registrar_visita_propiedad', { p_propiedad_id: id })
    if (error) console.error('[metricas] no se pudo registrar la consulta de ficha')
  })
}