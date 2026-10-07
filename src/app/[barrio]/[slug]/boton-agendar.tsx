'use client'

import { useActionState } from 'react'
import { MessageCircle } from 'lucide-react'
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
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-marca py-2.5 text-sm font-semibold text-marca transition-colors hover:bg-marca-suave disabled:opacity-60">
        <MessageCircle aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />
        {abriendo ? 'Abriendo el asistente...' : texto}
      </button>
      {estado.error && <p role="alert" className="mt-2 text-sm text-peligro">{estado.error}</p>}
    </form>
  )
}
