import { BotonGuardarBusqueda } from '@/components/comprador/BotonGuardarBusqueda'
import { FiltrosLaterales } from '@/components/catalogo/filtros-laterales'
import { ListadoCatalogo } from '@/components/catalogo/listado-catalogo'
import { sesionActual } from '@/lib/auth/sesion'
import { idsFavoritos } from '@/lib/comprador/favoritos'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { cache } from 'react'
import { metadatosBarrio, catalogoIndexable } from '@/lib/catalogo/seo'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { leerFiltros, type ParametrosCatalogo } from '@/lib/catalogo/filtros'
import { listarPropiedadesPublicas, TAMANO_PAGINA } from '@/lib/catalogo/consultas'

type Entrada = { params: Promise<{ barrio: string }>; searchParams: Promise<ParametrosCatalogo> }

// La pagina y generateMetadata necesitan el mismo barrio: una sola consulta por peticion.
const cargarBarrio = cache(async (slug: string) => {
  const { data, error } = await crearClientePublico()
    .from('barrios')
    .select('id,nombre,slug,ciudad,ciudad_slug')
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
  const [{ propiedades, total }, sesion] = await Promise.all([
    listarPropiedadesPublicas(db, barrio.id, filtros),
    sesionActual(),
  ])
  // Los favoritos son del usuario: se leen con SU cliente (RLS), no con el publico.
  const favoritos = sesion.idUsuario
    ? await idsFavoritos(await crearClienteServidor(), sesion.idUsuario, propiedades.map((p) => p.id))
    : new Set<string>()

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <nav aria-label="Miga de pan" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
        <Link href="/" className="transition-colors hover:text-tinta">
          Inicio
        </Link>
        <span aria-hidden="true">/</span>
        {barrio.ciudad_slug && (
          <>
            <Link href={`/ciudad/${barrio.ciudad_slug}`} className="transition-colors hover:text-tinta">
              {barrio.ciudad}
            </Link>
            <span aria-hidden="true">/</span>
          </>
        )}
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
            q: filtros.texto,
            estrato_min: filtros.estratoMin,
            estrato_max: filtros.estratoMax,
            habitaciones_min: filtros.habitacionesMin,
            banos_min: filtros.banosMin,
            parqueaderos_min: filtros.parqueaderosMin,
            administracion_max: filtros.administracionMax,
          }}
        />
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <FiltrosLaterales filtros={filtros} limpiarHref={`/${barrio.slug}`} />
        <ListadoCatalogo
          propiedades={propiedades}
          total={total}
          filtros={filtros}
          rutaBase={`/${barrio.slug}`}
          nombreLugar={barrio.nombre}
          barrioDe={() => barrio}
          conSesion={sesion.hayUsuario}
          favoritos={favoritos}
        />
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
