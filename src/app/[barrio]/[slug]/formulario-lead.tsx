'use client'

import { useActionState } from 'react'
import { Lock } from 'lucide-react'
import { enviarLead, type EstadoLead } from './acciones'

const CAMPO =
  'block w-full rounded-xl border border-linea bg-fondo px-4 py-3 text-base text-tinta placeholder:text-tinta-tenue focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25'

export function FormularioLead(
  { propiedadId, telefonoPrevio }: { propiedadId: string; telefonoPrevio: string },
) {
  const [estado, accion, enviando] = useActionState<EstadoLead, FormData>(enviarLead, {})

  if (estado.enviado) {
    return (
      <p role="status" className="rounded-xl border border-exito/30 bg-exito-suave p-4 text-sm text-exito">
        Tu mensaje se envio. El vendedor vera tus datos de contacto cuando lo acepte.
      </p>
    )
  }

  return (
    <form action={accion} className="flex flex-col gap-4">
      <div>
        <h2 className="mb-1 font-titulo text-xl font-semibold text-tinta">Contactar al vendedor</h2>
        <p className="text-sm text-tinta-suave">Escríbele directamente. El vendedor recibirá tu mensaje.</p>
      </div>
      <input type="hidden" name="propiedad_id" value={propiedadId} />

      <label className="block text-sm font-medium text-tinta">
        Mensaje
        <textarea className={`${CAMPO} mt-1.5 resize-none`} name="mensaje" rows={4} required
          placeholder="Hola, me interesa este inmueble. ¿Podría agendar una visita?" />
      </label>

      <label className="block text-sm font-medium text-tinta">
        Teléfono de contacto
        <input className={`${CAMPO} mt-1.5`} name="telefono" type="tel" autoComplete="tel" inputMode="tel" defaultValue={telefonoPrevio} required placeholder="300 123 4567" />
      </label>

      <p className="flex items-start gap-2.5 rounded-xl bg-realce-suave p-3 text-xs leading-relaxed text-realce">
        <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
        Tu teléfono solo se comparte cuando el vendedor acepta tu mensaje.
      </p>

      {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}

      <button type="submit" disabled={enviando}
        className="w-full cursor-pointer rounded-xl bg-marca py-3 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte disabled:opacity-60">
        {enviando ? 'Enviando...' : 'Enviar mensaje'}
      </button>
    </form>
  )
}
