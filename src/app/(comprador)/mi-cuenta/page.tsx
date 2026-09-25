import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/auth/sesion';
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor';
import { listarSolicitudesDelComprador } from '@/lib/citas/consultas';
import { listarConversacionesComprador } from '@/lib/ia/consultas';
import { formatearFechaHora } from '@/lib/fechas/formato';
import { AccionesCita } from '@/componentes/citas/acciones-cita';
import { ChatLeadIA } from '@/components/mi-cuenta/chat-lead-ia';
import { esCambioTardio, miBloqueoDeCitas } from '@/lib/citas/faltas';

export const metadata: Metadata = {
  title: 'Mi cuenta | Portal Inmobiliario',
  description: 'Tu cuenta de comprador en el Portal Inmobiliario de Barranquilla.',
  robots: { index: false, follow: false },
};

const ETIQUETA_ESTADO = {
  nuevo: 'Pendiente de respuesta',
  aceptado: 'Aceptada',
  descartado: 'Descartada',
} as const;

export default async function PaginaMiCuenta() {
  const sesion = await sesionActual();
  if (!sesion.idUsuario) redirect('/login');

  const supabase = await crearClienteServidor();
  const [solicitudes, conversaciones, bloqueadoHasta] = await Promise.all([
    listarSolicitudesDelComprador(supabase, sesion.idUsuario),
    listarConversacionesComprador(supabase, sesion.idUsuario),
    miBloqueoDeCitas(supabase),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-tinta">Mi cuenta</h1>
      {bloqueadoHasta && (
        <p role="status" className="rounded-md border border-peligro bg-superficie p-4 text-sm text-peligro">
          Tienes 3 faltas por cancelar o mover visitas con menos de 8 horas de antelación. No puedes reservar
          visitas nuevas hasta el {formatearFechaHora(bloqueadoHasta)}.
        </p>
      )}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-tinta">Tus solicitudes y conversaciones con IA</h2>
        <span className="text-sm text-tinta-suave">
          {solicitudes.length} {solicitudes.length === 1 ? 'solicitud' : 'solicitudes'}
        </span>
      </div>

      {solicitudes.length === 0 ? (
        <div className="rounded-xl border border-linea bg-superficie p-8 text-center text-tinta-suave">
          Todavía no has contactado a ningún vendedor.
        </div>
      ) : (
        <ul className="space-y-4">
          {solicitudes.map((s) => {
            const conv = conversaciones[s.id];
            return (
              <li key={s.id} className="rounded-xl border border-linea bg-superficie p-5">
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
                    <AccionesCita
                      citaId={s.visita.id}
                      rutaMover={'/mi-cuenta/visitas/' + s.visita.id + '/mover'}
                      tardia={esCambioTardio(s.visita.inicio)}
                    />
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
