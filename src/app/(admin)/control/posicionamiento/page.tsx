import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { listarPagosPosicionamiento } from '@/lib/admin/posicionamiento'
import { BotonCancelarPosicionamiento } from '@/components/admin/BotonCancelarPosicionamiento'

export const dynamic = 'force-dynamic'

export default async function PaginaPosicionamiento() {
  const supabase = await crearClienteServidor()
  const acuerdos = await listarPagosPosicionamiento(supabase)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-titulo text-2xl font-bold tracking-tight text-tinta">
            Acuerdos de Posicionamiento Pagado
          </h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Control de propiedades destacadas con visibilidad preferencial pagada fuera de banda.
          </p>
        </div>
        <Link
          href="/control/posicionamiento/nuevo"
          className="rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-marca-fuerte"
        >
          + Registrar Nuevo Acuerdo
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-linea bg-superficie shadow-xs">
        <table className="w-full text-left text-sm text-tinta">
          <thead className="border-b border-linea bg-superficie-alt text-xs font-semibold uppercase text-tinta-tenue">
            <tr>
              <th className="px-4 py-3">Inmueble</th>
              <th className="px-4 py-3">Vendedor</th>
              <th className="px-4 py-3">Monto (COP)</th>
              <th className="px-4 py-3">Vigencia</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea-suave">
            {acuerdos.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-tinta-suave">
                  No hay acuerdos de posicionamiento registrados aún.
                </td>
              </tr>
            ) : (
              acuerdos.map((acuerdo) => {
                const badgeColor =
                  acuerdo.estado === 'activo'
                    ? 'bg-emerald-100 text-emerald-800'
                    : acuerdo.estado === 'expirado'
                    ? 'bg-neutral-100 text-neutral-700'
                    : 'bg-red-100 text-red-800'

                const inicio = new Date(acuerdo.fecha_inicio).toLocaleDateString('es-CO')
                const fin = new Date(acuerdo.fecha_fin).toLocaleDateString('es-CO')

                return (
                  <tr key={acuerdo.id} className="hover:bg-superficie-alt/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-tinta">
                        {acuerdo.propiedades?.titulo ?? 'Propiedad no disponible'}
                      </div>
                      {acuerdo.referencia_externa && (
                        <div className="text-xs text-tinta-tenue">
                          Ref: {acuerdo.referencia_externa}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-tinta-suave">
                      {acuerdo.perfiles?.nombre ?? 'Desconocido'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-xs">
                      ${acuerdo.monto.toLocaleString('es-CO')}
                    </td>
                    <td className="px-4 py-3 text-xs text-tinta-suave">
                      {inicio} &rarr; {fin}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badgeColor}`}>
                        {acuerdo.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {acuerdo.estado === 'activo' ? (
                        <BotonCancelarPosicionamiento pagoId={acuerdo.id} />
                      ) : (
                        <span className="text-xs text-tinta-tenue">—</span>
                      )}
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
