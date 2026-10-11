'use client'

import { useActionState } from 'react'
import { prepararCheckout, type EstadoCheckout } from './acciones-checkout'
const INICIAL: EstadoCheckout = {}
export function CheckoutPlan({ plan, periodo, disponible }: { plan: 'destacado' | 'pro'; periodo: 'mensual' | 'anual'; disponible: boolean }) {
  const [estado, accion, pendiente] = useActionState(prepararCheckout, INICIAL)
  return <div className="mt-6">
    <form action={accion}>
      <input type="hidden" name="plan" value={plan} /><input type="hidden" name="periodo" value={periodo} />
      <button type="submit" disabled={!disponible || pendiente || Boolean(estado.url)} className="min-h-12 w-full rounded-xl bg-marca px-4 font-semibold text-marca-contraste disabled:opacity-50">{pendiente ? 'Preparando…' : 'Preparar pago seguro'}</button>
    </form>
    {estado.error && <p role="alert" className="mt-3 text-sm text-peligro">{estado.error}</p>}
    {estado.url && <a href={estado.url} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-marca px-4 font-semibold text-marca">Continuar al checkout de Wompi</a>}
    {!disponible && <p className="mt-3 text-sm text-tinta-suave">Estamos definiendo los precios y preparando el pago. Por ahora no se realizan cobros.</p>}
  </div>
}