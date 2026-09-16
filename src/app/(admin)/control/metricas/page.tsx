import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { consultarMetricasEmbudo, consultarMetricasIA } from '@/lib/admin/metricas'
import { GraficoEmbudo } from '@/components/admin/GraficoEmbudo'

export const dynamic = 'force-dynamic'

export default async function PaginaMetricas() {
  const supabase = await crearClienteServidor()
  const [embudo, ia] = await Promise.all([
    consultarMetricasEmbudo(supabase),
    consultarMetricasIA(supabase),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-titulo text-2xl font-bold tracking-tight text-tinta">
          Métricas de Negocio y Telemetría de IA
        </h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Supervisión cuantitativa de la tasa de conversión comercial y monitoreo del consumo de agentes autónomos.
        </p>
      </div>

      {/* Sección 1: Embudo Comercial */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-linea bg-superficie p-6 shadow-xs">
          <h2 className="text-base font-bold text-tinta">Embudo de Conversión de Clientes</h2>
          <p className="mt-1 text-xs text-tinta-suave">
            Progresión de usuarios desde el interés inicial hasta la visita física al inmueble.
          </p>
          <div className="mt-6">
            <GraficoEmbudo embudo={embudo} />
          </div>
        </div>

        <div className="rounded-xl border border-linea bg-superficie p-6 shadow-xs space-y-6">
          <h2 className="text-base font-bold text-tinta">Detalle Operativo del Embudo</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-superficie-alt p-4">
              <span className="text-xs text-tinta-tenue">Tasa Conversión Lead</span>
              <p className="mt-1 text-2xl font-bold text-marca">{embudo.leads.tasaConversion}%</p>
              <span className="text-xs text-tinta-suave">{embudo.leads.aceptados} de {embudo.leads.total} leads</span>
            </div>

            <div className="rounded-lg bg-superficie-alt p-4">
              <span className="text-xs text-tinta-tenue">Ratio de Agendamiento</span>
              <p className="mt-1 text-2xl font-bold text-marca">{embudo.citas.tasaAgendamiento}%</p>
              <span className="text-xs text-tinta-suave">{embudo.citas.confirmadas} confirmadas</span>
            </div>

            <div className="rounded-lg bg-superficie-alt p-4">
              <span className="text-xs text-tinta-tenue">Propiedades Publicadas</span>
              <p className="mt-1 text-2xl font-bold text-tinta">{embudo.propiedades.publicadas}</p>
              <span className="text-xs text-tinta-suave">{embudo.propiedades.destacadas} destacadas vigentes</span>
            </div>

            <div className="rounded-lg bg-superficie-alt p-4">
              <span className="text-xs text-tinta-tenue">Ingresos Posicionamiento</span>
              <p className="mt-1 text-2xl font-bold text-tinta">
                ${embudo.posicionamiento.montoRecaudadoCOP.toLocaleString('es-CO')}
              </p>
              <span className="text-xs text-tinta-suave">{embudo.posicionamiento.acuerdosActivos} activos</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sección 2: Telemetría de Agentes Inteligentes (IA) */}
      <div className="rounded-xl border border-linea bg-superficie p-6 shadow-xs">
        <h2 className="text-base font-bold text-tinta">Telemetría de Agentes de IA</h2>
        <p className="mt-1 text-xs text-tinta-suave">
          Consumo de tokens, interacción de turnos conversacionales y costo acumulado de inferencia.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-linea-suave bg-superficie-alt p-4">
            <span className="text-xs font-semibold text-tinta-tenue">Conversaciones Totales</span>
            <p className="mt-2 text-2xl font-bold text-tinta">{ia.conversacionesTotales}</p>
            <span className="text-xs text-tinta-suave">{ia.conversacionesCerradas} concluidas</span>
          </div>

          <div className="rounded-lg border border-linea-suave bg-superficie-alt p-4">
            <span className="text-xs font-semibold text-tinta-tenue">Mensajes Totales</span>
            <p className="mt-2 text-2xl font-bold text-tinta">{ia.mensajesTotales}</p>
            <span className="text-xs text-tinta-suave">
              {ia.mensajesPorRol.asistente} asistente / {ia.mensajesPorRol.usuario} usuario
            </span>
          </div>

          <div className="rounded-lg border border-linea-suave bg-superficie-alt p-4">
            <span className="text-xs font-semibold text-tinta-tenue">Tokens de Inferencia</span>
            <p className="mt-2 text-2xl font-bold text-tinta">{ia.tokensEstimados.total.toLocaleString()}</p>
            <span className="text-xs text-tinta-suave">
              {ia.tokensEstimados.entrada.toLocaleString()} in / {ia.tokensEstimados.salida.toLocaleString()} out
            </span>
          </div>

          <div className="rounded-lg border border-linea-suave bg-superficie-alt p-4">
            <span className="text-xs font-semibold text-tinta-tenue">Costo Estimado</span>
            <p className="mt-2 text-2xl font-bold text-marca-fuerte">${ia.costoEstimadoUSD} USD</p>
            <span className="text-xs text-tinta-suave">{ia.incidentesRateLimit} límites alcanzados</span>
          </div>
        </div>
      </div>
    </div>
  )
}
