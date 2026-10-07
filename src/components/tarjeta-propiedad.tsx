import Image from 'next/image'
import Link from 'next/link'

export interface PropiedadDeTarjeta {
  id: string
  slug: string
  titulo: string
  operacion: string
  tipo_inmueble: string | null
  precio: number
  habitaciones: number | null
  banos: number | null
  area_m2: number | null
  imagenes_propiedad: { id: string; alt_text: string; orden: number }[]
}

const formatoPrecio = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

/** Las caracteristicas que la propiedad tiene; un 0 cuenta (un estudio tiene 0 habitaciones). */
function caracteristicas(p: PropiedadDeTarjeta): string[] {
  const datos: string[] = []
  if (p.habitaciones != null) datos.push(`${p.habitaciones} hab.`)
  if (p.banos != null) datos.push(`${p.banos} ${p.banos === 1 ? 'baño' : 'baños'}`)
  if (p.area_m2 != null) datos.push(`${Number(p.area_m2)} m²`)
  return datos
}

/**
 * Tarjeta del catalogo: foto, precio, titulo y caracteristicas. El precio va
 * antes que el titulo porque es lo que se compara al recorrer el listado.
 */
export function TarjetaPropiedad({ propiedad: p, barrioSlug }: { propiedad: PropiedadDeTarjeta; barrioSlug: string }) {
  const fotos = [...p.imagenes_propiedad].sort((a, b) => a.orden - b.orden)
  const portada = fotos[0]
  const arriendo = p.operacion === 'arriendo'
  const datos = caracteristicas(p)

  return (
    <li className="tarjeta-interactiva group overflow-hidden rounded-2xl border border-linea bg-superficie shadow-xs">
      <Link href={`/${barrioSlug}/${p.slug}`} className="block">
        <div className="relative aspect-[3/2] w-full overflow-hidden bg-superficie-alt">
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
            className={`absolute top-3 left-3 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider shadow-xs ${
              arriendo ? 'bg-realce-suave text-realce' : 'bg-marca-suave text-marca'
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

        <div className="p-5">
          <p className="cifra font-titulo text-2xl font-bold text-tinta">{formatoPrecio.format(p.precio)}</p>
          <h2 className="mt-1 line-clamp-2 break-words text-base font-semibold text-tinta transition-colors group-hover:text-marca">
            {p.titulo}
          </h2>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-tinta-tenue">
            {p.tipo_inmueble || 'Inmueble'}
          </p>
          {datos.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-linea-suave pt-3 text-sm text-tinta-suave">
              {datos.map((dato) => (
                <span key={dato}>{dato}</span>
              ))}
            </p>
          )}
        </div>
      </Link>
    </li>
  )
}
