'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { iniciarSesion, type EstadoFormulario } from './acciones'
import { WidgetTurnstile } from '../widget-turnstile'
import { MarcoAcceso } from '@/components/acceso/marco-acceso'

const INICIAL: EstadoFormulario = {}

export const CAMPO_ACCESO =
  'h-12 w-full rounded-xl border border-linea bg-superficie px-4 text-base text-tinta outline-none transition-colors placeholder:text-tinta-tenue focus:border-marca focus:ring-2 focus:ring-marca/25'

export function FormularioLogin(
  { claveTurnstile, volver, aviso = null }: {
    claveTurnstile: string | null
    volver: string | null
    aviso?: string | null
  },
) {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, INICIAL)

  return (
    <MarcoAcceso>
      <h1 className="font-titulo text-3xl font-semibold text-tinta">Iniciar sesión</h1>
      <p className="mt-1 mb-6 text-sm text-tinta-suave">
        Bienvenido de nuevo. Entra para gestionar tus propiedades o búsquedas guardadas.
      </p>

      {aviso && (
        <p role="alert" className="mb-5 rounded-xl border border-aviso/30 bg-aviso-suave px-4 py-3 text-sm text-aviso">
          {aviso}
        </p>
      )}

      <form action={accion} className="flex flex-col gap-4">
        {volver && <input type="hidden" name="volver" value={volver} />}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="correo" className="text-sm font-medium text-tinta">Correo electrónico</label>
          <input id="correo" name="correo" type="email" placeholder="tu@correo.com" required autoComplete="email" className={CAMPO_ACCESO} />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="text-sm font-medium text-tinta">Contraseña</label>
            <Link href="/recuperar" className="text-xs font-medium text-marca hover:underline">¿Olvidaste tu contraseña?</Link>
          </div>
          <input id="password" name="password" type="password" placeholder="Tu contraseña" required autoComplete="current-password" className={CAMPO_ACCESO} />
        </div>
        <WidgetTurnstile clave={claveTurnstile} reiniciarCon={estado} />
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
          {pendiente ? 'Entrando…' : 'Entrar a mi cuenta'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-tinta-suave">
        ¿Todavía no tienes cuenta?{' '}
        <Link href="/registro" className="font-semibold text-marca hover:underline">Crear una cuenta</Link>
      </p>
    </MarcoAcceso>
  )
}
