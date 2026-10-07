'use client'

import { useActionState } from 'react'
import { accionCrearBarrio, type EstadoBarrio } from './acciones'

const CAMPO =
  'w-full rounded-xl border border-linea bg-fondo px-3 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25'

export function FormularioBarrio({ ciudades }: { ciudades: readonly string[] }) {
  const [estado, accion, pendiente] = useActionState<EstadoBarrio, FormData>(accionCrearBarrio, {})

  return (
    <form action={accion} className="flex flex-col gap-4 rounded-xl border border-linea bg-superficie p-5 shadow-xs">
      <h2 className="text-base font-bold text-tinta">Agregar barrio</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-tinta">
          Barrio
          <input name="nombre" required minLength={2} maxLength={80} placeholder="Chapinero" className={`${CAMPO} mt-1`} />
        </label>
        <label className="text-sm font-medium text-tinta">
          Ciudad
          <input name="ciudad" required minLength={2} maxLength={80} list="ciudades-existentes" placeholder="Bogotá" className={`${CAMPO} mt-1`} />
          <datalist id="ciudades-existentes">
            {ciudades.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
      </div>
      <p className="text-xs text-tinta-suave">
        La dirección del catálogo se genera sola. Si ya existe un barrio con ese nombre en otra ciudad, se le agrega la
        ciudad (por ejemplo, el-prado-bucaramanga). Escribe la ciudad igual que las existentes para que se agrupen.
      </p>
      {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}
      {estado.creado && (
        <p role="status" className="text-sm text-exito">
          Barrio creado: <span className="cifra">/{estado.creado}</span>
        </p>
      )}
      <button
        type="submit"
        disabled={pendiente}
        className="self-start cursor-pointer rounded-xl bg-marca px-5 py-2.5 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte disabled:opacity-60"
      >
        {pendiente ? 'Creando…' : 'Crear barrio'}
      </button>
    </form>
  )
}
