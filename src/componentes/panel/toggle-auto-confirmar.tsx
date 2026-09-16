'use client'

import { useState, useTransition } from 'react'
import { actualizarAutoConfirmacion } from '@/app/(vendedor)/panel/leads/acciones-ia'

interface Props {
  inicial: boolean
}

export function ToggleAutoConfirmar({ inicial }: Props) {
  const [activado, setActivado] = useState(inicial)
  const [isPending, startTransition] = useTransition()
  const [mensaje, setMensaje] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = e.target.checked
    setActivado(valor)
    setMensaje(null)
    startTransition(async () => {
      const res = await actualizarAutoConfirmacion(valor)
      if (res.ok) {
        setMensaje('Preferencia actualizada')
      } else {
        setMensaje(res.error ?? 'Error al guardar')
      }
    })
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-linea bg-superficie p-4" data-testid="toggle-auto-confirmar-container">
      <div>
        <label htmlFor="switch-auto-confirmar" className="text-sm font-medium text-tinta cursor-pointer">
          Permitir auto-confirmar citas con IA
        </label>
        <p className="text-xs text-tinta-suave mt-0.5">
          Si está activo, el agente reservará visitas directamente en tu agenda según tus franjas libres. Si no, las dejará como propuestas pendientes de tu confirmación en 1 clic.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {isPending && <span className="text-xs text-tinta-tenue">Guardando...</span>}
        {mensaje && !isPending && <span className="text-xs text-emerald-600">{mensaje}</span>}
        <input
          id="switch-auto-confirmar"
          type="checkbox"
          checked={activado}
          onChange={handleChange}
          disabled={isPending}
          data-testid="input-auto-confirmar"
          className="h-5 w-5 rounded border-linea text-marca focus:ring-marca cursor-pointer disabled:opacity-50"
        />
      </div>
    </div>
  )
}