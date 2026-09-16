'use client'

import { useState, useTransition } from 'react'
import { accionCancelarPagoPosicionamiento } from '@/app/(admin)/control/posicionamiento/acciones'

export function BotonCancelarPosicionamiento({ pagoId }: { pagoId: string }) {
  const [pendiente, startTransition] = useTransition()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const manejarCancelacion = () => {
    startTransition(async () => {
      setError(null)
      const res = await accionCancelarPagoPosicionamiento(
        pagoId,
        motivo.trim() || 'Cancelado por administrador',
      )
      if (!res.ok) {
        setError(res.error || 'Error al cancelar acuerdo.')
      } else {
        setModalAbierto(false)
      }
    })
  }

  return (
    <div>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => setModalAbierto(true)}
        className="rounded bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-tinta hover:bg-neutral-300 disabled:opacity-50"
      >
        Cancelar
      </button>

      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 text-left">
          <div className="w-full max-w-md rounded-xl bg-superficie p-6 shadow-xl border border-linea">
            <h3 className="text-lg font-bold text-tinta">Cancelar Acuerdo de Posicionamiento</h3>
            <p className="mt-1 text-xs text-tinta-suave">
              La propiedad dejará de estar destacada en el catálogo inmediatamente.
            </p>
            <input
              type="text"
              className="mt-3 w-full rounded-lg border border-linea p-2 text-sm text-tinta focus:border-marca focus:outline-hidden"
              placeholder="Motivo de cancelación (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="rounded-lg border border-linea px-3 py-1.5 text-xs font-medium text-tinta hover:bg-superficie-alt"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={pendiente}
                onClick={manejarCancelacion}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pendiente ? 'Cancelando...' : 'Confirmar Cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
