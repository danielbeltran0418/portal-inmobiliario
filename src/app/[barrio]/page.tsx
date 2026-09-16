import { BotonGuardarBusqueda } from '@/components/comprador/BotonGuardarBusqueda'
import { metadatosBarrio } from '@/lib/catalogo/seo'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { leerFiltros, type ParametrosCatalogo } from '@/lib/catalogo/filtros'
import { listarPropiedadesPublicas, TAMANO_PAGINA } from '@/lib/catalogo/consultas'

const CAMPO = 'block w-full rounded-sm border border-linea bg-superficie px-3 py-2 text-tinta'

type Entrada = { params: Promise<{ barrio: string }>; searchParams: Promise<ParametrosCatalogo> }
export default async function PaginaBarrio({ params, searchParams }: Entrada) {
  const { barrio: slug } = await params
  const db = crearClientePublico()
  const { data: barrio, error } = await db.from('barrios').select('id,nombre,slug').eq('slug', slug).maybeSingle()
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
  return <main className="mx-auto w-full max-w-5xl px-6 py-10">
    <Link href="/" className="text-sm text-tinta-tenue hover:text-marca hover:underline">Inicio</Link>
    <h1 className="mt-4 text-4xl font-semibold text-tinta">Propiedades en {barrio.nombre}</h1>
    <p className="mt-2 text-tinta-suave">Venta y arriendo en Barranquilla</p>

    <form method="get" className="my-8 flex flex-wrap items-end gap-4 rounded-md border border-linea bg-superficie p-5">
      <label className="grow-0">Operación
        <select className={`${CAMPO} mt-1`} name="operacion" defaultValue={filtros.operacion ?? ''}><option value="">Todas</option><option value="venta">Venta</option><option value="arriendo">Arriendo</option></select>
      </label>
      <label className="grow-0">Tipo
        <select className={`${CAMPO} mt-1`} name="tipo" defaultValue={filtros.tipo ?? ''}><option value="">Todos</option>{['apartamento','casa','local','lote','oficina'].map(t => <option key={t} value={t}>{t}</option>)}</select>
      </label>
      <label className="grow-0">Precio mínimo
        <input className={`${CAMPO} mt-1 w-40 cifra`} type="number" min="0.01" step="0.01" name="precio_min" defaultValue={filtros.precioMin} />
      </label>
      <label className="grow-0">Precio máximo
        <input className={`${CAMPO} mt-1 w-40 cifra`} type="number" min="0.01" step="0.01" name="precio_max" defaultValue={filtros.precioMax} />
      </label>
      <button className="cursor-pointer rounded-sm bg-marca px-5 py-2 font-medium text-marca-contraste hover:bg-marca-fuerte">Filtrar</button>
      <BotonGuardarBusqueda filtrosActuales={{ barrio: barrio.slug, operacion: filtros.operacion, tipo: filtros.tipo, precio_min: filtros.precioMin, precio_max: filtros.precioMax }} />
      <Link href={`/${barrio.slug}`} className="py-2 text-sm text-tinta-tenue hover:text-marca hover:underline">Limpiar filtros</Link>
    </form>

    {propiedades.length === 0 ? <p className="rounded-md border border-linea bg-superficie p-8 text-center text-tinta-suave">No hay propiedades que coincidan con estos filtros.</p> : <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{propiedades.map(p => {
      const foto = [...p.imagenes_propiedad].sort((a,b) => a.orden - b.orden)[0]
      const arriendo = p.operacion === 'arriendo'
      return <li key={p.id} className="overflow-hidden rounded-md border border-linea bg-superficie transition-colors hover:border-marca">
        <Link href={`/${barrio.slug}/${p.slug}`} className="block">
          {/* El contenedor de la foto se queda NEUTRO a proposito: la paleta
              calida detras de una foto de tonos cualesquiera se pelea con ella. */}
          {foto && <Image src={`/imagen/${foto.id}`} alt={foto.alt_text} width={480} height={320} unoptimized className="aspect-[3/2] w-full bg-superficie-alt object-cover" />}
          <div className="p-5">
            <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${arriendo ? 'bg-realce-suave text-realce' : 'bg-marca-suave text-marca'}`}>{p.operacion}</span>
            <h2 className="mt-2 text-xl font-semibold text-tinta">{p.titulo}</h2>
            <p className="cifra mt-1 text-lg font-medium text-tinta">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p.precio)}</p>
          </div>
        </Link>
      </li>
    })}</ul>}

    <nav aria-label="Paginación" className="mt-10 flex items-center gap-6 border-t border-linea pt-6 text-sm">
      {filtros.pagina > 1 && <Link href={pagina(filtros.pagina - 1)} className="text-marca hover:underline">Anterior</Link>}
      <span className="text-tinta-tenue">Página {filtros.pagina}</span>
      {filtros.pagina * TAMANO_PAGINA < total && <Link href={pagina(filtros.pagina + 1)} className="text-marca hover:underline">Siguiente</Link>}
    </nav>
  </main>
}

export async function generateMetadata({ params }: Entrada) {
  const { barrio: slug } = await params
  const { data, error } = await crearClientePublico().from('barrios').select('nombre,slug').eq('slug', slug).maybeSingle()
  if (error) throw new Error('No se pudo cargar el barrio')
  if (!data) notFound()
  return metadatosBarrio(data)
}
