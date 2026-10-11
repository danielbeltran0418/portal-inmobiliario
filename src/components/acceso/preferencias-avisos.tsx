'use client'

import { useActionState } from 'react'
import { guardarPreferencias, type EstadoPreferencias } from './acciones-preferencias'
const INICIAL: EstadoPreferencias = {}
export function PreferenciasAvisos({ leads = false, precios = false, whatsapp = false, whatsappDisponible = false }: { leads?: boolean; precios?: boolean; whatsapp?: boolean; whatsappDisponible?: boolean }) {
  const [estado, accion, pendiente] = useActionState(guardarPreferencias, INICIAL)
  return <form action={accion} className="my-6 rounded-2xl border border-linea bg-superficie p-5">
    <fieldset className="space-y-3"><legend className="mb-3 font-semibold text-tinta">Tus avisos</legend>
      <label className="flex min-h-10 items-center gap-3 text-sm text-tinta"><input type="checkbox" name="avisos_precios" defaultChecked={precios} className="size-4 accent-[var(--marca)]" />Avisarme cuando baje de precio una propiedad favorita</label>
      <label className="flex min-h-10 items-center gap-3 text-sm text-tinta"><input type="checkbox" name="avisos_leads" defaultChecked={leads} className="size-4 accent-[var(--marca)]" />Avisarme cuando alguien solicite información sobre mis anuncios</label>
      {whatsappDisponible && <label className="flex min-h-10 items-center gap-3 text-sm text-tinta"><input type="checkbox" name="avisos_leads_whatsapp" defaultChecked={whatsapp} className="size-4 accent-[var(--marca)]" />Recibir solicitudes por WhatsApp en el celular confirmado de mi cuenta</label>}
    </fieldset>
    <button disabled={pendiente} className="mt-4 min-h-11 rounded-xl border border-marca px-4 text-sm font-semibold text-marca disabled:opacity-50">{pendiente ? 'Guardando…' : 'Guardar preferencias'}</button>
    {estado.error && <p role="alert" className="mt-3 text-sm text-peligro">{estado.error}</p>}
    {estado.guardado && <p role="status" className="mt-3 text-sm text-marca">Preferencias guardadas.</p>}
  </form>
}