import { cache } from 'react'
import { metadatosFicha, datosFicha, serializarJsonLd } from '@/lib/catalogo/seo'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
const cargarFicha = cache(async (slug: string) => {
  const { data: p, error } = await crearClientePublico().from('propiedades')
    .select('slug,titulo,descripcion,precio,operacion,tipo_inmueble,habitaciones,banos,area_m2,barrios!inner(nombre,slug),imagenes_propiedad(id,alt_text,orden)')
    .eq('slug', slug).eq('estado', 'publicada').maybeSingle()
  if (error) throw new Error('No se pudo cargar la propiedad')
  if (!p) notFound()
  return p
})
export async function generateMetadata({ params }: { params: Promise<{ barrio: string; slug: string }> }) {
  const p = await cargarFicha((await params).slug)
  const barrio = Array.isArray(p.barrios) ? p.barrios[0] : p.barrios
  if (!barrio) notFound()
  return metadatosFicha(p, barrio)
}
export default async function FichaPublica({ params }: { params: Promise<{ barrio: string; slug: string }> }) {
  const ruta = await params
  const p = await cargarFicha(ruta.slug)
  const barrio = Array.isArray(p.barrios) ? p.barrios[0] : p.barrios
  if (!barrio) notFound()
  if (barrio.slug !== ruta.barrio) permanentRedirect(`/${barrio.slug}/${p.slug}`)
  const fotos = [...p.imagenes_propiedad].sort((a, b) => a.orden - b.orden)
  return <main className="mx-auto w-full max-w-5xl px-6 py-12">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializarJsonLd(datosFicha(p, barrio)) }} />
    <Link href={`/${barrio.slug}`}>Volver a {barrio.nombre}</Link>
    <h1 className="mt-6 text-3xl font-semibold">{p.titulo}</h1>
    <p className="mt-3 text-xl">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p.precio)} · {p.operacion}</p>
    <p className="mt-2">{barrio.nombre}, Barranquilla</p>
    <div className="my-8 grid gap-4 sm:grid-cols-2">{fotos.map(f => <Image key={f.id} src={`/imagen/${f.id}`} alt={f.alt_text} width={800} height={600} unoptimized className="aspect-[4/3] w-full rounded object-cover" />)}</div>
    <h2 className="text-xl font-semibold">Acerca de esta propiedad</h2>
    <p className="mt-4 whitespace-pre-wrap">{p.descripcion}</p>
    <dl className="mt-6 flex flex-wrap gap-8">
      {p.habitaciones != null && <div><dt>Habitaciones</dt><dd>{p.habitaciones}</dd></div>}
      {p.banos != null && <div><dt>Baños</dt><dd>{p.banos}</dd></div>}
      {p.area_m2 != null && <div><dt>Área</dt><dd>{p.area_m2} m²</dd></div>}
    </dl>
  </main>
}
