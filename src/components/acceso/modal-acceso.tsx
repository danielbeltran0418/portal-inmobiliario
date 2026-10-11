'use client'

import Link from 'next/link'
import { Home, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export function ModalAcceso() {
  return <Dialog>
    <DialogTrigger asChild><button type="button" className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-tinta-suave hover:bg-superficie-alt">Entrar</button></DialogTrigger>
    <DialogContent className="rounded-3xl bg-superficie p-7">
      <DialogTitle className="font-titulo text-2xl">Tu próximo hogar empieza aquí</DialogTitle>
      <DialogDescription>Entra a tu cuenta o elige cómo quieres usar el portal.</DialogDescription>
      <Link href="/login" className="mt-2 inline-flex min-h-12 items-center justify-center rounded-xl bg-marca font-semibold text-marca-contraste">Iniciar sesión</Link>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/registro?rol=comprador" className="rounded-2xl border border-linea p-4 text-tinta hover:border-marca"><Search aria-hidden="true" className="mb-3 size-5 text-marca" /><span className="block font-semibold">Quiero comprar o arrendar</span><span className="mt-2 block text-sm text-tinta-suave">Guarda favoritos y agenda visitas.</span></Link>
        <Link href="/registro?rol=vendedor" className="rounded-2xl border border-linea p-4 text-tinta hover:border-marca"><Home aria-hidden="true" className="mb-3 size-5 text-marca" /><span className="block font-semibold">Soy propietario o agente</span><span className="mt-2 block text-sm text-tinta-suave">Publica y gestiona tus inmuebles.</span></Link>
      </div>
      <Link href="/planes" className="text-center text-sm font-semibold text-marca hover:underline">Explorar planes de publicación</Link>
    </DialogContent>
  </Dialog>
}