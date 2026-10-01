import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Home, Info, MessageCircle, ShieldAlert, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

export type EstadoPropiedad = 'borrador' | 'en_revision' | 'publicada' | 'pausada' | 'vendida' | 'rechazada'

export function ChipEstado({ estado, className }: { estado: string; className?: string }) {
  const estilos: Record<string, string> = {
    borrador: 'bg-muted text-muted-foreground', en_revision: 'bg-aviso-suave text-aviso', publicada: 'bg-exito-suave text-exito',
    pausada: 'bg-secondary text-secondary-foreground', vendida: 'bg-marca-suave text-marca-fuerte', rechazada: 'bg-peligro-suave text-peligro',
  }
  const etiquetas: Record<string, string> = { borrador: 'Borrador', en_revision: 'En revisión', publicada: 'Publicada', pausada: 'Pausada', vendida: 'Vendida', rechazada: 'Rechazada' }
  return <Badge variant="outline" className={cn('border-transparent font-semibold', estilos[estado] ?? 'bg-muted text-muted-foreground', className)}>{etiquetas[estado] ?? estado}</Badge>
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

export function TarjetaInmueble({ href, titulo, precio, operacion, barrio, imagen, alt = '', habitaciones, banos, area, destacada = false }: { href: string; titulo: string; precio: number; operacion: string; barrio: string; imagen?: string; alt?: string; habitaciones?: number | null; banos?: number | null; area?: number | null; destacada?: boolean }) {
  const precioTexto = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(precio)
  return <Card className="tarjeta-interactiva group overflow-hidden border-linea bg-superficie p-0"><Link href={href} className="block"><div className="relative aspect-[4/3] overflow-hidden bg-superficie-alt">{imagen ? <Image src={imagen} alt={alt || titulo} fill unoptimized className="object-cover transition-transform duration-300 group-hover:scale-105" /> : <div className="flex size-full items-center justify-center text-marca/50"><Home aria-hidden="true" className="size-12" /></div>}{destacada && <Badge className="absolute left-3 top-3 bg-realce text-white">Destacada</Badge>}<Badge className="absolute bottom-3 left-3 bg-superficie/90 text-tinta">{operacion}</Badge></div><CardHeader className="gap-1 pb-2"><CardTitle className="line-clamp-2 text-lg">{titulo}</CardTitle><p className="text-sm text-tinta-suave">{barrio}, Barranquilla</p></CardHeader><CardContent className="pb-4"><p className="cifra text-lg font-bold text-marca">{precioTexto}</p>{(habitaciones != null || banos != null || area != null) && <p className="mt-2 text-xs text-tinta-suave">{[habitaciones != null && `${habitaciones} hab.`, banos != null && `${banos} baños`, area != null && `${area} m²`].filter(Boolean).join(' · ')}</p>}</CardContent></Link><CardFooter className="border-t border-linea-suave py-3 text-xs font-semibold text-marca">Ver detalles</CardFooter></Card>
}

export function EstadoVacio({ titulo, descripcion, children, icono: Icono = Home }: { titulo: string; descripcion: string; children?: ReactNode; icono?: typeof Home }) {
  return <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-linea bg-superficie-alt/50 px-6 py-14 text-center"><div className="mb-4 flex size-12 items-center justify-center rounded-full bg-marca-suave text-marca"><Icono aria-hidden="true" /></div><h2 className="text-xl font-semibold">{titulo}</h2><p className="mt-2 max-w-md text-sm text-tinta-suave">{descripcion}</p>{children && <div className="mt-5">{children}</div>}</div>
}

export function ModalMotivo({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return <div className="rounded-lg border border-linea bg-superficie p-5"><h2 className="font-titulo text-xl font-semibold">{titulo}</h2>{descripcion && <p className="mt-1 text-sm text-tinta-suave">{descripcion}</p>}<div className="mt-4">{children}</div></div>
}
