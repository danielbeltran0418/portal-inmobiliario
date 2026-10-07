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
    <form action={accion} className="mt-4 flex flex-wrap items-center gap-2 border-t border-linea pt-4">
      <input type="hidden" name="id" value={id} />
      <button type="submit" name="decision" value="aceptar" disabled={ocupado}
        className="min-h-10 flex-1 cursor-pointer rounded-xl bg-marca px-4 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte disabled:opacity-60">Aceptar y revelar contacto</button>
      <button type="submit" name="decision" value="descartar" disabled={ocupado}
        className="min-h-10 cursor-pointer rounded-xl border border-linea px-4 text-sm text-tinta-suave transition-colors hover:border-peligro hover:text-peligro disabled:opacity-60">Descartar</button>
      {estado.error && <p role="alert" className="w-full text-sm text-peligro">{estado.error}</p>}
    </form>
  )
}
