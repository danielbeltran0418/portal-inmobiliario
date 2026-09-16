import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { listarCitasDelVendedor } from '@/lib/citas/consultas'
import { listarCitasPropuestas } from '@/lib/ia/consultas'
import { formatearFechaHora } from '@/lib/fechas/formato'
import { AccionesCita } from '@/componentes/citas/acciones-cita'
import { BotonConfirmarPropuesta } from '@/components/panel/boton-confirmar-propuesta'

export const metadata: Metadata = {
  title: 'Visitas | Portal Inmobiliario',
  description: 'Las visitas que los compradores reservaron en tus propiedades.',
  robots: { index: false, follow: false },
}

export default async function PaginaCitasVendedor() {
  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const supabase = await crearClienteServidor()
  const [citas, propuestas] = await Promise.all([
    listarCitasDelVendedor(supabase, sesion.idUsuario),
    listarCitasPropuestas(supabase, sesion.idUsuario),
  ])

  const confirmadas = citas.filter((cita) => cita.estado === 'confirmada')
  const canceladas = citas.filter((cita) => cita.estado === 'cancelada')

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/panel" className="text-sm text-marca hover:underline">Volver al panel</Link>
      <h1 className="mt-2 text-3xl font-semibold text-tinta">Visitas</h1>

      {propuestas.length > 0 && (
        <section className="mt-8 rounded-lg border-2 border-emerald-500/30 bg-emerald-500/5 p-6" data-testid="seccion-citas-propuestas">
          <h2 className="text-xl font-semibold text-tinta">Propuestas pendientes de confirmación</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            El asistente virtual coordinó estas visitas con los compradores y están listas para tu confirmación en 1 clic.
          </p>
          <ul className="mt-4 space-y-4">
            {propuestas.map((p) => (
              <li key={p.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-md border border-linea bg-superficie p-5">
                <div>
                  <p className="text-sm text-tinta-tenue">{p.propiedad_titulo ?? 'Propiedad'}</p>
                  <p className="mt-1 font-medium text-tinta">{p.comprador_nombre ?? 'Comprador'}</p>
                  <p className="cifra mt-1 text-tinta">{formatearFechaHora(p.franja_propuesta)}</p>
                </div>
                <BotonConfirmarPropuesta conversacionId={p.conversacion_id} franjaInicio={p.franja_propuesta} />
              </li>
            ))}
          </ul>
        </section>
      )}

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
                <AccionesCita citaId={cita.id} rutaMover={'/panel/citas/' + cita.id + '/mover'} />
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