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

interface AgregadosPanel {
  propiedades: { total: number; publicadas: number; borradores: number; pausadas_o_rechazadas: number; destacadas: number }
  leads: { total: number; nuevos: number; aceptados: number; descartados: number }
  citas: { total: number; confirmadas: number; canceladas: number; realizadas: number }
  posicionamiento: { total: number; activos: number; monto: number | string }
  conversaciones: { total: number; cerradas: number }
  mensajes: {
    total: number
    comprador: number
    agente_ia: number
    sistema: number
    tokens_entrada: number | string
    tokens_salida: number | string
  }
  incidentes_limite: number
}

// Las dos consultas de la pagina comparten un solo viaje a la base por cliente
// (por peticion): metricas_panel_control() lo devuelve todo de una vez.
const agregadosPorCliente = new WeakMap<SupabaseClient, Promise<AgregadosPanel>>()

/**
 * Agregados del panel calculados en la base (migracion 20261010000200). Antes
 * se descargaban tablas enteras -- incluido el texto de todos los mensajes de
 * la IA -- para contarlas aqui, y la parte de IA consultaba columnas que no
 * existen, asi que salia siempre en cero.
 */
function cargarAgregados(cliente: SupabaseClient): Promise<AgregadosPanel> {
  let pendiente = agregadosPorCliente.get(cliente)
  if (!pendiente) {
    pendiente = Promise.resolve(cliente.rpc('metricas_panel_control')).then(({ data, error }) => {
      if (error || !data) throw new Error(`No se pudieron cargar las metricas: ${error?.message ?? 'sin datos'}`)
      return data as AgregadosPanel
    })
    agregadosPorCliente.set(cliente, pendiente)
  }
  return pendiente
}

const porcentaje = (parte: number, total: number) =>
  total > 0 ? Number(((parte / total) * 100).toFixed(1)) : 0

/**
 * Calcula las métricas comerciales del embudo (funnel) de la plataforma inmobiliaria.
 */
export async function consultarMetricasEmbudo(
  cliente: SupabaseClient,
): Promise<MetricasEmbudo> {
  const a = await cargarAgregados(cliente)
  return {
    propiedades: {
      total: a.propiedades.total,
      publicadas: a.propiedades.publicadas,
      borradores: a.propiedades.borradores,
      rechazadas: a.propiedades.pausadas_o_rechazadas,
      destacadas: a.propiedades.destacadas,
    },
    leads: {
      total: a.leads.total,
      nuevos: a.leads.nuevos,
      aceptados: a.leads.aceptados,
      descartados: a.leads.descartados,
      tasaConversion: porcentaje(a.leads.aceptados, a.leads.total),
    },
    citas: {
      total: a.citas.total,
      confirmadas: a.citas.confirmadas,
      canceladas: a.citas.canceladas,
      // estado_cita solo tiene confirmada/cancelada: una visita "completada" es
      // una confirmada cuya hora ya paso.
      completadas: a.citas.realizadas,
      tasaAgendamiento: porcentaje(a.citas.confirmadas, a.leads.aceptados),
    },
    posicionamiento: {
      acuerdosTotales: a.posicionamiento.total,
      acuerdosActivos: a.posicionamiento.activos,
      montoRecaudadoCOP: Number(a.posicionamiento.monto) || 0,
    },
  }
}

// Tarifa combinada de referencia: ~$0.20 / 1M de entrada, ~$0.80 / 1M de salida.
const USD_POR_TOKEN_ENTRADA = 0.2 / 1_000_000
const USD_POR_TOKEN_SALIDA = 0.8 / 1_000_000

/**
 * Telemetría de los agentes de IA con los tokens REALES de cada mensaje
 * (mensajes_ia.tokens_entrada / tokens_salida), no una estimación por longitud.
 */
export async function consultarMetricasIA(
  cliente: SupabaseClient,
): Promise<MetricasIA> {
  const a = await cargarAgregados(cliente)
  const entrada = Number(a.mensajes.tokens_entrada) || 0
  const salida = Number(a.mensajes.tokens_salida) || 0
  return {
    conversacionesTotales: a.conversaciones.total,
    conversacionesCerradas: a.conversaciones.cerradas,
    mensajesTotales: a.mensajes.total,
    mensajesPorRol: {
      usuario: a.mensajes.comprador,
      asistente: a.mensajes.agente_ia,
      sistema: a.mensajes.sistema,
    },
    tokensEstimados: { entrada, salida, total: entrada + salida },
    costoEstimadoUSD: Number((entrada * USD_POR_TOKEN_ENTRADA + salida * USD_POR_TOKEN_SALIDA).toFixed(4)),
    incidentesRateLimit: a.incidentes_limite,
  }
}

export interface MesSerie {
  /** AAAA-MM, en hora de Colombia. */
  clave: string
  /** Mes abreviado para el eje, p. ej. "oct". */
  etiqueta: string
  leads: number
  citas: number
}

// Colombia no tiene horario de verano: UTC-5 todo el año. Un lead creado el
// 1 de octubre a las 03:00 UTC es del 30 de septiembre para quien lo mira.
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000

function claveMes(anio: number, mes0: number): string {
  return `${anio}-${String(mes0 + 1).padStart(2, '0')}`
}

function ventana(meses: number, hoy: Date) {
  const local = new Date(hoy.getTime() - DESFASE_COLOMBIA_MS)
  const lista: { clave: string; etiqueta: string }[] = []
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - i, 1))
    lista.push({
      clave: claveMes(d.getUTCFullYear(), d.getUTCMonth()),
      etiqueta: d.toLocaleDateString('es-CO', { month: 'short', timeZone: 'UTC' }).replace('.', ''),
    })
  }
  const primero = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - (meses - 1), 1))
  return { lista, desde: new Date(primero.getTime() + DESFASE_COLOMBIA_MS) }
}

/** Leads y citas creados por mes en los ultimos `meses` meses (incluido el actual). */
export function agruparPorMes(
  fechasLeads: readonly string[],
  fechasCitas: readonly string[],
  meses: number,
  hoy: Date = new Date(),
): MesSerie[] {
  const serie = ventana(meses, hoy).lista.map((m) => ({ ...m, leads: 0, citas: 0 }))
  const indice = new Map(serie.map((m) => [m.clave, m]))
  const contar = (fechas: readonly string[], campo: 'leads' | 'citas') => {
    for (const f of fechas) {
      const local = new Date(new Date(f).getTime() - DESFASE_COLOMBIA_MS)
      const mes = indice.get(claveMes(local.getUTCFullYear(), local.getUTCMonth()))
      if (mes) mes[campo]++
    }
  }
  contar(fechasLeads, 'leads')
  contar(fechasCitas, 'citas')
  return serie
}

/**
 * Serie del grafico "Leads y citas por mes". Solo se trae `creado_en` y solo
 * desde el inicio de la ventana: no se cargan las tablas enteras.
 */
export async function consultarSerieMensual(
  cliente: SupabaseClient,
  meses = 6,
  hoy: Date = new Date(),
): Promise<MesSerie[]> {
  const desde = ventana(meses, hoy).desde.toISOString()
  const [leads, citas] = await Promise.all([
    cliente.from('leads').select('creado_en').gte('creado_en', desde),
    cliente.from('citas').select('creado_en').gte('creado_en', desde),
  ])
  const fechas = (r: { data: { creado_en: string }[] | null }) => (r.data ?? []).map((f) => f.creado_en)
  return agruparPorMes(fechas(leads), fechas(citas), meses, hoy)
}
