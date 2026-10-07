import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Bath, BedDouble, Maximize2, type LucideIcon, Layers } from 'lucide-react'

export interface PropiedadDeTarjeta {
  id: string
  slug: string
  barrio_id?: string
  titulo: string
  operacion: string
  tipo_inmueble: string | null
  precio: number
  habitaciones: number | null
  banos: number | null
  area_m2: number | null
  estrato?: number | null
  parqueaderos?: number | null
  imagenes_propiedad: { id: string; alt_text: string; orden: number }[]
}

const formatoPrecio = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

/** Las caracteristicas que la propiedad tiene; un 0 cuenta (un estudio tiene 0 habitaciones). */
function caracteristicas(p: PropiedadDeTarjeta): { texto: string; Icono: LucideIcon }[] {
  const datos: { texto: string; Icono: LucideIcon }[] = []
  if (p.habitaciones != null) datos.push({ texto: `${p.habitaciones} hab.`, Icono: BedDouble })
  if (p.banos != null) datos.push({ texto: `${p.banos} ${p.banos === 1 ? 'baño' : 'baños'}`, Icono: Bath })
  if (p.area_m2 != null) datos.push({ texto: `${Number(p.area_m2)} m²`, Icono: Maximize2 })
  if (p.estrato != null) datos.push({ texto: `Estrato ${p.estrato}`, Icono: Layers })
  return datos
}

/**
 * Tarjeta del catalogo (diseño de Figma Make): foto 4:3 con la operacion,
 * tipo y barrio, titulo, precio y caracteristicas. El barrio es opcional: en el
 * catalogo de un barrio sobra repetirlo, en la portada orienta.
 */
export function TarjetaPropiedad({
  propiedad: p,
  barrioSlug,
  barrioNombre,
  accion,
}: {
  propiedad: PropiedadDeTarjeta
  barrioSlug: string
  barrioNombre?: string
  /** Control sobre la foto (p. ej. quitar de favoritos). Va FUERA del enlace:
   *  un boton dentro de un <a> no es HTML valido ni accesible. */
  accion?: ReactNode
}) {
  const fotos = [...p.imagenes_propiedad].sort((a, b) => a.orden - b.orden)
  const portada = fotos[0]
  const arriendo = p.operacion === 'arriendo'
  const datos = caracteristicas(p)

  return (
    <li className="tarjeta-interactiva group relative overflow-hidden rounded-xl border border-linea bg-superficie">
      {accion && <div className="absolute top-3 right-3 z-10">{accion}</div>}
      <Link href={`/${barrioSlug}/${p.slug}`} className="block">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-marca-suave">
          {portada ? (
            <Image
              src={`/imagen/${portada.id}`}
              alt={portada.alt_text || p.titulo}
              width={480}
              height={320}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              unoptimized
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-tinta-tenue">
              Sin fotografías
            </div>
          )}

          <span
            className={`absolute top-3 left-3 inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white ${
              arriendo ? 'bg-[#A8630F]' : 'bg-[#0B6B5F]'
            }`}
          >
            {p.operacion}
          </span>

          {fotos.length > 1 && (
            <span className="absolute right-3 bottom-3 rounded-md bg-tinta/75 px-2 py-0.5 text-xs font-semibold text-fondo">
              {`${fotos.length} fotos`}
            </span>
          )}
        </div>

        <div className="p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-tinta-tenue">
            {p.tipo_inmueble || 'Inmueble'}
            {barrioNombre && <> · {barrioNombre}</>}
          </p>
          <h2 className="mb-2 line-clamp-2 break-words font-titulo text-base leading-snug font-semibold text-tinta transition-colors group-hover:text-marca">
            {p.titulo}
          </h2>
          <p className="cifra mb-3 text-lg font-bold text-tinta">{formatoPrecio.format(p.precio)}</p>
          {datos.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-linea pt-3 text-sm text-tinta-suave">
              {datos.map(({ texto, Icono }) => (
                <span key={texto} className="flex items-center gap-1">
                  <Icono aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />
                  {texto}
                </span>
              ))}
            </p>
          )}
        </div>
      </Link>
    </li>
  )
}
