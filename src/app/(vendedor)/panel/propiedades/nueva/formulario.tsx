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
          className="w-full rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
        />
        {estado.errores?.titulo && (
          <p role="alert" className="mt-1 text-sm text-peligro">{estado.errores.titulo}</p>
        )}
      </div>

      {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}

      <button type="submit" disabled={pendiente} className="w-full cursor-pointer rounded-xl bg-marca py-3 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte disabled:opacity-60">
        {pendiente ? 'Creando...' : 'Crear borrador'}
      </button>
    </form>
  )
}
