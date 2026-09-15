'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { cancelarCita, type ResultadoAccionCita } from './acciones'

export function AccionesCita({ citaId, rutaMover }: { citaId: string; rutaMover: string }) {
  const [estado, accion, ocupado] = useActionState<ResultadoAccionCita, FormData>(cancelarCita, {})

  if (estado.hecho) {
    return <p className="mt-3 text-sm text-tinta-suave">Visita cancelada.</p>
  }

  return (
    <form action={accion} className="mt-3 flex flex-wrap items-center gap-3">
      <input type="hidden" name="cita_id" value={citaId} />
      <Link href={rutaMover}
        className="rounded-sm border border-linea px-4 py-1.5 text-sm text-tinta hover:border-marca hover:text-marca">
        Mover
      </Link>
      <button type="submit" disabled={ocupado}
        className="cursor-pointer rounded-sm border border-linea px-4 py-1.5 text-sm text-tinta-suave hover:border-peligro hover:text-peligro disabled:opacity-60">
        Cancelar
      </button>
      {estado.error && <span role="alert" className="text-sm text-peligro">{estado.error}</span>}
    </form>
  )
}
