'use client'

import { useState } from 'react'
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
      <div className="aspect-[16/9] overflow-hidden rounded-2xl bg-marca-suave">
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
