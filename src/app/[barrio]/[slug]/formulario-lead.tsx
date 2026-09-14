'use client'

import { useActionState } from 'react'
import { enviarLead, type EstadoLead } from './acciones'

const CAMPO = 'block w-full rounded-sm border border-linea bg-superficie px-3 py-2 text-tinta'

export function FormularioLead(
  { propiedadId, telefonoPrevio }: { propiedadId: string; telefonoPrevio: string },
) {
  const [estado, accion, enviando] = useActionState<EstadoLead, FormData>(enviarLead, {})

  if (estado.enviado) {
    return (
      <p className="rounded-md border border-exito bg-exito-suave p-4 text-exito">
        Tu mensaje se envio. El vendedor vera tus datos de contacto cuando lo acepte.
      </p>
    )
  }

  return (
    <form action={accion} className="rounded-md border border-linea bg-superficie p-6">
      <h2 className="text-xl font-semibold text-tinta">Contactar al vendedor</h2>
      <input type="hidden" name="propiedad_id" value={propiedadId} />

      <label className="mt-4 block text-sm text-tinta-suave">
        Telefono
        <input className={`${CAMPO} mt-1`} name="telefono" defaultValue={telefonoPrevio} required />
      </label>

      <label className="mt-4 block text-sm text-tinta-suave">
        Mensaje
        <textarea className={`${CAMPO} mt-1`} name="mensaje" rows={4} required
          placeholder="Cuentale al vendedor que te interesa." />
      </label>

      {estado.error && <p className="mt-3 text-sm text-peligro">{estado.error}</p>}

      <button type="submit" disabled={enviando}
        className="mt-4 cursor-pointer rounded-sm bg-marca px-5 py-2 font-medium text-marca-contraste hover:bg-marca-fuerte disabled:opacity-60">
        {enviando ? 'Enviando...' : 'Enviar mensaje'}
      </button>
    </form>
  )
}
