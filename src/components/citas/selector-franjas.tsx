'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'
import { useActionState } from 'react'
import { moverCita, reservarCita, type ResultadoAccionCita } from './acciones'
import type { GrupoFranjas } from '@/lib/citas/agrupar'

const BOTON_FRANJA =
  'min-h-11 cursor-pointer rounded-xl border border-linea bg-fondo px-4 text-sm font-semibold text-tinta ' +
  'transition-colors hover:border-marca hover:bg-marca-suave hover:text-marca disabled:opacity-60'

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
      <div className="flex flex-col items-center rounded-2xl border border-linea bg-superficie px-6 py-12 text-center">
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-marca">
          <Check aria-hidden="true" className="h-8 w-8 text-marca-contraste" strokeWidth={2.5} />
        </span>
        <p role="status" className="font-titulo text-2xl font-semibold text-tinta">
          {modo === 'reservar' ? 'Tu visita quedó confirmada.' : 'La visita se movió a la nueva franja.'}
        </p>
        <p className="mt-2 max-w-sm text-sm text-tinta-suave">
          La dirección exacta del inmueble aparecerá en tu cuenta 2 horas antes de la visita.
        </p>
        <Link href={volverA} className="mt-6 inline-flex items-center rounded-xl bg-marca px-5 py-2.5 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte">
          Volver
        </Link>
      </div>
    )
  }

  if (grupos.length === 0) {
    return (
      <p className="rounded-2xl border border-linea bg-superficie p-8 text-center text-tinta-suave">
        No hay franjas libres en los próximos 14 días.
      </p>
    )
  }

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name={modo === 'reservar' ? 'lead_id' : 'cita_id'} value={objetivoId} />
      {estado.error && <p role="alert" className="rounded-xl border border-peligro/30 bg-peligro-suave p-3 text-sm text-peligro">{estado.error}</p>}
      {grupos.map((grupo) => (
        <fieldset key={grupo.clave} className="rounded-2xl border border-linea bg-superficie p-5">
          <legend className="sr-only">{grupo.dia}</legend>
          <p aria-hidden="true" className="mb-3 font-medium text-tinta first-letter:uppercase">{grupo.dia}</p>
          <div className="flex flex-wrap gap-2">
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
