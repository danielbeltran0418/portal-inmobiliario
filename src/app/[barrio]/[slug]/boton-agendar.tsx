'use client'

import { useActionState } from 'react'
import { iniciarChatAgendamiento, type EstadoAgendar } from './acciones'

/**
 * Abre el chat con el asistente que agenda la visita. La accion redirige a
 * /mi-cuenta/chat/<lead>; solo vuelve aqui con un error.
 */
export function BotonAgendar(
  { propiedadId, rutaFicha, texto }: { propiedadId: string; rutaFicha: string; texto: string },
) {
  const [estado, accion, abriendo] = useActionState<EstadoAgendar, FormData>(iniciarChatAgendamiento, {})

  return (
    <form action={accion}>
      <input type="hidden" name="propiedad_id" value={propiedadId} />
      <input type="hidden" name="ruta_ficha" value={rutaFicha} />
      <button type="submit" disabled={abriendo}
        className="cursor-pointer rounded-sm bg-marca px-5 py-2 font-medium text-marca-contraste hover:bg-marca-fuerte disabled:opacity-60">
        {abriendo ? 'Abriendo el asistente...' : texto}
      </button>
      {estado.error && <p role="alert" className="mt-2 text-sm text-peligro">{estado.error}</p>}
    </form>
  )
}
