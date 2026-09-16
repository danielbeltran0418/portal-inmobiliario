'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { accionRegistrarPagoPosicionamiento } from '@/app/(admin)/control/posicionamiento/acciones'
import type { ResultadoPagoPosicionamiento } from '@/lib/admin/posicionamiento'

interface PropiedadOpcion {
  id: string
  titulo: string
  vendedor: {
    nombre: string
  } | null
}

export function FormularioPosicionamiento({
  propiedades,
}: {
  propiedades: PropiedadOpcion[]
}) {
  const router = useRouter()
  const [estado, formAction, pendiente] = useActionState<ResultadoPagoPosicionamiento, FormData>(
    accionRegistrarPagoPosicionamiento,
    { ok: false },
  )

  useEffect(() => {
    if (estado.ok) {
      router.push('/control/posicionamiento')
    }
  }, [estado.ok, router])

  return (
    <form action={formAction} className="space-y-6">
      {estado.error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {estado.error}
        </div>
      )}

      <div>
        <label htmlFor="propiedad_id" className="block text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
          Propiedad a Destacar
        </label>
        <select
          id="propiedad_id"
          name="propiedad_id"
          required
          className="mt-2 block w-full rounded-lg border border-linea bg-superficie p-2.5 text-sm text-tinta focus:border-marca focus:outline-hidden"
        >
          <option value="">Selecciona una propiedad publicada...</option>
          {propiedades.map((p) => (
            <option key={p.id} value={p.id}>
              {p.titulo} ({p.vendedor?.nombre ?? 'Vendedor'})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="monto" className="block text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
            Monto Pagado (COP)
          </label>
          <input
            id="monto"
            name="monto"
            type="number"
            min="0"
            step="1000"
            required
            defaultValue="100000"
            className="mt-2 block w-full rounded-lg border border-linea bg-superficie p-2.5 text-sm text-tinta focus:border-marca focus:outline-hidden"
          />
        </div>

        <div>
          <label htmlFor="referencia_externa" className="block text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
            Referencia de Pago / Transacción
          </label>
          <input
            id="referencia_externa"
            name="referencia_externa"
            type="text"
            placeholder="Ej: TRX-BCOL-87192"
            className="mt-2 block w-full rounded-lg border border-linea bg-superficie p-2.5 text-sm text-tinta focus:border-marca focus:outline-hidden"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="fecha_inicio" className="block text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
            Fecha y Hora de Inicio
          </label>
          <input
            id="fecha_inicio"
            name="fecha_inicio"
            type="datetime-local"
            required
            className="mt-2 block w-full rounded-lg border border-linea bg-superficie p-2.5 text-sm text-tinta focus:border-marca focus:outline-hidden"
          />
        </div>

        <div>
          <label htmlFor="fecha_fin" className="block text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
            Fecha y Hora de Fin
          </label>
          <input
            id="fecha_fin"
            name="fecha_fin"
            type="datetime-local"
            required
            className="mt-2 block w-full rounded-lg border border-linea bg-superficie p-2.5 text-sm text-tinta focus:border-marca focus:outline-hidden"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notas" className="block text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
          Notas del Acuerdo
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={3}
          placeholder="Ej: Pago verificado mediante soporte bancario por WhatsApp"
          className="mt-2 block w-full rounded-lg border border-linea bg-superficie p-2.5 text-sm text-tinta focus:border-marca focus:outline-hidden"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-lg bg-marca px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-marca-fuerte disabled:opacity-50"
        >
          {pendiente ? 'Guardando...' : 'Activar Posicionamiento'}
        </button>
      </div>
    </form>
  )
}
