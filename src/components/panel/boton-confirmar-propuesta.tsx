'use client'

import { useState, useTransition } from 'react'
import { aprobarCitaPropuesta } from '@/app/(vendedor)/panel/leads/acciones-ia'

interface Props {
  conversacionId: string
  franjaInicio?: string
}

export function BotonConfirmarPropuesta({ conversacionId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirmada, setConfirmada] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const res = await aprobarCitaPropuesta(conversacionId)
      if (res.ok) {
        setConfirmada(true)
      } else {
        setError(res.error ?? 'Error al confirmar')
      }
    })
  }

  if (confirmada) {
    return (
      <span className="inline-flex items-center text-sm font-medium text-exito" data-testid="confirmacion-exitosa">
        ✓ Visita confirmada
      </span>
    )
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
        data-testid="boton-confirmar-propuesta"
        className="inline-flex items-center justify-center rounded-md bg-exito px-3 py-1.5 text-xs font-semibold text-marca-contraste shadow-sm hover:bg-exito/90 disabled:opacity-50"
      >
        {isPending ? (
          <span className="flex items-center gap-1.5" data-testid="spinner-carga">
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Confirmando...
          </span>
        ) : (
          'Aprobar visita en 1 clic'
        )}
      </button>
      {error && <span className="text-xs text-peligro" role="alert">{error}</span>}
    </div>
  )
}