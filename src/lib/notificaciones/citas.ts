import 'server-only'
import { Resend } from 'resend'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
import { leerRango } from '@/lib/citas/rango'
import { formatearFechaHora } from '@/lib/fechas/formato'
import { HORAS_SIN_FALTA } from '@/lib/citas/faltas'

export type EventoCita = 'reservada' | 'movida' | 'cancelada'


interface FilaCita {
  id: string
  rango: string
  comprador_id: string
  vendedor_id: string
  propiedades: { titulo: string } | null
}

export interface CorreoCita {
  para: string
  asunto: string
  texto: string
  html: string
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Se avisa siempre a la otra parte de quien hizo el cambio. Una reserva la
 * hace el comprador (o el chatbot en su nombre), asi que le llega al
 * propietario; cuando es el vendedor quien aprueba la propuesta del chatbot,
 * le llega al comprador.
 */
export function destinatarioDe(
  actorId: string, cita: { comprador_id: string; vendedor_id: string },
): 'comprador' | 'vendedor' {
  return actorId === cita.vendedor_id ? 'comprador' : 'vendedor'
}

export function armarCorreoCita(datos: {
  evento: EventoCita
  para: string
  nombreDestinatario: string
  nombreOtraParte: string
  titulo: string
  inicio: string
}): CorreoCita {
  const cuando = formatearFechaHora(datos.inicio)
  const frases: Record<EventoCita, { asunto: string; cuerpo: string }> = {
    reservada: {
      asunto: `Nueva visita agendada: ${datos.titulo}`,
      cuerpo: `${datos.nombreOtraParte} agendó una visita a "${datos.titulo}" para el ${cuando}.`,
    },
    movida: {
      asunto: `Visita reprogramada: ${datos.titulo}`,
      cuerpo: `${datos.nombreOtraParte} cambió la visita a "${datos.titulo}". La nueva hora es el ${cuando}.`,
    },
    cancelada: {
      asunto: `Visita cancelada: ${datos.titulo}`,
      cuerpo: `${datos.nombreOtraParte} canceló la visita a "${datos.titulo}" que estaba prevista para el ${cuando}.`,
    },
  }
  const { asunto, cuerpo } = frases[datos.evento]
  const pie =
    `Recuerda: las visitas se pueden cancelar o mover hasta ${HORAS_SIN_FALTA} horas antes sin penalización. ` +
    'Con menos antelación se registra una falta, y 3 faltas en 30 días bloquean las citas durante 7 días.'

  return {
    para: datos.para,
    asunto,
    texto: [`Hola, ${datos.nombreDestinatario}:`, '', cuerpo, '', pie].join('\n'),
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <p>Hola, ${escaparHtml(datos.nombreDestinatario)}:</p>
        <p>${escaparHtml(cuerpo)}</p>
        <p style="margin-top:24px;font-size:12px;color:#6b7280;">${escaparHtml(pie)}</p>
      </div>`,
  }
}

/**
 * Avisa por correo del cambio en una visita. NUNCA lanza: la visita ya quedo
 * reservada, movida o cancelada en la base, y un fallo de correo no puede
 * deshacerlo ni mostrarse como error al usuario. Sin RESEND_API_KEY o
 * RESEND_FROM se limita a dejar constancia en el log.
 */
export async function avisarCita(citaId: string, evento: EventoCita, actorId: string): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.RESEND_FROM
    if (!apiKey || !from) {
      console.warn(`[citas] Sin RESEND_API_KEY/RESEND_FROM: no se aviso de la visita ${citaId} (${evento}).`)
      return
    }

    const admin = crearClienteAdmin()
    const { data, error } = await admin
      .from('citas')
      .select('id, rango, comprador_id, vendedor_id, propiedades(titulo)')
      .eq('id', citaId)
      .single()
    if (error || !data) throw error ?? new Error('Visita no encontrada')
    const cita = data as unknown as FilaCita

    const lado = destinatarioDe(actorId, cita)
    const idDestino = lado === 'vendedor' ? cita.vendedor_id : cita.comprador_id
    const idOtro = lado === 'vendedor' ? cita.comprador_id : cita.vendedor_id

    const [{ data: usuario }, { data: perfiles }] = await Promise.all([
      admin.auth.admin.getUserById(idDestino),
      admin.from('perfiles').select('id, nombre').in('id', [idDestino, idOtro]),
    ])
    const correoDestino = usuario?.user?.email
    if (!correoDestino) throw new Error(`El usuario ${idDestino} no tiene correo`)
    const nombre = (id: string) => perfiles?.find((p) => p.id === id)?.nombre ?? 'Usuario'

    const correo = armarCorreoCita({
      evento,
      para: correoDestino,
      nombreDestinatario: nombre(idDestino),
      nombreOtraParte: nombre(idOtro),
      titulo: cita.propiedades?.titulo ?? 'tu propiedad',
      inicio: leerRango(cita.rango).inicio,
    })

    const { error: errorEnvio } = await new Resend(apiKey).emails.send({
      from, to: [correo.para], subject: correo.asunto, text: correo.texto, html: correo.html,
    })
    if (errorEnvio) throw new Error(errorEnvio.message)
  } catch (err) {
    console.error(`[citas] No se pudo avisar de la visita ${citaId} (${evento}):`,
      err instanceof Error ? err.message : err)
  }
}
