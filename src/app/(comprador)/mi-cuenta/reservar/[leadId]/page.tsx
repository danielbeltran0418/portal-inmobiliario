import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { obtenerFranjasLibres, obtenerLeadParaReservar } from '@/lib/citas/consultas'
import { agruparFranjasPorDia } from '@/lib/citas/agrupar'
import { esquemaIdentificador } from '@/lib/validacion/esquemas'
import { MENSAJE_VISITA_LEAD_NO_ACEPTADO } from '@/lib/errores/mapear'
import { SelectorFranjas } from '@/components/citas/selector-franjas'

export const metadata: Metadata = {
  title: 'Reservar visita | Portal Inmobiliario',
  description: 'Elige una franja libre para visitar la propiedad.',
  robots: { index: false, follow: false },
}

export default async function PaginaReservarVisita({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  if (!esquemaIdentificador.safeParse({ id: leadId }).success) notFound()

  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const supabase = await crearClienteServidor()
  const lead = await obtenerLeadParaReservar(supabase, leadId, sesion.idUsuario)
  if (!lead) notFound()

  // Las franjas solo se piden para un lead aceptado. franjas_libres devolveria
  // de todos modos un conjunto vacio para uno que no lo esta.
  const grupos = lead.estado === 'aceptado'
    ? agruparFranjasPorDia(await obtenerFranjasLibres(supabase, lead.vendedorId))
    : []

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/mi-cuenta" className="text-sm text-tinta-suave transition-colors hover:text-tinta">← Volver a mi cuenta</Link>
      <h1 className="mt-3 font-titulo text-3xl font-semibold text-tinta">Reservar visita</h1>
      <p className="mt-1 text-tinta-suave">
        {lead.tituloPropiedad ?? 'Propiedad'} · Elige una franja libre de los próximos 14 días.
      </p>
      <div className="mt-6">
        {lead.estado === 'aceptado'
          ? <SelectorFranjas modo="reservar" objetivoId={lead.id} grupos={grupos} volverA="/mi-cuenta" />
          : <p className="rounded-2xl border border-linea bg-superficie p-6 text-tinta-suave">{MENSAJE_VISITA_LEAD_NO_ACEPTADO}</p>}
      </div>
    </main>
  )
}
