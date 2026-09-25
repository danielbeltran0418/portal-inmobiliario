import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { listarConversacionesComprador } from '@/lib/ia/consultas'
import { ChatLeadIA } from '@/components/mi-cuenta/chat-lead-ia'

export const metadata: Metadata = {
  title: 'Agendar visita | Portal Inmobiliario',
  robots: { index: false, follow: false },
}

/**
 * Destino del boton "Agendar visita" de la ficha: el chat con el asistente de
 * una sola solicitud, ya abierto. Es la misma conversacion que aparece en
 * /mi-cuenta, no otra.
 */
export default async function PaginaChatAgendamiento(
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params
  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const supabase = await crearClienteServidor()
  // Filtro explicito por comprador_id: leads tiene varias politicas de
  // lectura permisivas (ver la ficha publica), y esta pagina es del comprador.
  const { data: lead } = await supabase.from('leads')
    .select('id, propiedades(titulo)')
    .eq('id', leadId).eq('comprador_id', sesion.idUsuario).maybeSingle()
  if (!lead) notFound()

  const conversaciones = await listarConversacionesComprador(supabase, sesion.idUsuario)
  const conv = conversaciones[leadId]
  const titulo = (lead.propiedades as unknown as { titulo: string } | null)?.titulo ?? 'la propiedad'

  return (
    <div className="space-y-4">
      <Link href="/mi-cuenta" className="text-sm text-marca hover:underline">← Mis solicitudes</Link>
      <h1 className="text-2xl font-semibold text-tinta">Agendar visita: {titulo}</h1>
      <p className="text-sm text-tinta-suave">
        Pídele al asistente un horario. Solo te ofrecerá las horas que el propietario marcó como disponibles, y
        cuando la visita quede agendada le llegará un correo al propietario. Puedes cancelarla o moverla sin
        penalización hasta 8 horas antes.
      </p>
      {conv ? (
        <ChatLeadIA
          conversacionId={conv.id}
          mensajesIniciales={conv.mensajes}
          estadoConversacion={conv.estado_conversacion}
          franjaPropuesta={conv.franja_propuesta}
          abiertoInicial
        />
      ) : (
        <p className="rounded-md border border-linea bg-superficie p-6 text-tinta-suave">
          El asistente todavía está preparando tu conversación. Recarga la página en unos segundos.
        </p>
      )}
    </div>
  )
}
