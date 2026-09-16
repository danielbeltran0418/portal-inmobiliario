import 'server-only';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';
import { construirSystemPrompt, DatosFichaPropiedad } from './prompts';
import { ejecutarInferenciaIA } from './cliente';
import { HERRAMIENTAS_IA, MensajeHistorial } from './tipos';

export interface ResultadoDespacho {
  conversacionId: string;
  respuestaAgente: string | null;
}

export async function procesarLeadIndividual(leadId: string): Promise<ResultadoDespacho | null> {
  const admin = crearClienteAdmin();

  // 1. Idempotencia estricta: comprobar si ya existe conversacion para este lead
  const { data: convExistente } = await admin
    .from('conversaciones_ia')
    .select('id')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (convExistente) {
    return null;
  }

  // 2. Obtener datos del lead y su propiedad
  const { data: lead, error: errLead } = await admin
    .from('leads')
    .select(`
      id,
      propiedad_id,
      comprador_id,
      vendedor_id,
      mensaje,
      estado,
      propiedades (
        id,
        titulo,
        tipo_inmueble,
        operacion,
        precio,
        moneda,
        habitaciones,
        banos,
        area_m2,
        descripcion,
        barrio:barrios(nombre)
      )
    `)
    .eq('id', leadId)
    .single();

  if (errLead || !lead) {
    console.warn('[IA] Lead no encontrado para procesamiento:', leadId);
    return null;
  }

  // 3. Crear conversacion_ia
  const { data: conv, error: errConv } = await admin
    .from('conversaciones_ia')
    .insert({
      lead_id: lead.id,
      propiedad_id: lead.propiedad_id,
      comprador_id: lead.comprador_id,
      vendedor_id: lead.vendedor_id,
      estado_conversacion: 'activa',
    })
    .select('id')
    .single();

  if (errConv || !conv) {
    console.error('[IA] Error creando conversaciones_ia:', errConv);
    return null;
  }

  // 4. Insertar mensaje inicial del comprador en mensajes_ia
  await admin.from('mensajes_ia').insert({
    conversacion_id: conv.id,
    comprador_id: lead.comprador_id,
    vendedor_id: lead.vendedor_id,
    emisor: 'comprador',
    contenido: lead.mensaje,
    tokens_entrada: 0,
    tokens_salida: 0,
    modelo: 'usuario',
  });

  // 5. Inferencia inicial de atencion con GPT-5.6 Luna
  const prop = (lead.propiedades as unknown) as {
    titulo: string;
    tipo_inmueble: string;
    operacion: string;
    precio: number;
    moneda: string;
    habitaciones?: number | null;
    banos?: number | null;
    area_m2?: number | null;
    descripcion?: string | null;
    barrio?: { nombre: string } | null;
  };

  const ficha: DatosFichaPropiedad = {
    titulo: prop?.titulo ?? 'Inmueble en Bogotá',
    tipo_inmueble: prop?.tipo_inmueble ?? 'apartamento',
    operacion: prop?.operacion ?? 'venta',
    precio: prop?.precio ?? 0,
    moneda: prop?.moneda ?? 'COP',
    habitaciones: prop?.habitaciones,
    banos: prop?.banos,
    area_m2: prop?.area_m2,
    descripcion: prop?.descripcion,
    barrio: prop?.barrio?.nombre,
  };

  const systemPrompt = construirSystemPrompt(ficha);
  const mensajes: MensajeHistorial[] = [
    { rol: 'system', contenido: systemPrompt },
    { rol: 'user', contenido: lead.mensaje },
  ];

  let respuestaTexto =
    'Hola, he recibido tu mensaje sobre esta propiedad. Con gusto atenderé tus dudas y coordinaremos una visita.';
  let tokensEntrada = 100;
  let tokensSalida = 50;
  let modeloUsado = 'gpt-5.6-luna';
  let toolCallsStr: string | null = null;

  try {
    const respuesta = await ejecutarInferenciaIA(mensajes, HERRAMIENTAS_IA);
    respuestaTexto =
      respuesta.texto ??
      (respuesta.tool_calls.length > 0
        ? 'He revisado tu consulta. Estoy coordinando la información solicitada.'
        : respuestaTexto);
    tokensEntrada = respuesta.tokens.prompt_tokens;
    tokensSalida = respuesta.tokens.completion_tokens;
    modeloUsado = respuesta.modeloUtilizado;
    toolCallsStr = respuesta.tool_calls.length > 0 ? JSON.stringify(respuesta.tool_calls) : null;
  } catch (errInferencia) {
    console.warn(
      '[IA] Inferencia en modo contingencia:',
      errInferencia instanceof Error ? errInferencia.message : String(errInferencia)
    );
  }

  // 6. Insertar respuesta del agente en mensajes_ia
  await admin.from('mensajes_ia').insert({
    conversacion_id: conv.id,
    comprador_id: lead.comprador_id,
    vendedor_id: lead.vendedor_id,
    emisor: 'agente_ia',
    contenido: respuestaTexto,
    tokens_entrada: tokensEntrada,
    tokens_salida: tokensSalida,
    modelo: modeloUsado,
    tool_calls: toolCallsStr,
  });

  // 7. Auditoria de lead atendido
  await admin.rpc('registrar_evento_auditoria', {
    p_accion: 'ia_lead_atendido',
    p_entidad: 'conversaciones_ia',
    p_entidad_id: conv.id,
    p_actor_id: lead.comprador_id,
    p_metadatos: {
      lead_id: lead.id,
      modelo: modeloUsado,
    },
    p_ip: null,
  });

  return {
    conversacionId: conv.id,
    respuestaAgente: respuestaTexto,
  };
}

export async function procesarLeadsNuevos(limite = 20): Promise<number> {
  const admin = crearClienteAdmin();

  const { data: convs } = await admin.from('conversaciones_ia').select('lead_id');
  const idsConConversacion = new Set((convs ?? []).map((c) => c.lead_id));

  const { data: leads, error } = await admin
    .from('leads')
    .select('id, propiedad_id, propiedades!inner(id)')
    .eq('estado', 'nuevo')
    .order('creado_en', { ascending: false })
    .limit(300);

  if (error || !leads || leads.length === 0) {
    return 0;
  }

  const pendientes = leads.filter((l) => !idsConConversacion.has(l.id)).slice(0, limite);

  let procesados = 0;
  for (const item of pendientes) {
    const res = await procesarLeadIndividual(item.id);
    if (res !== null) {
      procesados++;
    }
  }

  return procesados;
}