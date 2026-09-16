'use client'

import { useState, useTransition } from 'react'
import {
  accionSuspenderPropiedad,
  accionReactivarPropiedad,
  accionEliminarPropiedadAdmin,
} from '@/app/(admin)/control/moderacion/acciones'

interface BotonModeracionProps {
  propiedadId: string
  estadoActual: string
}

export function BotonModeracion({ propiedadId, estadoActual }: BotonModeracionProps) {
  const [pendiente, startTransition] = useTransition()
  const [modalSuspender, setModalSuspender] = useState(false)
  const [modalEliminar, setModalEliminar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const manejarSuspension = () => {
    if (!motivo.trim()) {
      setError('Debes ingresar un motivo para la suspensión.')
      return
    }

    startTransition(async () => {
      setError(null)
      const res = await accionSuspenderPropiedad(propiedadId, motivo)
      if (!res.ok) {
        setError(res.error || 'Error al suspender.')
      } else {
        setModalSuspender(false)
        setMotivo('')
      }
    })
  }

  const manejarReactivacion = () => {
    startTransition(async () => {
      setError(null)
      const res = await accionReactivarPropiedad(propiedadId)
      if (!res.ok) {
        setError(res.error || 'Error al reactivar.')
      }
    })
  }

  const manejarEliminacion = () => {
    if (!motivo.trim()) {
      setError('Debes ingresar un motivo para eliminar.')
      return
    }

    startTransition(async () => {
      setError(null)
      const res = await accionEliminarPropiedadAdmin(propiedadId, motivo)
      if (!res.ok) {
        setError(res.error || 'Error al eliminar.')
      } else {
        setModalEliminar(false)
        setMotivo('')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <span className="text-xs text-red-600 w-full">{error}</span>}

      {estadoActual === 'publicada' && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() => setModalSuspender(true)}
          className="rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pendiente ? 'Procesando...' : 'Suspender'}
        </button>
      )}

      {(estadoActual === 'rechazada' || estadoActual === 'pausada') && (
        <button
          type="button"
          disabled={pendiente}
          onClick={manejarReactivacion}
          className="rounded bg-marca px-2.5 py-1 text-xs font-semibold text-white hover:bg-marca-fuerte disabled:opacity-50"
        >
          {pendiente ? 'Procesando...' : 'Reactivar'}
        </button>
      )}

      <button
        type="button"
        disabled={pendiente}
        onClick={() => setModalEliminar(true)}
        className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        Eliminar
      </button>

      {/* Modal / Dialogo de suspensión */}
      {modalSuspender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-superficie p-6 shadow-xl border border-linea">
            <h3 className="text-lg font-bold text-tinta">Suspender Publicación</h3>
            <p className="mt-1 text-xs text-tinta-suave">
              La propiedad dejará de verse en el catálogo público. Describe la razón de la moderación:
            </p>
            <textarea
              className="mt-3 w-full rounded-lg border border-linea p-2 text-sm text-tinta focus:border-marca focus:outline-hidden"
              rows={3}
              placeholder="Ej: Fotografías de terceros con marcas de agua / datos de contacto en descripción"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setModalSuspender(false); setError(null); }}
                className="rounded-lg border border-linea px-3 py-1.5 text-xs font-medium text-tinta hover:bg-superficie-alt"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pendiente}
                onClick={manejarSuspension}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Confirmar Suspensión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Dialogo de eliminación definitiva */}
      {modalEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-superficie p-6 shadow-xl border border-linea">
            <h3 className="text-lg font-bold text-red-600">Eliminar Propiedad Definitivamente</h3>
            <p className="mt-1 text-xs text-tinta-suave">
              Esta acción borrará la ficha, sus imágenes y acuerdos asociados en cascada. Ingresa el motivo:
            </p>
            <textarea
              className="mt-3 w-full rounded-lg border border-linea p-2 text-sm text-tinta focus:border-red-600 focus:outline-hidden"
              rows={3}
              placeholder="Ej: Anuncio fraudulento / suplantación de identidad"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setModalEliminar(false); setError(null); }}
                className="rounded-lg border border-linea px-3 py-1.5 text-xs font-medium text-tinta hover:bg-superficie-alt"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pendiente}
                onClick={manejarEliminacion}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirmar Eliminación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
