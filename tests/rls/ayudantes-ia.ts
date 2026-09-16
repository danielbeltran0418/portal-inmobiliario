import { clienteAdmin } from './ayudantes'
import {
  crearCompradorConLead,
  crearVendedorConPropiedad,
  PASSWORD,
  comoUsuario,
} from './ayudantes-citas'

export { PASSWORD, comoUsuario }

export async function insertarConversacionDirecta(datos: {
  leadId: string
  propiedadId: string
  compradorId: string
  vendedorId: string
  estadoConversacion?: 'activa' | 'calificada' | 'cita_propuesta' | 'cita_confirmada' | 'cerrada'
  franjaPropuesta?: string
  resumenCalificacion?: string
}): Promise<string> {
  const { data, error } = await clienteAdmin()
    .from('conversaciones_ia')
    .insert({
      lead_id: datos.leadId,
      propiedad_id: datos.propiedadId,
      comprador_id: datos.compradorId,
      vendedor_id: datos.vendedorId,
      estado_conversacion: datos.estadoConversacion ?? 'activa',
      franja_propuesta: datos.franjaPropuesta ?? null,
      resumen_calificacion: datos.resumenCalificacion ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function insertarMensajeDirecto(datos: {
  conversacionId: string
  compradorId: string
  vendedorId: string
  emisor: 'comprador' | 'agente_ia' | 'vendedor' | 'sistema'
  contenido: string
  tokensEntrada?: number
  tokensSalida?: number
  modelo?: string
  toolCalls?: unknown
}): Promise<string> {
  const { data, error } = await clienteAdmin()
    .from('mensajes_ia')
    .insert({
      conversacion_id: datos.conversacionId,
      comprador_id: datos.compradorId,
      vendedor_id: datos.vendedorId,
      emisor: datos.emisor,
      contenido: datos.contenido,
      tokens_entrada: datos.tokensEntrada ?? 100,
      tokens_salida: datos.tokensSalida ?? 50,
      modelo: datos.modelo ?? 'gpt-5.6-luna',
      tool_calls: datos.toolCalls ? JSON.stringify(datos.toolCalls) : null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function escenarioIA() {
  const vendedor = await crearVendedorConPropiedad()
  const comprador = await crearCompradorConLead(vendedor, 'nuevo')
  const conversacionId = await insertarConversacionDirecta({
    leadId: comprador.leadId,
    propiedadId: vendedor.propiedadId,
    compradorId: comprador.id,
    vendedorId: vendedor.id,
  })
  const mensajeId = await insertarMensajeDirecto({
    conversacionId,
    compradorId: comprador.id,
    vendedorId: vendedor.id,
    emisor: 'agente_ia',
    contenido: 'Hola, soy el asistente virtual de la propiedad. ¿En que puedo ayudarte?',
  })
  return { vendedor, comprador, conversacionId, mensajeId }
}
