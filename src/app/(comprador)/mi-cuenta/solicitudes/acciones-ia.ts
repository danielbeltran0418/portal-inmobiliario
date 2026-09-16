'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'

export interface ResultadoMensajeComprador {
  ok: boolean
  error?: string
  codigo?: string
  status?: number
  respuesta?: string
}

export async function enviarMensajeComprador(
  conversacionId: string,
  contenido: string,
): Promise<ResultadoMensajeComprador> {
  const textoLimpio = contenido.trim()
  if (!textoLimpio) {
    return { ok: false, error: 'El mensaje no puede estar vacío' }
  }

  const supabase = await crearClienteServidor()
  const { data } = await supabase.auth.getUser()
  const usuario = data?.user
  if (!usuario) {
    return { ok: false, error: 'No autenticado' }
  }

  // 1. Validar conversacion y pertenencia
  const { data: conv, error: errConv } = await supabase
    .from('conversaciones_ia')
    .select('id, lead_id, comprador_id, vendedor_id, propiedad_id, estado_conversacion')
    .eq('id', conversacionId)
    .eq('comprador_id', usuario.id)
    .maybeSingle()

  if (errConv || !conv) {
    return { ok: false, error: 'Conversación no encontrada' }
  }

  // 2. Comprobar limites de abuso (§10)
  try {
    const { verificarLimitesConversacion } = await import('@/lib/ia/limites')
    await verificarLimitesConversacion(conversacionId, usuario.id)
  } catch (err: unknown) {
    const errObj = err as { status?: number; codigo?: string; message?: string }
    if (errObj.status === 429) {
      return {
        ok: false,
        error: 'Por favor espera un momento antes de enviar otro mensaje.',
        codigo: '429',
        status: 429,
      }
    }
    if (errObj.codigo === 'IA_TOPE_TURNOS' || errObj.message?.includes('10 turnos')) {
      return {
        ok: false,
        error: 'Has alcanzado el límite de turnos para esta conversación.',
        codigo: 'IA_TOPE_TURNOS',
      }
    }
    return { ok: false, error: errObj.message ?? 'Límite excedido' }
  }

  const { crearClienteAdmin } = await import('@/lib/supabase/cliente-admin')
  const admin = crearClienteAdmin()

  // 3. Insertar mensaje del comprador
  await admin.from('mensajes_ia').insert({
    conversacion_id: conversacionId,
    comprador_id: usuario.id,
    vendedor_id: conv.vendedor_id,
    emisor: 'comprador',
    contenido: textoLimpio,
    tokens_entrada: 0,
    tokens_salida: 0,
    modelo: 'usuario',
  })

  // 4. Inferencia con GPT-5.6 Luna
  let respuestaTexto = 'He recibido tu mensaje. Estamos procesando tu solicitud.'
  try {
    const { construirSystemPrompt } = await import('@/lib/ia/prompts')
    const { ejecutarInferenciaIA } = await import('@/lib/ia/cliente')
    const { HERRAMIENTAS_IA } = await import('@/lib/ia/tipos')

    // Obtener propiedad
    const { data: prop } = await admin
      .from('propiedades')
      .select('titulo, tipo_inmueble, operacion, precio, moneda, habitaciones, banos, area_m2, descripcion, barrio:barrios(nombre)')
      .eq('id', conv.propiedad_id)
      .single()

    const ficha = {
      titulo: prop?.titulo ?? 'Inmueble en Bogotá',
      tipo_inmueble: prop?.tipo_inmueble ?? 'apartamento',
      operacion: prop?.operacion ?? 'venta',
      precio: prop?.precio ?? 0,
      moneda: prop?.moneda ?? 'COP',
      habitaciones: prop?.habitaciones,
      banos: prop?.banos,
      area_m2: prop?.area_m2,
      descripcion: prop?.descripcion,
      barrio: (prop?.barrio as unknown as { nombre: string } | null)?.nombre,
    }

    const systemPrompt = construirSystemPrompt(ficha)

    // Obtener historial
    const { data: historial } = await admin
      .from('mensajes_ia')
      .select('emisor, contenido, creado_en')
      .eq('conversacion_id', conversacionId)
      .order('creado_en', { ascending: true })

    const mensajesInferencia = [
      { rol: 'system' as const, contenido: systemPrompt },
      ...(historial ?? []).map((h) => ({
        rol: (h.emisor === 'agente_ia' ? 'assistant' : 'user') as 'assistant' | 'user',
        contenido: h.contenido,
      })),
    ]

    const respuestaIA = await ejecutarInferenciaIA(mensajesInferencia, HERRAMIENTAS_IA)
    respuestaTexto = respuestaIA.texto || 'Mensaje procesado con éxito.'

    // Si hubo tool_calls de agendamiento
    for (const tc of respuestaIA.tool_calls) {
      if (tc.function.name === 'solicitar_agendamiento' || tc.function.name === 'proponer_cita') {
        try {
          const args = JSON.parse(tc.function.arguments)
          const { procesarSolicitudFranja } = await import('@/lib/ia/agendamiento')
          await procesarSolicitudFranja(conversacionId, args.franja_inicio_iso)
        } catch (e) {
          console.warn('[IA] Error procesando tool agendamiento:', e)
        }
      }
    }

    // Insertar respuesta del agente
    await admin.from('mensajes_ia').insert({
      conversacion_id: conversacionId,
      comprador_id: usuario.id,
      vendedor_id: conv.vendedor_id,
      emisor: 'agente_ia',
      contenido: respuestaTexto,
      tokens_entrada: respuestaIA.tokens.prompt_tokens,
      tokens_salida: respuestaIA.tokens.completion_tokens,
      modelo: respuestaIA.modeloUtilizado,
    })
  } catch (errInferencia) {
    console.warn('[IA] Error en inferencia de respuesta:', errInferencia)
  }

  revalidatePath('/mi-cuenta')
  return { ok: true, respuesta: respuestaTexto }
}
