'use client'

import { useActionState } from 'react'
import { restablecerContrasena, type EstadoRestablecer } from './acciones'
import { CAMPO_ACCESO } from '../login/formulario'
import { MarcoAcceso } from '@/components/acceso/marco-acceso'

const INICIAL: EstadoRestablecer = {}

export function FormularioRestablecer() {
  const [estado, accion, pendiente] = useActionState(restablecerContrasena, INICIAL)

  return (
    <MarcoAcceso>
      <h1 className="font-titulo text-3xl font-semibold text-tinta">Crea una contraseña nueva</h1>
      <p className="mt-1 mb-6 text-sm text-tinta-suave">
        Usa al menos 12 caracteres. Al guardarla entrarás directamente a tu cuenta.
      </p>

      <form action={accion} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-tinta">Contraseña nueva</label>
          <input id="password" name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" className={CAMPO_ACCESO} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirmacion" className="text-sm font-medium text-tinta">Repite la contraseña</label>
          <input id="confirmacion" name="confirmacion" type="password" required minLength={12} maxLength={72} autoComplete="new-password" className={CAMPO_ACCESO} />
        </div>
        {estado.error && (
          <p role="alert" className="rounded-xl border border-peligro/30 bg-peligro-suave px-4 py-3 text-sm text-peligro">
            {estado.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pendiente}
          className="h-12 w-full rounded-xl bg-marca text-base font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte active:scale-[0.98] disabled:opacity-60"
        >
          {pendiente ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </MarcoAcceso>
  )
}
