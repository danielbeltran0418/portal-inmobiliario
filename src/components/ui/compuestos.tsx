import type { ReactNode } from 'react'
import Link from 'next/link'
import { Home, Info, MessageCircle, ShieldAlert, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type EstadoPropiedad = 'borrador' | 'en_revision' | 'publicada' | 'pausada' | 'vendida' | 'rechazada'

type IconoLucide = typeof Home

export function ChipEstado({ estado, className, children }: { estado: string; className?: string; children?: ReactNode }) {
  const estilos: Record<string, string> = {
    borrador: 'bg-muted text-muted-foreground',
    en_revision: 'bg-aviso-suave text-aviso',
    publicada: 'bg-exito-suave text-exito',
    pausada: 'bg-secondary text-secondary-foreground',
    vendida: 'bg-marca-suave text-marca-fuerte',
    rechazada: 'bg-peligro-suave text-peligro',
  }
  const etiquetas: Record<string, string> = {
    borrador: 'Borrador', en_revision: 'En revisión', publicada: 'Publicada',
    pausada: 'Pausada', vendida: 'Vendida', rechazada: 'Rechazada',
  }
  return <Badge variant="outline" className={cn('border-transparent font-semibold', estilos[estado] ?? 'bg-muted text-muted-foreground', className)}>{children ?? etiquetas[estado] ?? estado}</Badge>
}

export function Aviso({ variante = 'aviso', titulo, children, className }: { variante?: 'aviso' | 'peligro' | 'exito' | 'info'; titulo?: string; children: ReactNode; className?: string }) {
  const Icono = variante === 'peligro' ? ShieldAlert : variante === 'exito' ? Sparkles : variante === 'info' ? Info : MessageCircle
  const color = { aviso: 'border-aviso/30 bg-aviso-suave text-aviso', peligro: 'border-peligro/30 bg-peligro-suave text-peligro', exito: 'border-exito/30 bg-exito-suave text-exito', info: 'border-marca/30 bg-marca-suave text-marca-fuerte' }[variante]
  return <Alert className={cn(color, className)}><Icono aria-hidden="true" /><div>{titulo && <AlertTitle>{titulo}</AlertTitle>}<AlertDescription className="text-inherit">{children}</AlertDescription></div></Alert>
}

export function BurbujaChat({ rol, children }: { rol: 'comprador' | 'asistente'; children: ReactNode }) {
  const comprador = rol === 'comprador'
  return <div className={cn('flex gap-3', comprador ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed', comprador ? 'rounded-br-sm bg-marca text-marca-contraste' : 'rounded-bl-sm border border-linea bg-superficie text-tinta')}><span className="sr-only">{comprador ? 'Tú' : 'Asistente'}: </span>{children}</div></div>
}

export function EstadoVacio({ titulo, descripcion, children, icono: Icono = Home }: { titulo: string; descripcion: string; children?: ReactNode; icono?: IconoLucide }) {
  return <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-linea bg-superficie-alt/50 px-6 py-14 text-center"><div className="mb-4 flex size-12 items-center justify-center rounded-full bg-marca-suave text-marca"><Icono aria-hidden="true" /></div><h2 className="text-xl font-semibold">{titulo}</h2><p className="mt-2 max-w-md text-sm text-tinta-suave">{descripcion}</p>{children && <div className="mt-5">{children}</div>}</div>
}

export function ModalMotivo({ titulo, descripcion, trigger, children }: { titulo: string; descripcion?: string; trigger: ReactNode; children: ReactNode }) {
  return <Dialog><DialogTrigger asChild>{trigger}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{titulo}</DialogTitle>{descripcion && <DialogDescription>{descripcion}</DialogDescription>}</DialogHeader>{children}</DialogContent></Dialog>
}

export type EnlaceNavegacion = { destino: string; etiqueta: string }

export function MenuMovil({ enlaces, cerrarSesion, autenticado = false }: { enlaces: readonly EnlaceNavegacion[]; cerrarSesion: () => Promise<void>; autenticado?: boolean }) {
  return <Sheet><SheetTrigger asChild><button type="button" className="rounded-md border border-linea px-3 py-2 text-sm font-medium text-tinta-suave md:hidden">Menú</button></SheetTrigger><SheetContent side="right"><SheetHeader><SheetTitle>Menú</SheetTitle><SheetDescription className="sr-only">Navegación principal</SheetDescription></SheetHeader><nav aria-label="Menú móvil" className="flex flex-col gap-2 px-4">{enlaces.map((enlace) => <Link key={enlace.destino} href={enlace.destino} className="rounded-md px-3 py-2 text-sm hover:bg-superficie-alt">{enlace.etiqueta}</Link>)}{autenticado && <form action={cerrarSesion}><button type="submit" className="rounded-md px-3 py-2 text-left text-sm text-tinta-suave hover:bg-superficie-alt">Cerrar sesión</button></form>}</nav></SheetContent></Sheet>
}

export function MenuMovilCliente({ enlaces }: { enlaces: EnlaceNavegacion[] }) {
  return <div className="md:hidden"><nav aria-label="Menú móvil" className="flex flex-col gap-2">{enlaces.map((enlace) => <Link key={enlace.destino} href={enlace.destino} className="rounded-md px-3 py-2 text-sm hover:bg-superficie-alt">{enlace.etiqueta}</Link>)}</nav></div>
}
