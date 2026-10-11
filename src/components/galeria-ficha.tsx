'use client'

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import Image from 'next/image'

interface Foto {
  id: string
  alt_text: string
  orden: number
}

/**
 * Galeria de la ficha (diseño de Figma Make): una foto principal en 16:9 y una
 * miniatura por foto debajo; al pulsar una miniatura pasa a ser la principal.
 *
 * Es de cliente por ese estado. La principal es la unica que se pide con
 * prioridad (es la que pinta el LCP); las miniaturas siguen el diferido de
 * next/image. Las miniaturas son botones con su nombre accesible ("Ver foto N")
 * y aria-pressed, asi que su imagen es decorativa (alt vacio).
 */
export function GaleriaFicha({ fotos, titulo }: { fotos: Foto[]; titulo: string }) {
  const [activa, setActiva] = useState(0)
  const inicioToque = useRef<{ x: number; y: number } | null>(null)
  const avanzar = (paso: number) => setActiva((actual) => (actual + paso + fotos.length) % fotos.length)
  const ordenadas = [...fotos].sort((a, b) => a.orden - b.orden)

  if (ordenadas.length === 0) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl border border-linea bg-superficie-alt text-sm text-tinta-tenue">
        Sin fotografías
      </div>
    )
  }

  const principal = ordenadas[activa] ?? ordenadas[0]!

  return (
    <div>
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-marca-suave">
        <Image
          key={principal.id}
          src={`/imagen/${principal.id}`}
          alt={principal.alt_text || titulo}
          width={1200}
          height={675}
          unoptimized
          loading="eager"
          fetchPriority="high"
          className="h-full w-full object-cover"
        />
        <Dialog>
          <DialogTrigger asChild>
            <button type="button" className="absolute bottom-4 right-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-superficie px-4 text-sm font-semibold text-tinta shadow-md">
              <Expand aria-hidden="true" className="size-4" /> Ver fotografías
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[95dvh] overflow-y-auto bg-superficie sm:max-w-5xl">
            <DialogTitle className="pr-8">{titulo}</DialogTitle>
            <DialogDescription>Usa las flechas o desliza para explorar las fotografías.</DialogDescription>
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-superficie-alt sm:aspect-[16/9]"
              tabIndex={0} role="region" aria-label="Fotografías del inmueble"
              onKeyDown={(evento) => {
                if (evento.key === 'ArrowLeft') { evento.preventDefault(); avanzar(-1) }
                if (evento.key === 'ArrowRight') { evento.preventDefault(); avanzar(1) }
              }}
              onTouchStart={(evento) => {
                const toque = evento.touches[0]
                inicioToque.current = toque ? { x: toque.clientX, y: toque.clientY } : null
              }}
              onTouchEnd={(evento) => {
                const toque = evento.changedTouches[0]
                const inicio = inicioToque.current
                inicioToque.current = null
                if (!inicio || !toque) return
                const dx = toque.clientX - inicio.x
                const dy = toque.clientY - inicio.y
                if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) avanzar(dx < 0 ? 1 : -1)
              }}>
              <Image src={`/imagen/${principal.id}`} alt={principal.alt_text || titulo} width={1200} height={900} unoptimized className="h-full w-full object-contain" />
              {ordenadas.length > 1 && <>
                <button type="button" aria-label="Foto anterior" onClick={() => avanzar(-1)} className="absolute left-2 grid size-11 place-items-center rounded-full bg-superficie text-tinta shadow-md"><ChevronLeft aria-hidden="true" /></button>
                <button type="button" aria-label="Foto siguiente" onClick={() => avanzar(1)} className="absolute right-2 grid size-11 place-items-center rounded-full bg-superficie text-tinta shadow-md"><ChevronRight aria-hidden="true" /></button>
              </>}
            </div>
            <p role="status" aria-live="polite" className="text-center text-sm text-tinta-suave">Foto {activa + 1} de {ordenadas.length}</p>
          </DialogContent>
        </Dialog>
      </div>

      {ordenadas.length > 1 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {ordenadas.map((foto, i) => (
            <button
              key={foto.id}
              type="button"
              aria-label={`Ver foto ${i + 1}`}
              aria-pressed={i === activa}
              onClick={() => setActiva(i)}
              className={`aspect-[4/3] cursor-pointer overflow-hidden rounded-xl bg-marca-suave transition-opacity ${
                i === activa ? 'ring-2 ring-marca ring-offset-1 ring-offset-fondo' : 'opacity-70 hover:opacity-100'
              }`}
            >
              <Image
                src={`/imagen/${foto.id}`}
                alt=""
                width={300}
                height={225}
                unoptimized
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
