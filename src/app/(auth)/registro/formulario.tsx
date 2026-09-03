'use client'

import { useActionState } from 'react'
import { registrarUsuario, type EstadoFormulario } from './acciones'
import { WidgetTurnstile } from '../widget-turnstile'

const INICIAL: EstadoFormulario = {}

export function FormularioRegistro({ claveTurnstile }: { claveTurnstile: string | null }) {
  const [estado, accion, pendiente] = useActionState(registrarUsuario, INICIAL)

  if (estado.exito) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-semibold">Revisa tu correo</h1>
        <p className="mt-4">
          Te enviamos un enlace de verificación. Tu cuenta se activa cuando lo abras.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Crear cuenta</h1>
      <form action={accion} className="mt-6 space-y-4">
        <div>
          <label htmlFor="nombre" className="block">Nombre completo</label>
          <input id="nombre" name="nombre" placeholder="Nombre completo" required className="w-full border p-2" />
        </div>
        <div>
          <label htmlFor="correo" className="block">Correo</label>
          <input id="correo" name="correo" type="email" placeholder="Correo" required className="w-full border p-2" />
        </div>
        <div>
          <label htmlFor="telefono" className="block">Celular (10 dígitos)</label>
          <input id="telefono" name="telefono" placeholder="Celular (10 dígitos)" required className="w-full border p-2" />
        </div>
        <div>
          <label htmlFor="password" className="block">Contraseña (mínimo 12)</label>
          <input id="password" name="password" type="password" placeholder="Contraseña (mínimo 12)" required minLength={12} className="w-full border p-2" />
        </div>
        <fieldset className="space-y-2">
          <legend>Quiero</legend>
          <label className="block"><input type="radio" name="rol" value="comprador" defaultChecked /> Buscar propiedad</label>
          <label className="block"><input type="radio" name="rol" value="vendedor" /> Publicar propiedades</label>
        </fieldset>
        <WidgetTurnstile clave={claveTurnstile} reiniciarCon={estado} />
        {estado.error && <p role="alert" className="text-red-600">{estado.error}</p>}
        <button type="submit" disabled={pendiente} className="w-full bg-black p-2 text-white">
          {pendiente ? 'Creando...' : 'Crear cuenta'}
        </button>
      </form>
    </main>
  )
}
