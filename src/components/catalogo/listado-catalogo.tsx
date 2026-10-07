import Link from 'next/link'
import { Search } from 'lucide-react'
import { TarjetaPropiedad, type PropiedadDeTarjeta } from '@/components/tarjeta-propiedad'
import { CorazonTarjeta } from '@/components/comprador/corazon-tarjeta'
import { parametrosDeFiltros, type FiltrosCatalogo } from '@/lib/catalogo/filtros'
import { TAMANO_PAGINA } from '@/lib/catalogo/consultas'

const BOTON_PAGINA =
  'inline-flex items-center gap-1.5 rounded-xl border border-linea px-4 py-2 text-sm font-medium text-tinta-suave transition-colors hover:border-marca hover:text-marca'

/** URL de esta pagina del catalogo con sus filtros (sin "pagina=1"). */
export function rutaConFiltros(rutaBase: string, filtros: FiltrosCatalogo, pagina?: number): string {
  const query = parametrosDeFiltros({ ...filtros, pagina }).toString()
  return query ? `${rutaBase}?${query}` : rutaBase
}

/**
 * Rejilla de tarjetas, estado vacio y paginacion del catalogo, compartidos por
 * la pagina de un barrio y la de una ciudad. `barrioDe` dice a que barrio
 * enlaza cada tarjeta (en una ciudad cada propiedad es de un barrio distinto).
 */
export function ListadoCatalogo<P extends PropiedadDeTarjeta>({
  propiedades,
  total,
  filtros,
  rutaBase,
  nombreLugar,
  barrioDe,
  conSesion,
  favoritos,
}: {
  propiedades: readonly P[]
  total: number
  filtros: FiltrosCatalogo
  rutaBase: string
  nombreLugar: string
  barrioDe: (propiedad: P) => { slug: string; nombre: string } | null
  conSesion: boolean
  favoritos: ReadonlySet<string>
}) {
  const volver = rutaConFiltros(rutaBase, filtros, filtros.pagina)

  return (
    <div className="min-w-0 flex-1">
      {propiedades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-marca-suave">
            <Search aria-hidden="true" className="h-8 w-8 text-marca" strokeWidth={1.5} />
          </span>
          <h2 className="mb-2 font-titulo text-xl text-tinta">No hay propiedades que coincidan con estos filtros</h2>
          <p className="text-sm text-tinta-suave">Prueba ajustando el rango de precio o cambiando el tipo de inmueble.</p>
          <Link href={rutaBase} className="mt-4 text-sm font-semibold text-marca hover:underline">
            Ver todas las de {nombreLugar}
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {propiedades.map((p) => {
            const barrio = barrioDe(p)
            if (!barrio) return null
            return (
              <TarjetaPropiedad
                key={p.id}
                propiedad={p}
                barrioSlug={barrio.slug}
                barrioNombre={barrio.nombre}
                accion={
                  <CorazonTarjeta propiedadId={p.id} conSesion={conSesion} favorito={favoritos.has(p.id)} volver={volver} />
                }
              />
            )
          })}
        </ul>
      )}

      <nav aria-label="Paginación" className="mt-10 flex items-center justify-center gap-3 text-sm">
        {filtros.pagina > 1 && (
          <Link href={rutaConFiltros(rutaBase, filtros, filtros.pagina - 1)} className={BOTON_PAGINA}>
            ← Anterior
          </Link>
        )}
        <span className="font-medium text-tinta-tenue">
          Página {filtros.pagina} de {Math.max(1, Math.ceil(total / TAMANO_PAGINA))}
        </span>
        {filtros.pagina * TAMANO_PAGINA < total && (
          <Link href={rutaConFiltros(rutaBase, filtros, filtros.pagina + 1)} className={BOTON_PAGINA}>
            Siguiente →
          </Link>
        )}
      </nav>
    </div>
  )
}
