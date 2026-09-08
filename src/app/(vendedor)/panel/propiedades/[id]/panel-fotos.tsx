'use client'

import { useActionState } from 'react'
import Image from 'next/image'
import {
  subirImagen, eliminarImagen, reordenarImagen, type EstadoImagen,
} from './acciones-imagenes'

const INICIAL: EstadoImagen = {}
const ANCHO_MINIATURA = 160
const ALTO_MINIATURA = 120

export interface ImagenPanel {
  id: string
  altText: string
  /** URL YA firmada (firmarImagenes, Task 10) o null si no se pudo firmar. */
  url: string | null
}

/**
 * Cliente. Muestra las fotos ya subidas y el formulario de subida
 * (useActionState(subirImagen, {}), mismo patron que el resto de
 * formularios). eliminarImagen y reordenarImagen (Task 10) no tienen la
 * firma (prevState, formData) que useActionState exige -- son funciones
 * `'use server'` normales de (imagenId, propiedadId[, direccion]), y ademas
 * devuelven Promise<EstadoImagen>, no Promise<void>. `action` de un <form>
 * exige `(formData) => void | Promise<void>`, asi que se envuelven en un
 * closure local `async () => { await accion(...) }` en vez de un
 * `.bind(null, ...)` directo -- aqui, a diferencia de la pagina de edicion
 * (Server Component), el closure NO necesita su propio 'use server': este
 * archivo ya es cliente, asi que el closure corre en el navegador y de ahi
 * llama a la Server Action real (que si cruza al servidor).
 *
 * next/image con `unoptimized`: las URLs firmadas caducan (1 hora, ver
 * firmar.ts) y el optimizador de Next las volveria a pedir bajo una URL
 * propia cacheada, que dejaria de servir en cuanto la firma expire.
 * `unoptimized` no renuncia a declarar width/height, que es lo que evita el
 * salto de maquetacion (Core Web Vitals) -- por eso se sigue usando
 * next/image y no un <img> a secas (ademas prohibido por el lint,
 * @next/next/no-img-element).
 *
 * `maximoFotos` y `alMaximo` llegan como PROPS calculados en page.tsx, en vez
 * de importar MAXIMO_IMAGENES_POR_PROPIEDAD directamente aqui: ese modulo
 * (@/lib/imagenes/procesar) no lleva 'use server' -- a diferencia de
 * subirImagen/eliminarImagen/reordenarImagen, que Next convierte en una
 * referencia liviana para el cliente -- e importa `sharp`, que usa `fs` y
 * `child_process`. Importarlo tal cual en un componente cliente revienta el
 * build de Turbopack ("Module not found: Can't resolve 'fs'") porque intenta
 * empaquetar sharp para el navegador.
 */
export function PanelFotos({
  propiedadId,
  imagenes,
  maximoFotos,
  alMaximo,
}: {
  propiedadId: string
  imagenes: ImagenPanel[]
  maximoFotos: number
  alMaximo: boolean
}) {
  const [estado, accion, pendiente] = useActionState(subirImagen, INICIAL)

  return (
    <div>
      <h2 className="text-lg font-medium">Fotos</h2>

      {imagenes.length === 0 ? (
        <p className="mt-2 opacity-80">Todavía no has subido ninguna foto.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {imagenes.map((imagen, indice) => (
            <li
              key={imagen.id}
              className="flex flex-wrap items-center gap-4 rounded border border-black/10 p-3 dark:border-white/15"
            >
              {imagen.url ? (
                <Image
                  src={imagen.url}
                  alt={imagen.altText}
                  width={ANCHO_MINIATURA}
                  height={ALTO_MINIATURA}
                  unoptimized
                  className="rounded object-cover"
                />
              ) : (
                <div
                  role="img"
                  aria-label={imagen.altText}
                  style={{ width: ANCHO_MINIATURA, height: ALTO_MINIATURA }}
                  className="shrink-0 rounded bg-black/10 dark:bg-white/10"
                />
              )}

              <p className="min-w-40 flex-1 text-sm">{imagen.altText}</p>

              <div className="flex gap-2">
                <form
                  action={async () => { await reordenarImagen(imagen.id, propiedadId, 'arriba') }}
                >
                  <button
                    type="submit"
                    disabled={indice === 0}
                    className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    Subir
                  </button>
                </form>
                <form
                  action={async () => { await reordenarImagen(imagen.id, propiedadId, 'abajo') }}
                >
                  <button
                    type="submit"
                    disabled={indice === imagenes.length - 1}
                    className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    Bajar
                  </button>
                </form>
                <form action={async () => { await eliminarImagen(imagen.id, propiedadId) }}>
                  <button type="submit" className="rounded border px-3 py-1.5 text-sm">
                    Eliminar
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={accion} className="mt-6 space-y-3">
        <input type="hidden" name="propiedad_id" value={propiedadId} />

        <div>
          <label htmlFor="archivo" className="block">Foto</label>
          <input
            id="archivo"
            name="archivo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            disabled={alMaximo}
            className="w-full"
          />
        </div>

        <div>
          <label htmlFor="alt_text" className="block">
            Descripción de la foto (para accesibilidad)
          </label>
          <input
            id="alt_text"
            name="alt_text"
            type="text"
            required
            minLength={5}
            disabled={alMaximo}
            placeholder="Ej: Fachada de la casa desde la calle"
            className="w-full border p-2"
          />
        </div>

        {alMaximo && (
          <p className="text-sm opacity-70">
            Ya tienes el máximo de {maximoFotos} fotos por propiedad.
          </p>
        )}

        {estado.error && <p role="alert" className="text-red-600">{estado.error}</p>}

        <button
          type="submit"
          disabled={pendiente || alMaximo}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {pendiente ? 'Subiendo...' : 'Subir foto'}
        </button>
      </form>
    </div>
  )
}
