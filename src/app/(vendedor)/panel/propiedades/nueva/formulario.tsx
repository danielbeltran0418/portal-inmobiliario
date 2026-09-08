'use client'

import { useActionState } from 'react'
import { crearBorrador, type EstadoPropiedad } from '../acciones'

const INICIAL: EstadoPropiedad = {}

/**
 * Mismo patron que src/app/(auth)/login/formulario.tsx: 'use client',
 * useActionState y el error con role="alert". crearBorrador (Task 8) redirige
 * a /panel/propiedades/[id] en cuanto crea la fila, asi que el unico estado
 * que este componente necesita mostrar es el error de validacion del titulo.
 */
export function FormularioNuevaPropiedad() {
  const [estado, accion, pendiente] = useActionState(crearBorrador, INICIAL)

  return (
    <form action={accion} className="mt-6 space-y-4">
      <div>
        <label htmlFor="titulo" className="block">Título</label>
        <input
          id="titulo"
          name="titulo"
          placeholder="Ej: Apartamento con vista al mar en el norte"
          required
          minLength={10}
          maxLength={120}
          className="w-full border p-2"
        />
        {estado.errores?.titulo && (
          <p role="alert" className="mt-1 text-red-600">{estado.errores.titulo}</p>
        )}
      </div>

      {estado.error && <p role="alert" className="text-red-600">{estado.error}</p>}

      <button type="submit" disabled={pendiente} className="w-full bg-black p-2 text-white">
        {pendiente ? 'Creando...' : 'Crear borrador'}
      </button>
    </form>
  )
}
