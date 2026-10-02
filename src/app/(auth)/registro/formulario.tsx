'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { registrarUsuario, type EstadoFormulario } from './acciones'
import { WidgetTurnstile } from '../widget-turnstile'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

const INICIAL: EstadoFormulario = {}

const campoClase = 'h-11 rounded-md border border-linea bg-superficie px-3 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue focus:border-marca focus:ring-2 focus:ring-marca/20'

export function FormularioRegistro({ claveTurnstile }: { claveTurnstile: string | null }) {
  const [estado, accion, pendiente] = useActionState(registrarUsuario, INICIAL)

  if (estado.exito) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-12 sm:py-16">
        <Card className="w-full max-w-md border-linea bg-superficie shadow-sm">
          <CardHeader>
            <h1 data-slot="card-title" className="font-titulo text-2xl leading-none font-semibold">Revisa tu correo</h1>
            <CardDescription>Te enviamos un enlace de verificación para activar tu cuenta.</CardDescription>
          </CardHeader>
          <CardContent><Link href="/login" className="text-sm font-semibold text-marca hover:underline">Volver a iniciar sesión</Link></CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12 sm:py-16">
      <Card className="w-full max-w-lg border-linea bg-superficie shadow-sm">
        <CardHeader className="gap-2">
          <h1 data-slot="card-title" className="font-titulo text-2xl leading-none font-semibold">Crea tu cuenta</h1>
          <CardDescription>Elige cómo quieres usar el portal. Podrás cambiar tus datos después.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={accion} className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label htmlFor="nombre" className="text-sm font-medium text-tinta">Nombre completo</label>
                <input id="nombre" name="nombre" placeholder="Tu nombre" required autoComplete="name" className={campoClase} />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="correo" className="text-sm font-medium text-tinta">Correo electrónico</label>
                <input id="correo" name="correo" type="email" placeholder="tu@correo.com" required autoComplete="email" className={campoClase} />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="telefono" className="text-sm font-medium text-tinta">Celular</label>
                <input id="telefono" name="telefono" placeholder="300 000 0000" required autoComplete="tel" inputMode="tel" className={campoClase} />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label htmlFor="password" className="text-sm font-medium text-tinta">Contraseña <span className="font-normal text-tinta-suave">(mínimo 12 caracteres)</span></label>
                <input id="password" name="password" type="password" placeholder="Crea una contraseña segura" required minLength={12} autoComplete="new-password" className={campoClase} />
              </div>
            </div>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-medium text-tinta">¿Qué quieres hacer?</legend>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-linea p-3 transition-colors has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
                <input type="radio" name="rol" value="comprador" defaultChecked className="mt-1 accent-[var(--marca)]" />
                <span><span className="block text-sm font-medium text-tinta">Buscar una propiedad</span><span className="mt-0.5 block text-xs text-tinta-suave">Guarda favoritos, búsquedas y agenda visitas.</span></span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-linea p-3 transition-colors has-[:checked]:border-realce has-[:checked]:bg-realce-suave">
                <input type="radio" name="rol" value="vendedor" className="mt-1 accent-[var(--realce)]" />
                <span><span className="block text-sm font-medium text-tinta">Publicar propiedades</span><span className="mt-0.5 block text-xs text-tinta-suave">Gestiona inmuebles, visitas y contactos.</span></span>
              </label>
            </fieldset>
            <WidgetTurnstile clave={claveTurnstile} reiniciarCon={estado} />
            {estado.error && <p role="alert" className="rounded-md border border-peligro/30 bg-peligro-suave px-3 py-2 text-sm text-peligro">{estado.error}</p>}
            <Button type="submit" disabled={pendiente} className="h-11 w-full bg-marca text-marca-contraste hover:bg-marca-fuerte">
              {pendiente ? 'Creando…' : 'Crear mi cuenta'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-tinta-suave">¿Ya tienes una cuenta? <Link href="/login" className="font-semibold text-marca hover:underline">Iniciar sesión</Link></p>
        </CardContent>
      </Card>
    </main>
  )
}
