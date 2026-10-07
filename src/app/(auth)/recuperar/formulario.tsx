'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { solicitarRecuperacion, type EstadoRecuperacion } from './acciones'
import { WidgetTurnstile } from '../widget-turnstile'
import { CAMPO_ACCESO } from '../login/formulario'
import { MarcoAcceso } from '@/components/acceso/marco-acceso'

const INICIAL: EstadoRecuperacion = {}

export function FormularioRecuperar(
  { claveTurnstile, aviso = null }: { claveTurnstile: string | null; aviso?: string | null },
) {
  const [estado, accion, pendiente] = useActionState(solicitarRecuperacion, INICIAL)

  return (
    <MarcoAcceso>
      <h1 className="font-titulo text-3xl font-semibold text-tinta">¿Olvidaste tu contraseña?</h1>
      <p className="mt-1 mb-6 text-sm text-tinta-suave">
        Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva.
      </p>

      {estado.enviado ? (
        <div role="status" className="flex flex-col items-center rounded-2xl border border-linea bg-superficie px-6 py-8 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-marca-suave">
            <MailCheck aria-hidden="true" className="h-7 w-7 text-marca" />
          </span>
          <p className="text-sm text-tinta">{estado.mensaje}</p>
        </div>
      ) : (
        <>
          {aviso && (
            <p role="alert" className="mb-5 rounded-xl border border-aviso/30 bg-aviso-suave px-4 py-3 text-sm text-aviso">
              {aviso}
            </p>
          )}
          <form action={accion} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="correo" className="text-sm font-medium text-tinta">Correo electrónico</label>
              <input id="correo" name="correo" type="email" placeholder="tu@correo.com" required autoComplete="email" className={CAMPO_ACCESO} />
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
              {pendiente ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-sm text-tinta-suave">
        ¿La recordaste?{' '}
        <Link href="/login" className="font-semibold text-marca hover:underline">Volver a iniciar sesión</Link>
      </p>
    </MarcoAcceso>
  )
}
