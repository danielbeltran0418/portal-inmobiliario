'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { registrarUsuario, type EstadoFormulario } from './acciones'
import { WidgetTurnstile } from '../widget-turnstile'
import { MarcoAcceso } from '@/components/acceso/marco-acceso'
import { CAMPO_ACCESO } from '../login/formulario'

const INICIAL: EstadoFormulario = {}

export function FormularioRegistro({ claveTurnstile }: { claveTurnstile: string | null }) {
  const [estado, accion, pendiente] = useActionState(registrarUsuario, INICIAL)

  if (estado.exito) {
    return (
      <MarcoAcceso>
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-marca-suave text-marca">
            <MailCheck aria-hidden="true" className="h-10 w-10" strokeWidth={1.5} />
          </div>
          <h1 className="mb-2 font-titulo text-3xl font-semibold text-tinta">Revisa tu correo</h1>
          <p className="mb-8 text-sm text-tinta-suave">
            Te enviamos un enlace de verificación para activar tu cuenta. Si no lo ves, revisa tu carpeta de spam.
          </p>
          <Link href="/login" className="text-sm font-semibold text-marca hover:underline">Volver a iniciar sesión</Link>
        </div>
      </MarcoAcceso>
    )
  }

  return (
    <MarcoAcceso>
      <h1 className="font-titulo text-3xl font-semibold text-tinta">Crea tu cuenta</h1>
      <p className="mt-1 mb-6 text-sm text-tinta-suave">Elige cómo quieres usar el portal. Podrás cambiar tus datos después.</p>

      <form action={accion} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nombre" className="text-sm font-medium text-tinta">Nombre completo</label>
          <input id="nombre" name="nombre" placeholder="Tu nombre" required autoComplete="name" className={CAMPO_ACCESO} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="correo" className="text-sm font-medium text-tinta">Correo electrónico</label>
            <input id="correo" name="correo" type="email" placeholder="tu@correo.com" required autoComplete="email" className={CAMPO_ACCESO} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="telefono" className="text-sm font-medium text-tinta">Celular</label>
            <input id="telefono" name="telefono" type="tel" placeholder="300 000 0000" required autoComplete="tel" inputMode="tel" className={CAMPO_ACCESO} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-tinta">
            Contraseña <span className="font-normal text-tinta-suave">(mínimo 12 caracteres)</span>
          </label>
          <input id="password" name="password" type="password" placeholder="Crea una contraseña segura" required minLength={12} autoComplete="new-password" className={CAMPO_ACCESO} />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-tinta">¿Qué quieres hacer?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-linea bg-superficie p-3 transition-colors has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
              <input type="radio" name="rol" value="comprador" defaultChecked className="mt-1 accent-[var(--marca)]" />
              <span>
                <span className="block text-sm font-semibold text-tinta">Buscar una propiedad</span>
                <span className="mt-0.5 block text-xs text-tinta-suave">Guarda favoritos, búsquedas y agenda visitas.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-linea bg-superficie p-3 transition-colors has-[:checked]:border-realce has-[:checked]:bg-realce-suave">
              <input type="radio" name="rol" value="vendedor" className="mt-1 accent-[var(--realce)]" />
              <span>
                <span className="block text-sm font-semibold text-tinta">Publicar propiedades</span>
                <span className="mt-0.5 block text-xs text-tinta-suave">Gestiona inmuebles, visitas y contactos.</span>
              </span>
            </label>
          </div>
        </fieldset>

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
          {pendiente ? 'Creando…' : 'Crear mi cuenta'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-tinta-suave">
        ¿Ya tienes una cuenta?{' '}
        <Link href="/login" className="font-semibold text-marca hover:underline">Iniciar sesión</Link>
      </p>
    </MarcoAcceso>
  )
}
