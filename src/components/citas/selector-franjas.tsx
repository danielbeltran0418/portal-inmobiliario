'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { moverCita, reservarCita, type ResultadoAccionCita } from './acciones'
import type { GrupoFranjas } from '@/lib/citas/agrupar'

const BOTON_FRANJA =
  'cursor-pointer rounded-sm border border-linea bg-superficie px-3 py-1.5 text-sm text-tinta ' +
  'hover:border-marca hover:text-marca disabled:opacity-60'

/**
 * useActionState y no <form action={fn}> a secas: la accion devuelve el
 * error traducido (VS004 si otro reservo antes) y sin el hook ese valor se
 * descartaria y el usuario no veria nada.
 *
 * Cada franja es un boton submit con name="inicio" y su instante como value:
 * React incluye el boton pulsado en el FormData de la accion.
 */
export function SelectorFranjas({
  modo, objetivoId, grupos, volverA,
}: {
  modo: 'reservar' | 'mover'
  objetivoId: string
  grupos: readonly GrupoFranjas[]
  volverA: string
}) {
  const [estado, accion, ocupado] = useActionState<ResultadoAccionCita, FormData>(
    modo === 'reservar' ? reservarCita : moverCita,
    {},
  )

  if (estado.hecho) {
    return (
      <div className="rounded-md border border-exito bg-exito-suave p-4 text-exito">
        <p>{modo === 'reservar' ? 'Tu visita quedó confirmada.' : 'La visita se movió a la nueva franja.'}</p>
        <Link href={volverA} className="mt-2 inline-block underline">Volver</Link>
      </div>
    )
  }

  if (grupos.length === 0) {
    return (
      <p className="rounded-md border border-linea bg-superficie p-6 text-tinta-suave">
        No hay franjas libres en los próximos 14 días.
      </p>
    )
  }

  return (
    <form action={accion} className="space-y-6">
      <input type="hidden" name={modo === 'reservar' ? 'lead_id' : 'cita_id'} value={objetivoId} />
      {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}
      {grupos.map((grupo) => (
        <fieldset key={grupo.clave}>
          <legend className="font-medium text-tinta">{grupo.dia}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {grupo.franjas.map((franja) => (
              <button key={franja.inicio} type="submit" name="inicio" value={franja.inicio}
                disabled={ocupado} className={BOTON_FRANJA}>
                {franja.hora}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </form>
  )
}
