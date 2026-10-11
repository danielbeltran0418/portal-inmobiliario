'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'
import { PLANES } from '@/lib/planes/catalogo'

export interface TarifasPlanes {
  destacado: { mensual: number | null; anual: number | null }
  pro: { mensual: number | null; anual: number | null }
}
export function PlanesPublicacion({ tarifas }: { tarifas: TarifasPlanes }) {
  const [periodo, setPeriodo] = useState<'mensual' | 'anual'>('mensual')

  return <>
    <fieldset className="mx-auto mb-10 flex w-fit gap-1 rounded-full border border-linea bg-superficie p-1">
      <legend className="sr-only">Periodo de contratación</legend>
      {(['mensual', 'anual'] as const).map((valor) => <label key={valor} className="cursor-pointer rounded-full px-5 py-2 text-sm font-semibold text-tinta has-[:checked]:bg-marca has-[:checked]:text-marca-contraste has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-marca">
        <input className="sr-only" type="radio" name="periodo" value={valor} checked={periodo === valor} onChange={() => { setPeriodo(valor) }} />{valor === 'mensual' ? 'Mensual' : 'Anual'}
      </label>)}
    </fieldset>
    <div className="grid items-stretch gap-6 md:grid-cols-3">
      {PLANES.map((plan) => {
        const precio = plan.id === 'basico' ? 0 : tarifas[plan.id][periodo]
        return <article key={plan.id} className={`flex flex-col rounded-3xl border bg-superficie p-7 shadow-sm ${plan.id === 'destacado' ? 'border-marca ring-1 ring-marca' : 'border-linea'}`}>
          <h2 className="font-titulo text-2xl text-tinta">{plan.nombre}</h2>
          <p className="mt-2 text-sm text-tinta-suave">{plan.descripcion}</p>
          <p className="my-7 text-3xl font-semibold tracking-tight text-tinta">{precio === null ? 'Por definir' : precio === 0 ? 'Gratis' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(precio)}{precio !== null && precio > 0 && <span className="text-sm font-normal text-tinta-suave"> / {periodo === 'mensual' ? 'mes' : 'año'}</span>}</p>
          <ul className="mb-8 flex flex-1 flex-col gap-4">{plan.prestaciones.map((prestacion) => <li key={prestacion} className="flex gap-3 text-sm text-tinta"><Check aria-hidden="true" className="size-5 shrink-0 text-marca" />{prestacion}</li>)}</ul>
          {plan.id === 'basico' ? <Link href="/registro" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-marca px-4 font-semibold text-marca-contraste">Crear cuenta <ArrowRight aria-hidden="true" className="size-4" /></Link> : <Link href={`/planes/checkout?plan=${plan.id}&periodo=${periodo}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-marca px-4 font-semibold text-marca">Ver disponibilidad</Link>}
        </article>
      })}
    </div>

    <p className="mt-8 text-center text-sm text-tinta-suave">Los planes de pago están en preparación. La verificación de identidad se revisa por separado y no se obtiene automáticamente al pagar.</p>
  </>
}