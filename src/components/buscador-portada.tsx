'use client'

import { useState } from 'react'
import { AutocompletarUbicacion } from '@/components/catalogo/autocompletar-ubicacion'
import { Search } from 'lucide-react'

const CAMPO =
  'h-12 w-full rounded-xl border border-linea bg-fondo px-4 text-base font-medium text-tinta focus-visible:border-marca focus-visible:outline-2 focus-visible:outline-marca/40'

/**
 * Buscador del hero de la portada (diseño de Figma Make): operacion, palabras
 * clave y ciudad en una sola fila. Envia por GET a /buscar, que valida y redirige al catalogo de la
 * ciudad (src/app/buscar/route.ts); tipo y precio se filtran ya alli. Sin
 * ciudades no se pinta: un formulario que no puede buscar nada solo confunde.
 *
 * Las etiquetas existen para lectores de pantalla aunque el diseño no las
 * muestre: un select sin nombre accesible es una barrera.
 */
export function BuscadorPortada({ ciudades }: { ciudades: { nombre: string; slug: string }[] }) {
  const [ubicacion, setUbicacion] = useState<{ ciudad?: string; barrio?: string }>({})
  if (ciudades.length === 0) return null

  return (
    <form
      action="/buscar"
      method="get"
      className="flex w-full max-w-3xl flex-col gap-3 rounded-3xl border border-linea bg-superficie p-4 text-left shadow-xl"
    >
      <div className="grid gap-2 sm:grid-cols-2">
      <label htmlFor="buscador-operacion" className="sr-only">
        Operación
      </label>
      <select id="buscador-operacion" name="operacion" defaultValue="venta" className={`${CAMPO}`}>
        <option value="venta">Venta</option>
        <option value="arriendo">Arriendo</option>
        <option value="temporal">Temporal / vacacional</option>
      </select>

      <label htmlFor="buscador-texto" className="sr-only">
        Palabras clave
      </label>
      <input
        id="buscador-texto"
        name="q"
        type="search"
        maxLength={60}
        placeholder="Balcón, piscina, cerca al parque…"
        className={`${CAMPO} sm:flex-1`}
      />

      <AutocompletarUbicacion ciudades={ciudades} elegir={setUbicacion} />
      {ubicacion.barrio && <input type="hidden" name="barrio" value={ubicacion.barrio} />}
      <label htmlFor="buscador-ciudad" className="sr-only">
        Ciudad
      </label>
      <select id="buscador-ciudad" key={ubicacion.ciudad} name={ubicacion.barrio ? undefined : "ciudad"} defaultValue={ubicacion.ciudad} disabled={Boolean(ubicacion.barrio)} required className={`${CAMPO}`}>
        {ciudades.map((ciudad) => (
          <option key={ciudad.slug} value={ciudad.slug}>
            {ciudad.nombre}
          </option>
        ))}
      </select>

      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-tinta">Tipo de inmueble</legend>
        <div className="flex flex-wrap gap-2">
          {([['', 'Todos'], ['apartamento', 'Apartamento'], ['casa', 'Casa'], ['lote', 'Lote'], ['local', 'Local comercial'], ['oficina', 'Oficina']] as const).map(([valor, etiqueta]) => (
            <label key={valor} className="cursor-pointer rounded-full border border-linea px-3 py-2 text-sm text-tinta has-[:checked]:border-marca has-[:checked]:bg-marca-suave has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-marca">
              <input type="radio" name="tipo" value={valor} defaultChecked={valor === ''} className="sr-only" />
              {etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-marca px-6 text-base font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte disabled:opacity-50"
      >
        <Search aria-hidden="true" className="size-4" />
        Buscar
      </button>
    </form>
  )
}
