import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { listarCitasDelVendedor } from '@/lib/citas/consultas'
import { formatearFechaHora } from '@/lib/fechas/formato'
import { AccionesCita } from '@/componentes/citas/acciones-cita'

export const metadata: Metadata = {
  title: 'Visitas | Portal Inmobiliario',
  description: 'Las visitas que los compradores reservaron en tus propiedades.',
  robots: { index: false, follow: false },
}

export default async function PaginaCitasVendedor() {
  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const citas = await listarCitasDelVendedor(await crearClienteServidor(), sesion.idUsuario)
  const confirmadas = citas.filter((cita) => cita.estado === 'confirmada')
  const canceladas = citas.filter((cita) => cita.estado === 'cancelada')

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/panel" className="text-sm text-marca hover:underline">Volver al panel</Link>
      <h1 className="mt-2 text-3xl font-semibold text-tinta">Visitas</h1>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-tinta">Confirmadas</h2>
        {confirmadas.length === 0 ? (
          <p className="mt-4 text-tinta-suave">No tienes visitas confirmadas.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {confirmadas.map((cita) => (
              <li key={cita.id} className="rounded-md border border-linea bg-superficie p-5">
                <p className="text-sm text-tinta-tenue">{cita.tituloPropiedad ?? 'Propiedad'}</p>
                <p className="mt-1 font-medium text-tinta">{cita.nombreComprador ?? 'Comprador'}</p>
                <p className="cifra mt-1 text-tinta">{formatearFechaHora(cita.inicio)}</p>
                <AccionesCita citaId={cita.id} rutaMover={`/panel/citas/${cita.id}/mover`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {canceladas.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-tinta">Canceladas</h2>
          <ul className="mt-4 space-y-3">
            {canceladas.map((cita) => (
              <li key={cita.id} className="rounded-md border border-linea p-4 text-tinta-suave">
                <p>{cita.tituloPropiedad ?? 'Propiedad'} · {cita.nombreComprador ?? 'Comprador'}</p>
                <p className="cifra text-sm">{formatearFechaHora(cita.inicio)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
