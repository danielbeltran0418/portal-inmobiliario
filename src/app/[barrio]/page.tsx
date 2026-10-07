import { BotonGuardarBusqueda } from '@/components/comprador/BotonGuardarBusqueda'
import { TarjetaPropiedad } from '@/components/tarjeta-propiedad'
import { cache } from 'react'
import { metadatosBarrio, catalogoIndexable } from '@/lib/catalogo/seo'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { notFound } from 'next/navigation'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { leerFiltros, type ParametrosCatalogo } from '@/lib/catalogo/filtros'
import { listarPropiedadesPublicas, TAMANO_PAGINA } from '@/lib/catalogo/consultas'

const CAMPO =
  'block w-full rounded-xl border border-linea bg-fondo px-3 py-2.5 text-base text-tinta transition-colors focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25'

type Entrada = { params: Promise<{ barrio: string }>; searchParams: Promise<ParametrosCatalogo> }

// La pagina y generateMetadata necesitan el mismo barrio: una sola consulta por peticion.
const cargarBarrio = cache(async (slug: string) => {
  const { data, error } = await crearClientePublico()
    .from('barrios')
    .select('id,nombre,slug,ciudad')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error('No se pudo cargar el barrio')
  return data
})

export default async function PaginaBarrio({ params, searchParams }: Entrada) {
  const [{ barrio: slug }, parametros] = await Promise.all([params, searchParams])
  const db = crearClientePublico()
  const barrio = await cargarBarrio(slug)
  if (!barrio) notFound()

  const filtros = leerFiltros(parametros)
  // La URL es entrada no confiable: un desplazamiento excesivo se trata como primera página.
  if (!Number.isSafeInteger(filtros.pagina * TAMANO_PAGINA)) filtros.pagina = 1
  const { propiedades, total } = await listarPropiedadesPublicas(db, barrio.id, filtros)

  function pagina(numero: number) {
    const p = new URLSearchParams()
    if (filtros.operacion) p.set('operacion', filtros.operacion)
    if (filtros.tipo) p.set('tipo', filtros.tipo)
    if (filtros.precioMin !== undefined) p.set('precio_min', String(filtros.precioMin))
    if (filtros.precioMax !== undefined) p.set('precio_max', String(filtros.precioMax))
    p.set('pagina', String(numero))
    return `/${barrio!.slug}?${p}`
  }

  const ETIQUETA_GRUPO = 'mb-3 block text-xs font-semibold uppercase tracking-wider text-tinta-suave'
  const BOTON_PAGINA =
    'inline-flex items-center gap-1.5 rounded-xl border border-linea px-4 py-2 text-sm font-medium text-tinta-suave transition-colors hover:border-marca hover:text-marca'

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <nav aria-label="Miga de pan" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
        <Link href="/" className="transition-colors hover:text-tinta">
          Inicio
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-tinta">{barrio.nombre}</span>
      </nav>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-1 break-words font-titulo text-3xl font-semibold text-tinta">Propiedades en {barrio.nombre}</h1>
          <p className="text-tinta-suave">
            {total} {total === 1 ? 'inmueble disponible' : 'inmuebles disponibles'}
            {barrio.ciudad ? ` · ${barrio.ciudad}` : ''}
          </p>
        </div>
        <BotonGuardarBusqueda
          filtrosActuales={{
            barrio: barrio.slug,
            operacion: filtros.operacion,
            tipo: filtros.tipo,
            precio_min: filtros.precioMin,
            precio_max: filtros.precioMax,
          }}
        />
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* Filtros en columna lateral (diseño de Figma Make). Siguen siendo un
            formulario GET: la URL es la fuente de verdad del catalogo. */}
        <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-64">
          <form method="get" className="flex flex-col gap-6 rounded-2xl border border-linea bg-superficie p-5">
            <fieldset>
              <legend className={ETIQUETA_GRUPO}>Operación</legend>
              <div className="flex flex-col gap-1">
                {([['', 'Todas'], ['venta', 'Venta'], ['arriendo', 'Arriendo']] as const).map(([valor, texto]) => (
                  <label key={texto} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm text-tinta">
                    <input
                      type="radio"
                      name="operacion"
                      value={valor}
                      defaultChecked={(filtros.operacion ?? '') === valor}
                      className="h-4 w-4 accent-[var(--marca)]"
                    />
                    {texto}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className={ETIQUETA_GRUPO}>Tipo de inmueble</span>
              <select className={CAMPO} name="tipo" defaultValue={filtros.tipo ?? ''}>
                <option value="">Todos los tipos</option>
                {['apartamento', 'casa', 'local', 'lote', 'oficina'].map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <fieldset>
              <legend className={ETIQUETA_GRUPO}>Precio (COP)</legend>
              <div className="flex flex-col gap-2">
                <label className="block text-xs text-tinta-suave">
                  Precio mínimo
                  <input
                    className={`${CAMPO} cifra mt-1`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    name="precio_min"
                    defaultValue={filtros.precioMin}
                    placeholder="Mínimo"
                  />
                </label>
                <label className="block text-xs text-tinta-suave">
                  Precio máximo
                  <input
                    className={`${CAMPO} cifra mt-1`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    name="precio_max"
                    defaultValue={filtros.precioMax}
                    placeholder="Máximo"
                  />
                </label>
              </div>
            </fieldset>

            <div className="flex flex-col gap-2">
              <button
                type="submit"
                className="w-full cursor-pointer rounded-xl bg-marca py-2.5 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte"
              >
                Filtrar
              </button>
              <Link
                href={`/${barrio.slug}`}
                className="block w-full rounded-xl border border-linea py-2 text-center text-sm text-tinta-suave transition-colors hover:border-marca hover:text-marca"
              >
                Limpiar filtros
              </Link>
            </div>
          </form>
        </aside>

        <div className="min-w-0 flex-1">
          {propiedades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-marca-suave">
                <Search aria-hidden="true" className="h-8 w-8 text-marca" strokeWidth={1.5} />
              </span>
              <h2 className="mb-2 font-titulo text-xl text-tinta">No hay propiedades que coincidan con estos filtros</h2>
              <p className="text-sm text-tinta-suave">Prueba ajustando el rango de precio o cambiando el tipo de inmueble.</p>
              <Link href={`/${barrio.slug}`} className="mt-4 text-sm font-semibold text-marca hover:underline">
                Ver todas las de {barrio.nombre}
              </Link>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {propiedades.map((p) => (
                <TarjetaPropiedad key={p.id} propiedad={p} barrioSlug={barrio.slug} barrioNombre={barrio.nombre} />
              ))}
            </ul>
          )}

          <nav aria-label="Paginación" className="mt-10 flex items-center justify-center gap-3 text-sm">
            {filtros.pagina > 1 && (
              <Link href={pagina(filtros.pagina - 1)} className={BOTON_PAGINA}>
                ← Anterior
              </Link>
            )}
            <span className="font-medium text-tinta-tenue">
              Página {filtros.pagina} de {Math.max(1, Math.ceil(total / TAMANO_PAGINA))}
            </span>
            {filtros.pagina * TAMANO_PAGINA < total && (
              <Link href={pagina(filtros.pagina + 1)} className={BOTON_PAGINA}>
                Siguiente →
              </Link>
            )}
          </nav>
        </div>
      </div>
    </main>
  )
}

export async function generateMetadata({ params, searchParams }: Entrada) {
  const [{ barrio: slug }, parametros] = await Promise.all([params, searchParams])
  const data = await cargarBarrio(slug)
  if (!data) notFound()
  return metadatosBarrio(data, { indexable: catalogoIndexable(leerFiltros(parametros)) })
}
