'use client'

import { useActionState } from 'react'
import { iniciarSesion, type EstadoFormulario } from './acciones'

const INICIAL: EstadoFormulario = {}

export default function PaginaLogin() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, INICIAL)

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Iniciar sesion</h1>
      <form action={accion} className="mt-6 space-y-4">
        <input name="correo" type="email" placeholder="Correo" required className="w-full border p-2" />
        <input name="password" type="password" placeholder="Contrasena" required className="w-full border p-2" />
        {estado.error && <p role="alert" className="text-red-600">{estado.error}</p>}
        <button type="submit" disabled={pendiente} className="w-full bg-black p-2 text-white">
          {pendiente ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
