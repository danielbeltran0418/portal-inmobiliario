import type { SupabaseClient } from '@supabase/supabase-js'

export interface MetricasEmbudo {
  propiedades: {
    total: number
    publicadas: number
    borradores: number
    rechazadas: number
    destacadas: number
  }
  leads: {
    total: number
    nuevos: number
    aceptados: number
    descartados: number
    tasaConversion: number // porcentaje 0-100
  }
  citas: {
    total: number
    confirmadas: number
    canceladas: number
    completadas: number
    tasaAgendamiento: number // citas confirmadas / leads aceptados (0-100)
  }
  posicionamiento: {
    acuerdosTotales: number
    acuerdosActivos: number
    montoRecaudadoCOP: number
  }
}

export interface MetricasIA {
  conversacionesTotales: number
  conversacionesCerradas: number
  mensajesTotales: number
  mensajesPorRol: {
    usuario: number
    asistente: number
    sistema: number
  }
  tokensEstimados: {
    entrada: number
    salida: number
    total: number
  }
  costoEstimadoUSD: number
  incidentesRateLimit: number
}

/**
 * Calcula las métricas comerciales del embudo (funnel) de la plataforma inmobiliaria.
 */
export async function consultarMetricasEmbudo(
  cliente: SupabaseClient,
): Promise<MetricasEmbudo> {
  // 1. Conteo de propiedades
  const { data: props } = await cliente
    .from('propiedades')
    .select('estado, destacada')

  const propiedadesList = props ?? []
  const propPublicadas = propiedadesList.filter((p) => p.estado === 'publicada').length
  const propBorradores = propiedadesList.filter((p) => p.estado === 'borrador').length
  const propRechazadas = propiedadesList.filter((p) => p.estado === 'rechazada' || p.estado === 'pausada').length
  const propDestacadas = propiedadesList.filter((p) => p.destacada === true).length

  // 2. Conteo de leads
  const { data: leads } = await cliente
    .from('leads')
    .select('estado')

  const leadsList = leads ?? []
  const leadsNuevos = leadsList.filter((l) => l.estado === 'nuevo').length
  const leadsAceptados = leadsList.filter((l) => l.estado === 'aceptado').length
  const leadsDescartados = leadsList.filter((l) => l.estado === 'descartado').length
  const leadsTotales = leadsList.length

  const tasaConversion = leadsTotales > 0
    ? Number(((leadsAceptados / leadsTotales) * 100).toFixed(1))
    : 0

  // 3. Conteo de citas
  const { data: citas } = await cliente
    .from('citas')
    .select('estado')

  const citasList = citas ?? []
  const citasConfirmadas = citasList.filter((c) => c.estado === 'confirmada').length
  const citasCanceladas = citasList.filter((c) => c.estado === 'cancelada').length
  const citasCompletadas = citasList.filter((c) => c.estado === 'completada').length
  const citasTotales = citasList.length

  const tasaAgendamiento = leadsAceptados > 0
    ? Number(((citasConfirmadas / leadsAceptados) * 100).toFixed(1))
    : 0

  // 4. Conteo de acuerdos de posicionamiento
  const { data: pagos } = await cliente
    .from('pagos_posicionamiento')
    .select('monto, estado')

  const pagosList = pagos ?? []
  const acuerdosActivos = pagosList.filter((p) => p.estado === 'activo').length
  const montoRecaudado = pagosList.reduce((acc, p) => acc + (Number(p.monto) || 0), 0)

  return {
    propiedades: {
      total: propiedadesList.length,
      publicadas: propPublicadas,
      borradores: propBorradores,
      rechazadas: propRechazadas,
      destacadas: propDestacadas,
    },
    leads: {
      total: leadsTotales,
      nuevos: leadsNuevos,
      aceptados: leadsAceptados,
      descartados: leadsDescartados,
      tasaConversion,
    },
    citas: {
      total: citasTotales,
      confirmadas: citasConfirmadas,
      canceladas: citasCanceladas,
      completadas: citasCompletadas,
      tasaAgendamiento,
    },
    posicionamiento: {
      acuerdosTotales: pagosList.length,
      acuerdosActivos,
      montoRecaudadoCOP: montoRecaudado,
    },
  }
}

/**
 * Calcula las métricas y telemetría de agentes de IA y estimación de consumo de tokens.
 */
export async function consultarMetricasIA(
  cliente: SupabaseClient,
): Promise<MetricasIA> {
  // 1. Conversaciones
  const { data: convs } = await cliente
    .from('conversaciones_ia')
    .select('estado')

  const convList = convs ?? []
  const conversacionesTotales = convList.length
  const conversacionesCerradas = convList.filter((c) => c.estado === 'cerrada').length

  // 2. Mensajes
  const { data: msgs } = await cliente
    .from('mensajes_ia')
    .select('rol, contenido, metadatos')

  const msgList = msgs ?? []
  const msgUsuario = msgList.filter((m) => m.rol === 'usuario').length
  const msgAsistente = msgList.filter((m) => m.rol === 'asistente').length
  const msgSistema = msgList.filter((m) => m.rol === 'sistema').length

  // Estimación de tokens: 1 token aprox. 4 caracteres
  let tokensEntrada = 0
  let tokensSalida = 0

  for (const m of msgList) {
    const longitud = (m.contenido || '').length
    const tokensEstimados = Math.ceil(longitud / 4)
    if (m.rol === 'asistente') {
      tokensSalida += tokensEstimados
    } else {
      tokensEntrada += tokensEstimados
    }
  }

  const tokensTotales = tokensEntrada + tokensSalida

  // Tarifa combinada de referencia: ~$0.20 / 1M input, ~$0.80 / 1M output
  const costoEstimadoUSD = Number(
    ((tokensEntrada / 1_000_000) * 0.2 + (tokensSalida / 1_000_000) * 0.8).toFixed(4),
  )

  // 3. Incidentes de rate limit en registro_auditoria
  const { count: incidentes } = await cliente
    .from('registro_auditoria')
    .select('*', { count: 'exact', head: true })
    .in('accion', ['bloqueo_por_intentos', 'ia_limite_alcanzado'])

  return {
    conversacionesTotales,
    conversacionesCerradas,
    mensajesTotales: msgList.length,
    mensajesPorRol: {
      usuario: msgUsuario,
      asistente: msgAsistente,
      sistema: msgSistema,
    },
    tokensEstimados: {
      entrada: tokensEntrada,
      salida: tokensSalida,
      total: tokensTotales,
    },
    costoEstimadoUSD,
    incidentesRateLimit: incidentes ?? 0,
  }
}
