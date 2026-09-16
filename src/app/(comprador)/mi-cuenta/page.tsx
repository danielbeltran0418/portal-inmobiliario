import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { listarSolicitudesDelComprador } from '@/lib/citas/consultas'
import { listarConversacionesComprador } from '@/lib/ia/consultas'
import { formatearFechaHora } from '@/lib/fechas/formato'
import { AccionesCita } from '@/componentes/citas/acciones-cita'
import { ChatLeadIA } from '@/components/mi-cuenta/chat-lead-ia'

export const metadata: Metadata = {
  title: 'Mi cuenta | Portal Inmobiliario',
  description: 'Tu cuenta de comprador en el Portal Inmobiliario de Barranquilla.',
  robots: { index: false, follow: false },
}

const ETIQUETA_ESTADO = {
  nuevo: 'Pendiente de respuesta',
  aceptado: 'Aceptada',
  descartado: 'Descartada',
} as const

export default async function PaginaMiCuenta() {
  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const supabase = await crearClienteServidor()
  const [solicitudes, conversaciones] = await Promise.all([
    listarSolicitudesDelComprador(supabase, sesion.idUsuario),
    listarConversacionesComprador(supabase, sesion.idUsuario),
  ])

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-tinta">Mi cuenta</h1>
      <h2 className="mt-8 text-xl font-semibold text-tinta">Tus solicitudes</h2>

      {solicitudes.length === 0 ? (
        <p className="mt-4 rounded-md border border-linea bg-superficie p-8 text-center text-tinta-suave">
          Todavía no has contactado a ningún vendedor.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {solicitudes.map((s) => {
            const conv = conversaciones[s.id]
            return (
              <li key={s.id} className="rounded-md border border-linea bg-superficie p-5">
                <p className="font-medium text-tinta">{s.tituloPropiedad ?? 'Propiedad'}</p>
                <p className="mt-1 text-sm text-tinta-suave">{ETIQUETA_ESTADO[s.estado]}</p>

                {s.visita ? (
                  <div className="mt-3">
                    <p className="text-tinta">
                      Visita confirmada: <span className="cifra">{formatearFechaHora(s.visita.inicio)}</span>
                    </p>
                    {s.direccion ? (
                      <p className="mt-1 text-tinta">Dirección: {s.direccion}</p>
                    ) : (
                      <p className="mt-1 text-sm text-tinta-suave">La dirección aparecerá 2 horas antes de la visita</p>
                    )}
                    <AccionesCita citaId={s.visita.id} rutaMover={'/mi-cuenta/visitas/' + s.visita.id + '/mover'} />
                  </div>
                ) : s.estado === 'aceptado' ? (
                  <Link
                    href={'/mi-cuenta/reservar/' + s.id}
                    className="mt-3 inline-block rounded-sm bg-marca px-4 py-1.5 text-sm font-medium text-marca-contraste hover:bg-marca-fuerte"
                  >
                    Reservar visita
                  </Link>
                ) : null}

                {conv && (
                  <ChatLeadIA
                    conversacionId={conv.id}
                    mensajesIniciales={conv.mensajes}
                    estadoConversacion={conv.estado_conversacion}
                    franjaPropuesta={conv.franja_propuesta}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
