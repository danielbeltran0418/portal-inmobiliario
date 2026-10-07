import type { MesSerie } from '@/lib/admin/metricas'

/**
 * Barras agrupadas "Leads y citas por mes" (diseño de Figma Make). Sin libreria
 * de graficos: son divs con altura relativa al maximo, pintados en el servidor.
 * Las barras son decorativas (aria-hidden); los datos van en una tabla sr-only
 * para lectores de pantalla.
 */
export function GraficoMensual({ serie }: { serie: readonly MesSerie[] }) {
  const maximo = Math.max(1, ...serie.flatMap((m) => [m.leads, m.citas]))
  const vacia = serie.every((m) => m.leads === 0 && m.citas === 0)

  if (vacia) {
    return (
      <p className="rounded-lg bg-superficie-alt p-6 text-center text-sm text-tinta-suave">
        Todavía no hay leads ni citas en los últimos {serie.length} meses.
      </p>
    )
  }

  const altura = (valor: number) => `${Math.round((valor / maximo) * 100)}%`

  return (
    <div>
      <div className="mb-4 flex items-center gap-4 text-xs text-tinta-suave" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-marca" /> Leads
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-realce" /> Citas
        </span>
      </div>

      <div className="flex h-48 items-end gap-3 border-b border-linea" aria-hidden="true">
        {serie.map((m) => (
          <div key={m.clave} className="flex h-full flex-1 items-end justify-center gap-1">
            <div
              className="w-full max-w-5 rounded-t-md bg-marca"
              style={{ height: altura(m.leads) }}
              title={`${m.etiqueta}: ${m.leads} leads`}
            />
            <div
              className="w-full max-w-5 rounded-t-md bg-realce"
              style={{ height: altura(m.citas) }}
              title={`${m.etiqueta}: ${m.citas} citas`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-center text-xs capitalize text-tinta-tenue" aria-hidden="true">
        {serie.map((m) => (
          <span key={m.clave} className="flex-1">{m.etiqueta}</span>
        ))}
      </div>

      <table className="sr-only">
        <caption>Leads y citas creados por mes</caption>
        <thead>
          <tr><th scope="col">Mes</th><th scope="col">Leads</th><th scope="col">Citas</th></tr>
        </thead>
        <tbody>
          {serie.map((m) => (
            <tr key={m.clave}>
              <th scope="row">{m.clave}</th>
              <td>{m.leads}</td>
              <td>{m.citas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
