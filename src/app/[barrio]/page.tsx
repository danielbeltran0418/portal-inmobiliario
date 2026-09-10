import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { leerFiltros, type ParametrosCatalogo } from '@/lib/catalogo/filtros'
import { listarPropiedadesPublicas, TAMANO_PAGINA } from '@/lib/catalogo/consultas'

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
  return <main className="mx-auto w-full max-w-5xl px-6 py-12">
    <Link href="/">Inicio</Link>
    <h1 className="mt-6 text-3xl font-semibold">Propiedades en {barrio.nombre}</h1>
    <p className="mt-2">Venta y arriendo en Barranquilla</p>
    <form method="get" className="my-8 flex flex-wrap items-end gap-4">
      <label>Operación<select className="block rounded border p-2" name="operacion" defaultValue={filtros.operacion ?? ''}><option value="">Todas</option><option value="venta">Venta</option><option value="arriendo">Arriendo</option></select></label>
      <label>Tipo<select className="block rounded border p-2" name="tipo" defaultValue={filtros.tipo ?? ''}><option value="">Todos</option>{['apartamento','casa','local','lote','oficina'].map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <label>Precio mínimo<input className="block w-40 rounded border p-2" type="number" min="0.01" step="0.01" name="precio_min" defaultValue={filtros.precioMin} /></label>
      <label>Precio máximo<input className="block w-40 rounded border p-2" type="number" min="0.01" step="0.01" name="precio_max" defaultValue={filtros.precioMax} /></label>
      <button className="rounded bg-foreground px-4 py-2 text-background">Filtrar</button>
      <Link href={`/${barrio.slug}`}>Limpiar filtros</Link>
    </form>
    {propiedades.length === 0 ? <p>No hay propiedades que coincidan con estos filtros.</p> : <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{propiedades.map(p => {
      const foto = [...p.imagenes_propiedad].sort((a,b) => a.orden - b.orden)[0]
      return <li key={p.id} className="overflow-hidden rounded-lg border">
        <Link href={`/${barrio.slug}/${p.slug}`}>
          {foto && <Image src={`/imagen/${foto.id}`} alt={foto.alt_text} width={480} height={320} unoptimized className="aspect-[3/2] w-full object-cover" />}
          <div className="p-5"><h2 className="text-xl font-semibold">{p.titulo}</h2><p>{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p.precio)} · {p.operacion}</p></div>
        </Link>
      </li>
    })}</ul>}
    <nav aria-label="Paginación" className="mt-8 flex gap-6">
      {filtros.pagina > 1 && <Link href={pagina(filtros.pagina - 1)}>Anterior</Link>}
      <span>Página {filtros.pagina}</span>
      {filtros.pagina * TAMANO_PAGINA < total && <Link href={pagina(filtros.pagina + 1)}>Siguiente</Link>}
    </nav>
  </main>
}
