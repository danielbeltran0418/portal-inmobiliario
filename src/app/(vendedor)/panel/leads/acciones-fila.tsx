'use client'

import { useActionState } from 'react'
import { aceptarLead, descartarLead } from './acciones'

type Resultado = { error?: string }

export function AccionesLead({ id }: { id: string }) {
  const [estado, accion, ocupado] = useActionState<Resultado, FormData>(
    async (_previo, formData) =>
      formData.get('decision') === 'aceptar'
        ? await aceptarLead(formData)
        : await descartarLead(formData),
    {},
  )

  return (
    <form action={accion} className="mt-3 flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button type="submit" name="decision" value="aceptar" disabled={ocupado}
        className="cursor-pointer rounded-sm bg-marca px-4 py-1.5 text-sm font-medium text-marca-contraste hover:bg-marca-fuerte disabled:opacity-60">
        Aceptar
      </button>
      <button type="submit" name="decision" value="descartar" disabled={ocupado}
        className="cursor-pointer rounded-sm border border-linea px-4 py-1.5 text-sm text-tinta-suave hover:border-peligro hover:text-peligro disabled:opacity-60">
        Descartar
      </button>
      {estado.error && <span className="text-sm text-peligro">{estado.error}</span>}
    </form>
  )
}
