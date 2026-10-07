'use client'

import { useActionState } from 'react'
import { conmutarHoraSemanal, type ResultadoDisponibilidad } from './acciones'
import { DIAS_SEMANA } from './opciones'
import { horasCubiertas, horasVisibles, textoHora, type FranjaSemanal } from '@/lib/citas/cuadricula'

const ABREVIATURA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

/**
 * Cuadricula semanal clicable (diseño de Figma Make): cada celda es la visita
 * de una hora que empieza a esa hora. Un solo <form>; cada celda es un boton
 * submit con name="celda" value="dia-hora", asi funciona tambien sin JS.
 * Mientras se guarda se desactiva entera: dos clics seguidos sobre el mismo dia
 * leerian el mismo estado de partida.
 */
export function CuadriculaSemanal({ franjas }: { franjas: readonly FranjaSemanal[] }) {
  const [estado, accion, ocupado] = useActionState<ResultadoDisponibilidad, FormData>(conmutarHoraSemanal, {})
  const horas = horasVisibles(franjas)
  const cubiertas = DIAS_SEMANA.map((_, i) => horasCubiertas(franjas, i + 1))

  return (
    <form action={accion} aria-busy={ocupado}>
      <div className="overflow-x-auto rounded-2xl border border-linea bg-superficie p-3">
        <div className="grid min-w-[30rem] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] gap-1">
          <span aria-hidden="true" />
          {ABREVIATURA.map((dia) => (
            <span key={dia} aria-hidden="true" className="pb-1 text-center text-xs font-semibold text-tinta-suave">
              {dia}
            </span>
          ))}

          {horas.map((h) => (
            <div key={h} className="contents">
              <span aria-hidden="true" className="cifra pr-2 text-right text-xs leading-8 text-tinta-tenue">
                {textoHora(h)}
              </span>
              {DIAS_SEMANA.map((dia, i) => {
                const activa = cubiertas[i]!.has(h)
                return (
                  <button
                    key={dia}
                    type="submit"
                    name="celda"
                    value={`${i + 1}-${h}`}
                    disabled={ocupado}
                    aria-pressed={activa}
                    aria-label={`${dia} ${textoHora(h)}, ${activa ? 'disponible' : 'no disponible'}`}
                    className={`h-8 cursor-pointer rounded-md border transition-colors disabled:cursor-wait ${
                      activa
                        ? 'border-marca bg-marca hover:bg-marca-fuerte'
                        : 'border-linea bg-fondo hover:border-marca hover:bg-marca-suave'
                    }`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-tinta-suave">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-marca" /> Disponible
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm border border-linea bg-fondo" /> No disponible
        </span>
        <span>Haz clic en una hora para activarla o quitarla.</span>
      </div>
      {estado.error && <p role="alert" className="mt-2 text-sm text-peligro">{estado.error}</p>}
    </form>
  )
}
