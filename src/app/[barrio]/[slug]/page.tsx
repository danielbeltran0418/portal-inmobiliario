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
import { BotonAgendar } from './boton-agendar'
import { rolDesdeToken } from '@/lib/auth/roles'
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
  // /mi-cuenta, donde vive el chat, es solo de compradores: a un vendedor que
  // mira la ficha de otro no se le ofrece un boton que lo mandaria a su panel.
  const esComprador = sesion.hayUsuario && rolDesdeToken(sesion.accessToken ?? '') === 'comprador'

  // Las dos lecturas solo tienen sentido con sesion, y se saltan sin ella.
  let yaContacto = false
  let telefonoPrevio = ''
  let esDelVendedor = false
  let esFavorito = false

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
    const [{ data: previo }, { data: perfil }, { data: fav }] = await Promise.all([
      db.from('leads').select('id')
        .eq('propiedad_id', p.id).eq('comprador_id', sesion.idUsuario).maybeSingle(),
      db.from('perfiles').select('telefono').eq('id', sesion.idUsuario).maybeSingle(),
      db.from('favoritos').select('id')
        .eq('usuario_id', sesion.idUsuario).eq('propiedad_id', p.id).maybeSingle(),
    ])
    yaContacto = previo !== null
    telefonoPrevio = perfil?.telefono ?? ''
    esDelVendedor = sesion.idUsuario === p.vendedor_id
    esFavorito = fav !== null
  }

  return <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:py-14">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializarJsonLd(datosFicha(p, barrio)) }} />
    <Link href={`/${barrio.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-tinta-suave transition-colors hover:text-marca">
      <span aria-hidden="true">←</span> Volver a propiedades de {barrio.nombre}
    </Link>
    <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px] lg:items-start">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-marca">
              <span className="rounded-sm bg-marca-suave px-2.5 py-1">{p.operacion}</span>
              <span className="text-tinta-tenue">{p.tipo_inmueble || 'Inmueble'} · {barrio.nombre}</span>
            </div>
            <h1 className="mt-3 font-titulo text-3xl font-bold tracking-tight text-tinta sm:text-4xl">{p.titulo}</h1>
            <p className="cifra mt-3 font-titulo text-2xl font-bold text-tinta">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p.precio)}</p>
          </div>
          {sesion.hayUsuario && <BotonFavorito propiedadId={p.id} inicialEsFavorito={esFavorito} mostrarTexto />}
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">{fotos.map(f => <Image key={f.id} src={`/imagen/${f.id}`} alt={f.alt_text} width={800} height={600} unoptimized className="aspect-[4/3] w-full rounded-xl border border-linea object-cover shadow-xs" />)}</div>
        <section className="mt-10 border-t border-linea pt-8">
          <h2 className="font-titulo text-xl font-bold text-tinta">Acerca de esta propiedad</h2>
          <p className="mt-4 whitespace-pre-wrap leading-relaxed text-tinta-suave">{p.descripcion}</p>
          <dl className="mt-7 grid grid-cols-3 gap-3">
            {p.habitaciones != null && <div className="rounded-lg border border-linea bg-superficie p-4"><dt className="text-xs text-tinta-tenue">Habitaciones</dt><dd className="mt-1 text-lg font-bold text-tinta">{p.habitaciones}</dd></div>}
            {p.banos != null && <div className="rounded-lg border border-linea bg-superficie p-4"><dt className="text-xs text-tinta-tenue">Baños</dt><dd className="mt-1 text-lg font-bold text-tinta">{p.banos}</dd></div>}
            {p.area_m2 != null && <div className="rounded-lg border border-linea bg-superficie p-4"><dt className="text-xs text-tinta-tenue">Área</dt><dd className="mt-1 text-lg font-bold text-tinta">{p.area_m2} m²</dd></div>}
          </dl>
        </section>
      </div>

      </div>
      <aside className="lg:sticky lg:top-24">
        {!sesion.hayUsuario ? (
          <div className="rounded-xl border border-linea bg-superficie p-6 shadow-xs">
            <h2 className="font-titulo text-xl font-bold text-tinta">¿Te interesa esta propiedad?</h2>
            <p className="mt-2 text-sm leading-relaxed text-tinta-suave">Entra o crea tu cuenta para contactar directamente al propietario y agendar una visita.</p>
            <Link href={`/login?volver=${encodeURIComponent(rutaFicha)}`} className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-marca px-4 py-3 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte">Entra o crea cuenta</Link>
          </div>
        ) : yaContacto ? (
          <div className="rounded-xl border border-linea bg-superficie p-6 shadow-xs">
            <p className="text-sm font-medium text-tinta">Ya contactaste sobre esta propiedad.</p>
            {esComprador && <div className="mt-4"><BotonAgendar propiedadId={p.id} rutaFicha={rutaFicha} texto="Abrir el chat para agendar tu visita" /></div>}
          </div>
        ) : esDelVendedor ? null : (
          <div className="flex flex-col gap-6">
            {esComprador && <div className="rounded-xl border border-marca/40 bg-superficie p-6 shadow-xs"><h2 className="font-titulo text-xl font-bold text-tinta">Agendar una visita</h2><p className="mt-2 text-sm leading-relaxed text-tinta-suave">Consulta los horarios disponibles y agenda tu visita con el asistente.</p><div className="mt-5"><BotonAgendar propiedadId={p.id} rutaFicha={rutaFicha} texto="Agendar visita" /></div></div>}
            <div className="rounded-xl border border-linea bg-superficie p-6 shadow-xs"><h2 className="font-titulo text-xl font-bold text-tinta">Contactar al propietario</h2><p className="mt-2 text-sm text-tinta-suave">Escribe tu mensaje y recibe respuesta directamente.</p><div className="mt-4"><FormularioLead propiedadId={p.id} telefonoPrevio={telefonoPrevio} /></div></div>
          </div>
        )}
      </aside>
    </div>
  </main>
}
