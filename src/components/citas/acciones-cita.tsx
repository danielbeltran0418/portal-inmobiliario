'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { cancelarCita, type ResultadoAccionCita } from './acciones'

/**
 * `tardia`: faltan menos de 8 horas. Cancelar o mover sigue permitido, pero
 * la base anota una falta (20260926000100), y se avisa ANTES de hacerlo.
 */
export function AccionesCita(
  { citaId, rutaMover, tardia = false }: { citaId: string; rutaMover: string; tardia?: boolean },
) {
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
      {tardia && (
        <span className="w-full text-sm text-amber-700">
          Faltan menos de 8 horas: si cancelas o mueves la visita ahora se registra una falta
          (3 faltas en 30 días bloquean tus citas durante 7 días).
        </span>
      )}
      {estado.error && <span role="alert" className="text-sm text-peligro">{estado.error}</span>}
    </form>
  )
}
