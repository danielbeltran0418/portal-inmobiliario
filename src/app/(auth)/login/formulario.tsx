'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { iniciarSesion, type EstadoFormulario } from './acciones'
import { WidgetTurnstile } from '../widget-turnstile'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const INICIAL: EstadoFormulario = {}

export function FormularioLogin(
  { claveTurnstile, volver, aviso = null }: {
    claveTurnstile: string | null
    volver: string | null
    aviso?: string | null
  },
) {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, INICIAL)

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12 sm:py-16">
      <Card className="w-full max-w-md border-linea bg-superficie shadow-sm">
        <CardHeader className="gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg bg-marca-suave text-marca" aria-hidden="true">
            <span className="text-lg font-bold">PI</span>
          </div>
          <div>
            <CardTitle className="font-titulo text-2xl">Bienvenido de nuevo</CardTitle>
            <CardDescription className="mt-2">Entra para gestionar tus propiedades o búsquedas guardadas.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {aviso && <Alert className="mb-5 border-aviso/30 bg-aviso-suave text-aviso"><AlertDescription className="text-inherit">{aviso}</AlertDescription></Alert>}
          <form action={accion} className="flex flex-col gap-5">
            {volver && <input type="hidden" name="volver" value={volver} />}
            <div className="flex flex-col gap-2">
              <label htmlFor="correo" className="text-sm font-medium text-tinta">Correo electrónico</label>
              <input id="correo" name="correo" type="email" placeholder="tu@correo.com" required autoComplete="email" className="h-11 rounded-md border border-linea bg-superficie px-3 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue focus:border-marca focus:ring-2 focus:ring-marca/20" />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-medium text-tinta">Contraseña</label>
              <input id="password" name="password" type="password" placeholder="Tu contraseña" required autoComplete="current-password" className="h-11 rounded-md border border-linea bg-superficie px-3 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue focus:border-marca focus:ring-2 focus:ring-marca/20" />
            </div>
            <WidgetTurnstile clave={claveTurnstile} reiniciarCon={estado} />
            {estado.error && <p role="alert" className="rounded-md border border-peligro/30 bg-peligro-suave px-3 py-2 text-sm text-peligro">{estado.error}</p>}
            <Button type="submit" disabled={pendiente} className="h-11 w-full bg-marca text-marca-contraste hover:bg-marca-fuerte">
              {pendiente ? 'Entrando…' : 'Entrar a mi cuenta'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-tinta-suave">¿Todavía no tienes cuenta? <Link href="/registro" className="font-semibold text-marca hover:underline">Crear una cuenta</Link></p>
        </CardContent>
      </Card>
    </main>
  )
}
