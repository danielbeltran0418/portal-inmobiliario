import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { consultarMetricasEmbudo, consultarMetricasIA } from '@/lib/admin/metricas'

export const dynamic = 'force-dynamic'

export default async function PaginaControl() {
  const supabase = await crearClienteServidor()
  const [embudo, ia] = await Promise.all([
    consultarMetricasEmbudo(supabase),
    consultarMetricasIA(supabase),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-titulo text-3xl font-bold tracking-tight text-tinta">
          Resumen General del Sistema
        </h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Control integral de publicaciones, monetización, agentes inteligentes y trazabilidad.
        </p>
      </div>

      {/* Tarjetas de Indicadores Clave (KPIs) */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-linea bg-superficie p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
            Propiedades Activas
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-tinta">
              {embudo.propiedades.publicadas}
            </span>
            <span className="text-xs text-tinta-suave">
              de {embudo.propiedades.total} totales
            </span>
          </div>
          <p className="mt-1 text-xs text-marca font-medium">
            {embudo.propiedades.destacadas} destacadas vigentes
          </p>
        </div>

        <div className="rounded-xl border border-linea bg-superficie p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
            Embudo de Leads
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-tinta">
              {embudo.leads.total}
            </span>
            <span className="text-xs text-tinta-suave">
              leads recibidos
            </span>
          </div>
          <p className="mt-1 text-xs text-marca font-medium">
            {embudo.leads.tasaConversion}% tasa de aceptación
          </p>
        </div>

        <div className="rounded-xl border border-linea bg-superficie p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
            Citas Confirmadas
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-tinta">
              {embudo.citas.confirmadas}
            </span>
            <span className="text-xs text-tinta-suave">
              de {embudo.citas.total} agendadas
            </span>
          </div>
          <p className="mt-1 text-xs text-marca font-medium">
            {embudo.citas.tasaAgendamiento}% ratio sobre aceptados
          </p>
        </div>

        <div className="rounded-xl border border-linea bg-superficie p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
            Posicionamiento Pagado
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-tinta">
              ${embudo.posicionamiento.montoRecaudadoCOP.toLocaleString('es-CO')}
            </span>
          </div>
          <p className="mt-1 text-xs text-marca font-medium">
            {embudo.posicionamiento.acuerdosActivos} acuerdos activos
          </p>
        </div>
      </div>

      {/* Telemetría de IA destacada */}
      <div className="rounded-xl border border-linea bg-superficie p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-tinta">Telemetría de Agentes IA</h2>
            <p className="text-xs text-tinta-suave">
              Monitoreo de conversaciones automatizadas, inferencias y consumo de tokens.
            </p>
          </div>
          <Link
            href="/control/metricas"
            className="text-xs font-semibold text-marca hover:underline"
          >
            Ver análisis completo &rarr;
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-superficie-alt p-3">
            <p className="text-xs text-tinta-suave">Conversaciones</p>
            <p className="mt-1 text-xl font-bold text-tinta">{ia.conversacionesTotales}</p>
          </div>
          <div className="rounded-lg bg-superficie-alt p-3">
            <p className="text-xs text-tinta-suave">Mensajes Procesados</p>
            <p className="mt-1 text-xl font-bold text-tinta">{ia.mensajesTotales}</p>
          </div>
          <div className="rounded-lg bg-superficie-alt p-3">
            <p className="text-xs text-tinta-suave">Tokens Estimados</p>
            <p className="mt-1 text-xl font-bold text-tinta">{ia.tokensEstimados.total.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-superficie-alt p-3">
            <p className="text-xs text-tinta-suave">Costo Inferencia (USD)</p>
            <p className="mt-1 text-xl font-bold text-marca-fuerte">${ia.costoEstimadoUSD}</p>
          </div>
        </div>
      </div>

      {/* Accesos Rápidos a Módulos */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col justify-between rounded-xl border border-linea bg-superficie p-6 shadow-xs">
          <div>
            <h2 className="text-base font-bold text-tinta">Moderación de Publicaciones</h2>
            <p className="mt-2 text-sm text-tinta-suave">
              Supervisión reactiva de anuncios en el catálogo. Suspende inmuebles con datos incorrectos,
              fraude o imágenes infractoras.
            </p>
          </div>
          <div className="mt-6">
            <Link
              href="/control/moderacion"
              className="inline-flex items-center justify-center rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-marca-fuerte"
            >
              Ir a Moderación &rarr;
            </Link>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-linea bg-superficie p-6 shadow-xs">
          <div>
            <h2 className="text-base font-bold text-tinta">Acuerdos de Posicionamiento</h2>
            <p className="mt-2 text-sm text-tinta-suave">
              Gestión de visibilidad destacada pagada por vendedores. Registra acuerdos y controla vigencias
              con sincronización automática en catálogo.
            </p>
          </div>
          <div className="mt-6">
            <Link
              href="/control/posicionamiento"
              className="inline-flex items-center justify-center rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-marca-fuerte"
            >
              Gestionar Posicionamiento &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
