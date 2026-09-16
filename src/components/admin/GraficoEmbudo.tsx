import type { MetricasEmbudo } from '@/lib/admin/metricas'

export function GraficoEmbudo({ embudo }: { embudo: MetricasEmbudo }) {
  const { leads, citas } = embudo
  const maximo = Math.max(leads.total, 1)

  const pasos = [
    {
      etiqueta: '1. Leads Captados',
      valor: leads.total,
      porcentaje: 100,
      color: 'bg-marca',
      descripcion: 'Compradores interesados en fichas públicas',
    },
    {
      etiqueta: '2. Leads Aceptados',
      valor: leads.aceptados,
      porcentaje: leads.total > 0 ? (leads.aceptados / maximo) * 100 : 0,
      color: 'bg-emerald-600',
      descripcion: `${leads.tasaConversion}% de conversión sobre leads`,
    },
    {
      etiqueta: '3. Citas Confirmadas',
      valor: citas.confirmadas,
      porcentaje: leads.total > 0 ? (citas.confirmadas / maximo) * 100 : 0,
      color: 'bg-amber-600',
      descripcion: `${citas.tasaAgendamiento}% de agendamiento sobre aceptados`,
    },
    {
      etiqueta: '4. Citas Completadas',
      valor: citas.completadas,
      porcentaje: leads.total > 0 ? (citas.completadas / maximo) * 100 : 0,
      color: 'bg-indigo-600',
      descripcion: 'Visitas presenciales realizadas',
    },
  ]

  return (
    <div className="space-y-4">
      {pasos.map((paso) => (
        <div key={paso.etiqueta} className="space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-tinta">
            <span>{paso.etiqueta}</span>
            <span className="font-bold">{paso.valor} ({paso.porcentaje.toFixed(1)}%)</span>
          </div>
          <div className="h-6 w-full overflow-hidden rounded-md bg-superficie-alt border border-linea-suave">
            <div
              className={`h-full ${paso.color} transition-all duration-500 rounded-r-md`}
              style={{ width: `${Math.max(paso.porcentaje, 2)}%` }}
            />
          </div>
          <p className="text-2xs text-tinta-tenue">{paso.descripcion}</p>
        </div>
      ))}
    </div>
  )
}
