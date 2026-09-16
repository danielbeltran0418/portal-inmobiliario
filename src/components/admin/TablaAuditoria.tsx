'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { EventoAuditoria } from '@/lib/admin/auditoria'

interface TablaAuditoriaProps {
  eventos: EventoAuditoria[]
  total: number
  pagina: number
  totalPaginas: number
}

export function TablaAuditoria({
  eventos,
  total,
  pagina,
  totalPaginas,
}: TablaAuditoriaProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [accionFiltro, setAccionFiltro] = useState(searchParams.get('accion') || '')
  const [entidadFiltro, setEntidadFiltro] = useState(searchParams.get('entidad') || '')
  const [expandidoId, setExpandidoId] = useState<number | null>(null)

  const aplicarFiltros = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (accionFiltro.trim()) params.set('accion', accionFiltro.trim())
    if (entidadFiltro.trim()) params.set('entidad', entidadFiltro.trim())
    params.set('pagina', '1')
    router.push(`/control/auditoria?${params.toString()}`)
  }

  const cambiarPagina = (nuevaPagina: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('pagina', String(nuevaPagina))
    router.push(`/control/auditoria?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      {/* Filtros de búsqueda */}
      <form onSubmit={aplicarFiltros} className="grid grid-cols-1 gap-4 rounded-xl border border-linea bg-superficie p-4 sm:grid-cols-3">
        <div>
          <label htmlFor="accion" className="block text-2xs font-semibold uppercase text-tinta-tenue">
            Acción
          </label>
          <input
            id="accion"
            type="text"
            placeholder="Ej: propiedad_moderada, login_fallido..."
            value={accionFiltro}
            onChange={(e) => setAccionFiltro(e.target.value)}
            className="mt-1 block w-full rounded-md border border-linea p-2 text-xs text-tinta focus:border-marca focus:outline-hidden"
          />
        </div>

        <div>
          <label htmlFor="entidad" className="block text-2xs font-semibold uppercase text-tinta-tenue">
            Entidad
          </label>
          <input
            id="entidad"
            type="text"
            placeholder="Ej: propiedades, sesion, pagos_posicionamiento..."
            value={entidadFiltro}
            onChange={(e) => setEntidadFiltro(e.target.value)}
            className="mt-1 block w-full rounded-md border border-linea p-2 text-xs text-tinta focus:border-marca focus:outline-hidden"
          />
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-md bg-marca px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-marca-fuerte"
          >
            Filtrar
          </button>
          <button
            type="button"
            onClick={() => {
              setAccionFiltro('')
              setEntidadFiltro('')
              router.push('/control/auditoria')
            }}
            className="rounded-md border border-linea px-3 py-2 text-xs font-medium text-tinta hover:bg-superficie-alt"
          >
            Limpiar
          </button>
        </div>
      </form>

      {/* Tabla de bitácora */}
      <div className="overflow-hidden rounded-xl border border-linea bg-superficie shadow-xs">
        <table className="w-full text-left text-sm text-tinta">
          <thead className="border-b border-linea bg-superficie-alt text-xs font-semibold uppercase text-tinta-tenue">
            <tr>
              <th className="px-4 py-3">Fecha y Hora</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">Entidad</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3 text-right">Detalles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea-suave">
            {eventos.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-tinta-suave">
                  No se encontraron eventos de auditoría registrados.
                </td>
              </tr>
            ) : (
              eventos.map((ev) => {
                const fecha = new Date(ev.creado_en).toLocaleString('es-CO')
                const esExpandido = expandidoId === ev.id

                return (
                  <tr key={ev.id} className="hover:bg-superficie-alt/40 transition-colors">
                    <td className="px-4 py-3 text-xs text-tinta-suave whitespace-nowrap">
                      {fecha}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-marca-fuerte">
                      {ev.accion}
                    </td>
                    <td className="px-4 py-3 text-xs text-tinta">
                      {ev.entidad} {ev.entidad_id && <span className="text-2xs text-tinta-tenue font-mono">({ev.entidad_id.slice(0, 8)})</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-tinta">
                      {ev.perfiles?.nombre ?? 'Sistema / Anónimo'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setExpandidoId(esExpandido ? null : ev.id)}
                        className="text-xs font-semibold text-marca hover:underline"
                      >
                        {esExpandido ? 'Ocultar' : 'Ver payload'}
                      </button>
                      {esExpandido && (
                        <div className="mt-2 text-left rounded-lg bg-superficie-alt p-3 border border-linea-suave">
                          <pre className="text-2xs font-mono text-tinta whitespace-pre-wrap">
                            {JSON.stringify(ev.metadatos, null, 2)}
                          </pre>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between text-xs text-tinta-suave">
        <span>
          Mostrando {eventos.length} de {total} eventos registrados
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => cambiarPagina(pagina - 1)}
            className="rounded-md border border-linea px-3 py-1 text-xs font-medium text-tinta hover:bg-superficie-alt disabled:opacity-40"
          >
            &larr; Anterior
          </button>
          <span className="px-2 py-1 font-semibold text-tinta">
            Página {pagina} de {Math.max(totalPaginas, 1)}
          </span>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => cambiarPagina(pagina + 1)}
            className="rounded-md border border-linea px-3 py-1 text-xs font-medium text-tinta hover:bg-superficie-alt disabled:opacity-40"
          >
            Siguiente &rarr;
          </button>
        </div>
      </div>
    </div>
  )
}
