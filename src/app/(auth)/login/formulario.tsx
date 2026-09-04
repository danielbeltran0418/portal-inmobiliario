'use client'

import { useActionState } from 'react'
import { iniciarSesion, type EstadoFormulario } from './acciones'
import { WidgetTurnstile } from '../widget-turnstile'

const INICIAL: EstadoFormulario = {}

export function FormularioLogin({ claveTurnstile }: { claveTurnstile: string | null }) {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, INICIAL)

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
      <form action={accion} className="mt-6 space-y-4">
        <div>
          <label htmlFor="correo" className="block">Correo</label>
          <input id="correo" name="correo" type="email" placeholder="Correo" required className="w-full border p-2" />
        </div>
        <div>
          <label htmlFor="password" className="block">Contraseña</label>
          <input id="password" name="password" type="password" placeholder="Contraseña" required className="w-full border p-2" />
        </div>
        <WidgetTurnstile clave={claveTurnstile} reiniciarCon={estado} />
        {estado.error && <p role="alert" className="text-red-600">{estado.error}</p>}
        <button type="submit" disabled={pendiente} className="w-full bg-black p-2 text-white">
          {pendiente ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
