import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { BotonModeracion } from '@/components/admin/BotonModeracion'

export const dynamic = 'force-dynamic'

interface PropiedadModeracion {
  id: string
  titulo: string
  slug: string
  precio: number | null
  operacion: string
  estado: string
  destacada: boolean
  creado_en: string
  vendedor: {
    nombre: string
    telefono: string | null
  } | null
  barrios: {
    nombre: string
  } | null
}

export default async function PaginaModeracion() {
  const supabase = await crearClienteServidor()
  const { data: propiedades, error } = await supabase
    .from('propiedades')
    .select(`
      id,
      titulo,
      slug,
      precio,
      operacion,
      estado,
      destacada,
      creado_en,
      vendedor:vendedor_id (nombre, telefono),
      barrios:barrio_id (nombre)
    `)
    .order('creado_en', { ascending: false })
    .limit(50)

  const lista = (propiedades || []) as unknown as PropiedadModeracion[]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-titulo text-2xl font-bold tracking-tight text-tinta">
            Moderación de Publicaciones
          </h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Supervisa inmuebles publicados, aplica suspensiones con registro de auditoría o reactiva anuncios.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          Error al cargar propiedades: {error.message}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-linea bg-superficie shadow-xs">
        <table className="w-full text-left text-sm text-tinta">
          <thead className="border-b border-linea bg-superficie-alt text-xs font-semibold uppercase text-tinta-tenue">
            <tr>
              <th className="px-4 py-3">Inmueble</th>
              <th className="px-4 py-3">Vendedor</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones de Moderación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea-suave">
            {lista.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-tinta-suave">
                  No hay propiedades registradas para moderar.
                </td>
              </tr>
            ) : (
              lista.map((prop) => {
                const badgeColor =
                  prop.estado === 'publicada'
                    ? 'bg-emerald-100 text-emerald-800'
                    : prop.estado === 'borrador'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-red-100 text-red-800'

                return (
                  <tr key={prop.id} className="hover:bg-superficie-alt/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-tinta">{prop.titulo}</div>
                      <div className="text-xs text-tinta-tenue">
                        {prop.barrios?.nombre ?? 'Sin barrio'} • {prop.operacion}
                        {prop.destacada && (
                          <span className="ml-2 rounded-sm bg-realce-suave px-1.5 py-0.5 text-2xs font-bold text-realce">
                            ★ DESTACADA
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-tinta-suave">
                      {prop.vendedor?.nombre ?? 'Desconocido'}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      {prop.precio ? `$${prop.precio.toLocaleString('es-CO')}` : 'Sin precio'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badgeColor}`}>
                        {prop.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/control/moderacion/${prop.id}`}
                          className="text-xs font-semibold text-marca hover:underline"
                        >
                          Inspeccionar
                        </Link>
                        <BotonModeracion propiedadId={prop.id} estadoActual={prop.estado} />
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
