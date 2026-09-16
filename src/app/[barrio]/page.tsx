import { BotonGuardarBusqueda } from '@/components/comprador/BotonGuardarBusqueda'
import { metadatosBarrio } from '@/lib/catalogo/seo'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { leerFiltros, type ParametrosCatalogo } from '@/lib/catalogo/filtros'
import { listarPropiedadesPublicas, TAMANO_PAGINA } from '@/lib/catalogo/consultas'

const CAMPO =
  'block w-full rounded-md border border-linea bg-superficie px-3.5 py-2 text-sm text-tinta shadow-2xs transition-colors focus:border-marca'

type Entrada = { params: Promise<{ barrio: string }>; searchParams: Promise<ParametrosCatalogo> }

export default async function PaginaBarrio({ params, searchParams }: Entrada) {
  const { barrio: slug } = await params
  const db = crearClientePublico()
  const { data: barrio, error } = await db
    .from('barrios')
    .select('id,nombre,slug')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error('No se pudo cargar el barrio')
  if (!barrio) notFound()

  const filtros = leerFiltros(await searchParams)
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

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      {/* Miga de pan estilizada */}
      <nav aria-label="Miga de pan" className="flex items-center gap-2 text-xs font-medium text-tinta-tenue">
        <Link href="/" className="transition-colors hover:text-marca">
          Inicio
        </Link>
        <span>/</span>
        <span className="text-tinta-suave">{barrio.nombre}</span>
      </nav>

      {/* Encabezado del barrio */}
      <div className="mt-4 flex flex-col justify-between gap-4 border-b border-linea/80 pb-6 sm:flex-row sm:items-end">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-marca-suave px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-marca">
            Barrio · Barranquilla
          </span>
          <h1 className="mt-2 font-titulo text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
            Propiedades en {barrio.nombre}
          </h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Venta y arriendo en Barranquilla · Trato directo sin intermediarios
          </p>
        </div>
        <span className="text-xs font-medium text-tinta-tenue">
          {total} {total === 1 ? 'inmueble disponible' : 'inmuebles disponibles'}
        </span>
      </div>

      {/* Formulario de filtros */}
      <form
        method="get"
        className="my-8 rounded-xl border border-linea/80 bg-superficie p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-end gap-4">
          <label className="grow-0 text-xs font-semibold text-tinta">
            Operación
            <select
              className={`${CAMPO} mt-1`}
              name="operacion"
              defaultValue={filtros.operacion ?? ''}
            >
              <option value="">Todas</option>
              <option value="venta">Venta</option>
              <option value="arriendo">Arriendo</option>
            </select>
          </label>

          <label className="grow-0 text-xs font-semibold text-tinta">
            Tipo
            <select className={`${CAMPO} mt-1`} name="tipo" defaultValue={filtros.tipo ?? ''}>
              <option value="">Todos</option>
              {['apartamento', 'casa', 'local', 'lote', 'oficina'].map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className="grow-0 text-xs font-semibold text-tinta">
            Precio mínimo
            <input
              className={`${CAMPO} mt-1 w-36 cifra sm:w-44`}
              type="number"
              min="0.01"
              step="0.01"
              name="precio_min"
              defaultValue={filtros.precioMin}
              placeholder="$ Mín"
            />
          </label>

          <label className="grow-0 text-xs font-semibold text-tinta">
            Precio máximo
            <input
              className={`${CAMPO} mt-1 w-36 cifra sm:w-44`}
              type="number"
              min="0.01"
              step="0.01"
              name="precio_max"
              defaultValue={filtros.precioMax}
              placeholder="$ Máx"
            />
          </label>

          <button
            type="submit"
            className="cursor-pointer rounded-md bg-marca px-5 py-2 text-sm font-semibold text-marca-contraste shadow-xs transition-colors hover:bg-marca-fuerte"
          >
            Filtrar
          </button>

          <Link
            href={`/${barrio.slug}`}
            className="py-2 text-xs font-medium text-tinta-tenue transition-colors hover:text-marca hover:underline"
          >
            Limpiar filtros
          </Link>
        </div>
      </form>

      {/* Barra de guardar búsqueda */}
      <div className="mb-8 flex flex-col items-start justify-between gap-3 rounded-lg border border-linea/60 bg-superficie-alt/40 px-5 py-3.5 sm:flex-row sm:items-center">
        <p className="text-xs text-tinta-suave">
          Guarda estos criterios de búsqueda para consultarlos luego desde tu panel.
        </p>
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

      {/* Lista de propiedades */}
      {propiedades.length === 0 ? (
        <div className="rounded-xl border border-linea bg-superficie p-12 text-center">
          <span className="text-3xl">🔍</span>
          <h3 className="mt-3 font-titulo text-lg font-semibold text-tinta">
            No hay propiedades que coincidan con estos filtros
          </h3>
          <p className="mt-1 text-sm text-tinta-suave">
            Prueba ajustando el rango de precio o cambiando el tipo de inmueble.
          </p>
          <Link
            href={`/${barrio.slug}`}
            className="mt-4 inline-block text-xs font-semibold text-marca hover:underline"
          >
            Ver todas las de {barrio.nombre}
          </Link>
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {propiedades.map((p) => {
            const foto = [...p.imagenes_propiedad].sort((a, b) => a.orden - b.orden)[0]
            const arriendo = p.operacion === 'arriendo'

            return (
              <li
                key={p.id}
                className="tarjeta-interactiva group overflow-hidden rounded-xl border border-linea bg-superficie shadow-xs"
              >
                <Link href={`/${barrio.slug}/${p.slug}`} className="block">
                  {/* Foto de la propiedad con zoom sutil en hover */}
                  <div className="relative aspect-[3/2] w-full overflow-hidden bg-superficie-alt">
                    {foto ? (
                      <Image
                        src={`/imagen/${foto.id}`}
                        alt={foto.alt_text}
                        width={480}
                        height={320}
                        unoptimized
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-tinta-tenue">
                        Sin fotografías
                      </div>
                    )}

                    {/* Badge flotante de operacion */}
                    <div className="absolute top-3 left-3">
                      <span
                        className={`inline-block rounded-sm px-2.5 py-1 text-xs font-bold uppercase tracking-wider shadow-xs ${
                          arriendo
                            ? 'bg-realce-suave text-realce'
                            : 'bg-marca-suave text-marca'
                        }`}
                      >
                        {p.operacion}
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">
                      {p.tipo_inmueble || 'Inmueble'}
                    </p>
                    <h2 className="mt-1 font-titulo text-lg font-bold text-tinta transition-colors group-hover:text-marca">
                      {p.titulo}
                    </h2>
                    <p className="cifra mt-2 font-titulo text-xl font-bold text-tinta">
                      {new Intl.NumberFormat('es-CO', {
                        style: 'currency',
                        currency: 'COP',
                        maximumFractionDigits: 0,
                      }).format(p.precio)}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {/* Paginación */}
      <nav
        aria-label="Paginación"
        className="mt-12 flex items-center justify-between border-t border-linea/80 pt-6 text-sm"
      >
        <div>
          {filtros.pagina > 1 ? (
            <Link
              href={pagina(filtros.pagina - 1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-linea px-3 py-1.5 font-medium text-tinta-suave transition-colors hover:border-marca hover:text-marca"
            >
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
        </div>

        <span className="text-xs font-medium text-tinta-tenue">
          Página {filtros.pagina} de {Math.max(1, Math.ceil(total / TAMANO_PAGINA))}
        </span>

        <div>
          {filtros.pagina * TAMANO_PAGINA < total ? (
            <Link
              href={pagina(filtros.pagina + 1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-linea px-3 py-1.5 font-medium text-tinta-suave transition-colors hover:border-marca hover:text-marca"
            >
              Siguiente →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </nav>
    </main>
  )
}

export async function generateMetadata({ params }: Entrada) {
  const { barrio: slug } = await params
  const { data, error } = await crearClientePublico()
    .from('barrios')
    .select('nombre,slug')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error('No se pudo cargar el barrio')
  if (!data) notFound()
  return metadatosBarrio(data)
}
