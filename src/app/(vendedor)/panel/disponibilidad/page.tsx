import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { leerDisponibilidad, leerFechasBloqueadas } from '@/lib/citas/consultas'
import { Desbloquear, EliminarFranja, FormularioBloqueo, FormularioFranja } from './formularios'
import { horaCorta, nombreDia } from './opciones'

export const metadata: Metadata = {
  title: 'Disponibilidad | Portal Inmobiliario',
  description: 'Define tu horario semanal de visitas y bloquea las fechas en que no puedes atender.',
  robots: { index: false, follow: false },
}

export default async function PaginaDisponibilidad() {
  // El middleware ya protege /panel/*; se repite por la misma razon que
  // panel/leads/page.tsx. El id sale de sesionActual(), la unica lectura.
  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const supabase = await crearClienteServidor()
  const [franjas, bloqueos] = await Promise.all([
    leerDisponibilidad(supabase, sesion.idUsuario),
    leerFechasBloqueadas(supabase, sesion.idUsuario),
  ])

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/panel" className="text-sm text-marca hover:underline">Volver al panel</Link>
      <h1 className="mt-2 text-3xl font-semibold text-tinta">Disponibilidad</h1>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-tinta">Horario semanal</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Las visitas duran una hora y empiezan en punto. Las horas son de Colombia.
        </p>
        <div className="mt-4"><FormularioFranja /></div>
        {franjas.length === 0 ? (
          <p className="mt-4 text-tinta-suave">Todavía no has definido tu horario: nadie puede reservarte visitas.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {franjas.map((franja) => (
              <li key={franja.id}
                className="flex items-center justify-between rounded-md border border-linea bg-superficie px-4 py-2">
                <span className="text-tinta">
                  {nombreDia(franja.dia_semana)} · {horaCorta(franja.hora_inicio)} – {horaCorta(franja.hora_fin)}
                </span>
                <EliminarFranja id={franja.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-tinta">Fechas bloqueadas</h2>
        <p className="mt-1 text-sm text-tinta-suave">Esos días no se ofrece ninguna franja.</p>
        <div className="mt-4"><FormularioBloqueo /></div>
        {bloqueos.length > 0 && (
          <ul className="mt-4 space-y-2">
            {bloqueos.map((bloqueo) => (
              <li key={bloqueo.id}
                className="flex items-center justify-between rounded-md border border-linea bg-superficie px-4 py-2">
                <span className="cifra text-tinta">
                  {bloqueo.desde === bloqueo.hasta ? bloqueo.desde : `${bloqueo.desde} a ${bloqueo.hasta}`}
                </span>
                <Desbloquear id={bloqueo.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
