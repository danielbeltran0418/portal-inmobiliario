'use client'

import { useActionState } from 'react'
import { registrarUsuario, type EstadoFormulario } from './acciones'

const INICIAL: EstadoFormulario = {}

export default function PaginaRegistro() {
  const [estado, accion, pendiente] = useActionState(registrarUsuario, INICIAL)

  if (estado.exito) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-semibold">Revisa tu correo</h1>
        <p className="mt-4">
          Te enviamos un enlace de verificacion. Tu cuenta se activa cuando lo abras.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Crear cuenta</h1>
      <form action={accion} className="mt-6 space-y-4">
        <input name="nombre" placeholder="Nombre completo" required className="w-full border p-2" />
        <input name="correo" type="email" placeholder="Correo" required className="w-full border p-2" />
        <input name="telefono" placeholder="Celular (10 digitos)" required className="w-full border p-2" />
        <input name="password" type="password" placeholder="Contrasena (minimo 12)" required minLength={12} className="w-full border p-2" />
        <fieldset className="space-y-2">
          <legend>Quiero</legend>
          <label className="block"><input type="radio" name="rol" value="comprador" defaultChecked /> Buscar propiedad</label>
          <label className="block"><input type="radio" name="rol" value="vendedor" /> Publicar propiedades</label>
        </fieldset>
        {estado.error && <p role="alert" className="text-red-600">{estado.error}</p>}
        <button type="submit" disabled={pendiente} className="w-full bg-black p-2 text-white">
          {pendiente ? 'Creando...' : 'Crear cuenta'}
        </button>
      </form>
    </main>
  )
}
