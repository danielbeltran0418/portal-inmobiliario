'use client'

import { useActionState } from 'react'
import {
  agregarFranjaSemanal, bloquearFechas, desbloquearFechas, eliminarFranjaSemanal,
  type ResultadoDisponibilidad,
} from './acciones'
import { DIAS_SEMANA, HORAS_FIN, HORAS_INICIO } from './opciones'

const CAMPO = 'mt-1 block rounded-xl border border-linea bg-fondo px-3 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25'
const BOTON =
  'min-h-10 cursor-pointer rounded-xl bg-marca px-4 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte disabled:opacity-60'
const BOTON_QUITAR =
  'min-h-9 cursor-pointer rounded-lg border border-linea px-3 text-sm text-tinta-suave transition-colors hover:border-peligro hover:text-peligro disabled:opacity-60'

// Todos con useActionState: cada accion devuelve un error (validacion, o cero
// filas al borrar) que un <form action={fn}> a secas tiraria.

export function FormularioFranja() {
  const [estado, accion, ocupado] = useActionState<ResultadoDisponibilidad, FormData>(agregarFranjaSemanal, {})
  return (
    <form action={accion} className="flex flex-wrap items-end gap-3">
      <label className="text-sm text-tinta-suave">
        Día
        <select name="dia_semana" defaultValue="1" className={CAMPO}>
          {DIAS_SEMANA.map((dia, indice) => <option key={dia} value={indice + 1}>{dia}</option>)}
        </select>
      </label>
      <label className="text-sm text-tinta-suave">
        Desde
        <select name="hora_inicio" defaultValue="08:00" className={CAMPO}>
          {HORAS_INICIO.map((hora) => <option key={hora} value={hora}>{hora}</option>)}
        </select>
      </label>
      <label className="text-sm text-tinta-suave">
        Hasta
        <select name="hora_fin" defaultValue="12:00" className={CAMPO}>
          {HORAS_FIN.map((hora) => <option key={hora} value={hora}>{hora}</option>)}
        </select>
      </label>
      <button type="submit" disabled={ocupado} className={BOTON}>Agregar franja</button>
      {estado.error && <p role="alert" className="w-full text-sm text-peligro">{estado.error}</p>}
    </form>
  )
}

export function EliminarFranja({ id }: { id: string }) {
  const [estado, accion, ocupado] = useActionState<ResultadoDisponibilidad, FormData>(eliminarFranjaSemanal, {})
  return (
    <form action={accion} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={ocupado} className={BOTON_QUITAR}>Quitar</button>
      {estado.error && <span role="alert" className="text-sm text-peligro">{estado.error}</span>}
    </form>
  )
}

export function FormularioBloqueo() {
  const [estado, accion, ocupado] = useActionState<ResultadoDisponibilidad, FormData>(bloquearFechas, {})
  return (
    <form action={accion} className="flex flex-wrap items-end gap-3">
      <label className="text-sm text-tinta-suave">
        Desde
        <input type="date" name="desde" required className={CAMPO} />
      </label>
      <label className="text-sm text-tinta-suave">
        Hasta
        <input type="date" name="hasta" required className={CAMPO} />
      </label>
      <button type="submit" disabled={ocupado} className={BOTON}>Bloquear fechas</button>
      {estado.error && <p role="alert" className="w-full text-sm text-peligro">{estado.error}</p>}
    </form>
  )
}

export function Desbloquear({ id }: { id: string }) {
  const [estado, accion, ocupado] = useActionState<ResultadoDisponibilidad, FormData>(desbloquearFechas, {})
  return (
    <form action={accion} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={ocupado} className={BOTON_QUITAR}>Desbloquear</button>
      {estado.error && <span role="alert" className="text-sm text-peligro">{estado.error}</span>}
    </form>
  )
}
