'use client'

import { useState } from 'react'
import { Slider } from 'radix-ui'

export function RangoPrecio({ minimo, maximo, operacion }: { minimo?: number; maximo?: number; operacion?: string }) {
  const techo = Math.max(operacion === 'arriendo' ? 20_000_000 : 2_000_000_000, minimo ?? 0, maximo ?? 0)
  const [rango, setRango] = useState<[number, number]>([minimo ?? 0, maximo ?? techo])
  const [sinMaximo, setSinMaximo] = useState(maximo === undefined)
  const formato = (valor: number) => new Intl.NumberFormat('es-CO').format(valor)
  return <fieldset>
    <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-tinta-suave">Precio (COP)</legend>
    <Slider.Root value={rango} onValueChange={(valores) => { setRango([valores[0]!, valores[1]!]); setSinMaximo(false) }} min={0} max={techo} step={operacion === 'arriendo' ? 50_000 : 1_000_000} minStepsBetweenThumbs={1} className="relative mb-4 flex h-8 w-full touch-none select-none items-center">
      <Slider.Track className="relative h-1.5 grow rounded-full bg-superficie-alt"><Slider.Range className="absolute h-full rounded-full bg-marca" /></Slider.Track>
      <Slider.Thumb aria-label="Límite inferior del rango" aria-valuetext={`${formato(rango[0])} pesos`} className="block size-6 rounded-full border-2 border-marca bg-superficie shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca" />
      <Slider.Thumb aria-label="Límite superior del rango" aria-valuetext={`${formato(rango[1])} pesos`} className="block size-6 rounded-full border-2 border-marca bg-superficie shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca" />
    </Slider.Root>
    <div className="grid gap-2">
      <label className="text-xs text-tinta-suave">Precio mínimo<input name="precio_min" type="number" min="0" max={techo} step="0.01" value={rango[0] === 0 ? '' : rango[0]} onChange={(evento) => { setRango([Math.min(Number(evento.target.value), rango[1]), rango[1]]) }} placeholder="Sin mínimo" className="mt-1 h-11 w-full rounded-xl border border-linea bg-fondo px-3 text-base text-tinta" /></label>
      <label className="text-xs text-tinta-suave">Precio máximo<input name="precio_max" type="number" min={rango[0]} step="0.01" value={sinMaximo ? '' : rango[1]} onChange={(evento) => { setSinMaximo(evento.target.value === ''); setRango([rango[0], evento.target.value === '' ? techo : Math.min(techo, Math.max(rango[0], Number(evento.target.value)))]) }} placeholder="Sin máximo" className="mt-1 h-11 w-full rounded-xl border border-linea bg-fondo px-3 text-base text-tinta" /></label>
    </div>
  </fieldset>
}