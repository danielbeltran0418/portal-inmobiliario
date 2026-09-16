import { BotonFavorito } from '@/components/comprador/BotonFavorito'
import { cache } from 'react'
import { metadatosFicha, datosFicha, serializarJsonLd } from '@/lib/catalogo/seo'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { sesionActual } from '@/lib/auth/sesion'
import { FormularioLead } from './formulario-lead'
const cargarFicha = cache(async (slug: string) => {
  const { data: p, error } = await crearClientePublico().from('propiedades')
    .select('id,vendedor_id,slug,titulo,descripcion,precio,operacion,tipo_inmueble,habitaciones,banos,area_m2,barrios!inner(nombre,slug),imagenes_propiedad(id,alt_text,orden)')
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

  // La ficha es publica y esta cacheada por SP1; esta parte depende de la
  // sesion, asi que se resuelve en cada peticion. El layout raiz ya declara
  // force-dynamic, de modo que no cuesta nada extra.
  const sesion = await sesionActual()
  const rutaFicha = `/${barrio.slug}/${p.slug}`

  // Las dos lecturas solo tienen sentido con sesion, y se saltan sin ella.
  let yaContacto = false
  let telefonoPrevio = ''
  let esDelVendedor = false

  if (sesion.hayUsuario) {
    const db = await crearClienteServidor()
    // `leads` tiene TRES politicas permisivas de SELECT que RLS combina con
    // OR (leads_lectura_comprador, leads_lectura_vendedor Y
    // leads_lectura_super_admin, supabase/migrations/20260911000300_leads.sql):
    // un vendedor autenticado tambien ve sus propios leads como vendedor, asi
    // que sin filtrar por comprador_id esta consulta le devolveria el lead
    // que un COMPRADOR dejo sobre su propiedad, y yaContacto mentiria -- el
    // vendedor en su propia ficha veria "ya contactaste" en vez de nada.
    // Mismo patron que ya mordio en la Task 11 de SP0 y que documenta el
    // comentario sobre `vendedor_id` desnormalizado en esa misma migracion:
    // RLS filtra por FILA visible, no por "la fila que yo quiero", y varias
    // politicas permisivas del mismo comando se combinan con OR, no se
    // restringen entre si.
    //
    // `perfiles` tiene una politica de super_admin (perfil_lectura_super_admin)
    // que tampoco restringe por id, asi que sin filtrar por id una cuenta
    // super_admin podria traer un perfil ajeno o fallar por multiples filas.
    const [{ data: previo }, { data: perfil }] = await Promise.all([
      db.from('leads').select('id')
        .eq('propiedad_id', p.id).eq('comprador_id', sesion.idUsuario).maybeSingle(),
      db.from('perfiles').select('telefono').eq('id', sesion.idUsuario).maybeSingle(),
    ])
    yaContacto = previo !== null
    telefonoPrevio = perfil?.telefono ?? ''
    esDelVendedor = sesion.idUsuario === p.vendedor_id
  }

  return <main className="mx-auto w-full max-w-5xl px-6 py-12">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializarJsonLd(datosFicha(p, barrio)) }} />
    <Link href={`/${barrio.slug}`}>Volver a {barrio.nombre}</Link>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-3xl font-semibold">{p.titulo}</h1>
      {sesion.hayUsuario && (
        <BotonFavorito propiedadId={p.id} inicialEsFavorito={esFavorito} mostrarTexto />
      )}
    </div>
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

    {!sesion.hayUsuario ? (
      <p className="mt-8 rounded-md border border-linea bg-superficie p-6">
        <Link href={`/login?volver=${encodeURIComponent(rutaFicha)}`}
          className="font-medium text-marca hover:underline">
          Entra o crea cuenta para contactar
        </Link>{' '}
        al vendedor de esta propiedad.
      </p>
    ) : yaContacto ? (
      <p className="mt-8 rounded-md border border-linea bg-superficie p-6 text-tinta-suave">
        Ya contactaste sobre esta propiedad.
      </p>
    ) : esDelVendedor ? null : (
      <div className="mt-8">
        <FormularioLead propiedadId={p.id} telefonoPrevio={telefonoPrevio} />
      </div>
    )}
  </main>
}
