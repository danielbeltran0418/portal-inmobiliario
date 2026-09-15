import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { obtenerCitaDeParticipante, obtenerFranjasLibres } from '@/lib/citas/consultas'
import { agruparFranjasPorDia } from '@/lib/citas/agrupar'
import { formatearFechaHora } from '@/lib/fechas/formato'
import { esquemaIdentificador } from '@/lib/validacion/esquemas'
import { SelectorFranjas } from '@/componentes/citas/selector-franjas'

export const metadata: Metadata = {
  title: 'Mover visita | Portal Inmobiliario',
  description: 'Elige una nueva franja para la visita.',
  robots: { index: false, follow: false },
}

export default async function PaginaMoverCitaVendedor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Un id que no es uuid haria fallar la consulta con 22P02 y la pagina con un 500.
  if (!esquemaIdentificador.safeParse({ id }).success) notFound()

  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const supabase = await crearClienteServidor()
  const cita = await obtenerCitaDeParticipante(supabase, id, sesion.idUsuario, 'vendedor')
  if (!cita || cita.estado !== 'confirmada') notFound()

  const grupos = agruparFranjasPorDia(await obtenerFranjasLibres(supabase, cita.vendedorId))

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/panel/citas" className="text-sm text-marca hover:underline">Volver a visitas</Link>
      <h1 className="mt-2 text-3xl font-semibold text-tinta">Mover visita</h1>
      <p className="cifra mt-2 text-tinta-suave">Ahora: {formatearFechaHora(cita.inicio)}</p>
      <div className="mt-6">
        <SelectorFranjas modo="mover" objetivoId={cita.id} grupos={grupos} volverA="/panel/citas" />
      </div>
    </main>
  )
}
