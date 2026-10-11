'use client'

import { useState, useTransition, type ReactNode, type FormEvent } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export function FiltrosAdaptables({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const router = useRouter()
  const ruta = usePathname()
  function enviar(evento: FormEvent<HTMLElement>) {
    if (!(evento.target instanceof HTMLFormElement)) return
    evento.preventDefault()
    const parametros = new URLSearchParams()
    for (const [clave, valor] of new FormData(evento.target)) if (typeof valor === 'string' && valor) parametros.set(clave, valor)
    iniciar(() => { router.push(`${ruta}?${parametros}`); setAbierto(false) })
  }
  return <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-64" onSubmitCapture={enviar} aria-busy={pendiente}>
    <div className="hidden lg:block">{children}</div>
    <div className="lg:hidden"><Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-linea bg-superficie px-4 font-semibold text-tinta"><SlidersHorizontal aria-hidden="true" className="size-4" />Filtros</button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-superficie"><DialogTitle>Encuentra tu espacio</DialogTitle><DialogDescription>Ajusta los filtros para encontrar lo que necesitas.</DialogDescription>{children}</DialogContent>
    </Dialog></div>
    <noscript><div className="lg:hidden">{children}</div></noscript>
    {pendiente && <p role="status" className="mt-3 text-sm text-marca">Actualizando resultados…</p>}
  </aside>
}