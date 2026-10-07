import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { sesionActual } from '@/lib/auth/sesion'
import { idsFavoritos } from '@/lib/comprador/favoritos'
import { cargarCiudad } from '@/lib/catalogo/ciudades'
import { leerFiltros, type ParametrosCatalogo } from '@/lib/catalogo/filtros'
import { listarPropiedadesPublicas, TAMANO_PAGINA } from '@/lib/catalogo/consultas'
import { catalogoIndexable, metadatosCiudad } from '@/lib/catalogo/seo'
import { FiltrosLaterales } from '@/components/catalogo/filtros-laterales'
import { ListadoCatalogo } from '@/components/catalogo/listado-catalogo'

type Entrada = { params: Promise<{ ciudad: string }>; searchParams: Promise<ParametrosCatalogo> }

// La pagina y generateMetadata necesitan la misma ciudad: una consulta por peticion.
const cargar = cache((slug: string) => cargarCiudad(crearClientePublico(), slug))

/**
 * Catalogo de una ciudad: todas las publicadas de sus barrios, con los mismos
 * filtros que el catalogo de un barrio, y la lista de barrios para entrar a
 * cada uno. La ciudad sale de barrios.ciudad_slug (migracion 20261012000200).
 */
export default async function PaginaCiudad({ params, searchParams }: Entrada) {
  const [{ ciudad: slug }, parametros] = await Promise.all([params, searchParams])
  const ciudad = await cargar(slug)
  if (!ciudad) notFound()

  const filtros = leerFiltros(parametros)
  if (!Number.isSafeInteger(filtros.pagina * TAMANO_PAGINA)) filtros.pagina = 1
  const barrioPorId = new Map(ciudad.barrios.map((b) => [b.id, b]))
  const [{ propiedades, total }, sesion] = await Promise.all([
    listarPropiedadesPublicas(crearClientePublico(), ciudad.barrios.map((b) => b.id), filtros),
    sesionActual(),
  ])
  const favoritos = sesion.idUsuario
    ? await idsFavoritos(await crearClienteServidor(), sesion.idUsuario, propiedades.map((p) => p.id))
    : new Set<string>()
  const rutaBase = `/ciudad/${ciudad.slug}`

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <nav aria-label="Miga de pan" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
        <Link href="/" className="transition-colors hover:text-tinta">Inicio</Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-tinta">{ciudad.nombre}</span>
      </nav>

      <div className="mb-6">
        <h1 className="mb-1 break-words font-titulo text-3xl font-semibold text-tinta">Propiedades en {ciudad.nombre}</h1>
        <p className="text-tinta-suave">
          {total} {total === 1 ? 'inmueble disponible' : 'inmuebles disponibles'} · {ciudad.barrios.length}{' '}
          {ciudad.barrios.length === 1 ? 'barrio' : 'barrios'}
        </p>
      </div>

      <section aria-labelledby="titulo-barrios" className="mb-8">
        <h2 id="titulo-barrios" className="sr-only">Barrios de {ciudad.nombre}</h2>
        <ul className="flex flex-wrap gap-2">
          {ciudad.barrios.map((b) => (
            <li key={b.id}>
              <Link
                href={`/${b.slug}`}
                className="inline-flex rounded-full border border-linea bg-superficie px-3.5 py-1.5 text-sm text-tinta transition-colors hover:border-marca hover:text-marca"
              >
                {b.nombre}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <FiltrosLaterales filtros={filtros} limpiarHref={rutaBase} />
        <ListadoCatalogo
          propiedades={propiedades}
          total={total}
          filtros={filtros}
          rutaBase={rutaBase}
          nombreLugar={ciudad.nombre}
          barrioDe={(p) => barrioPorId.get(p.barrio_id ?? '') ?? null}
          conSesion={sesion.hayUsuario}
          favoritos={favoritos}
        />
      </div>
    </main>
  )
}

export async function generateMetadata({ params, searchParams }: Entrada) {
  const [{ ciudad: slug }, parametros] = await Promise.all([params, searchParams])
  const ciudad = await cargar(slug)
  if (!ciudad) notFound()
  return metadatosCiudad(ciudad, { indexable: catalogoIndexable(leerFiltros(parametros)) })
}
