import { GaleriaFicha } from '@/components/galeria-ficha'
import { BotonFavorito } from '@/components/comprador/BotonFavorito'
import { cache } from 'react'
import { metadatosFicha, datosFicha, serializarJsonLd } from '@/lib/catalogo/seo'
import Link from 'next/link'
import { Bath, BedDouble, MapPin, Maximize2 } from 'lucide-react'
import { notFound, permanentRedirect } from 'next/navigation'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { MapaZona } from '@/components/mapa-zona'
import { mapaDisponible } from '@/lib/mapa/google'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { sesionActual } from '@/lib/auth/sesion'
import { FormularioLead } from './formulario-lead'
import { BotonAgendar } from './boton-agendar'
import { rolDesdeToken } from '@/lib/auth/roles'
const cargarFicha = cache(async (slug: string) => {
  const { data: p, error } = await crearClientePublico().from('propiedades')
    .select('id,vendedor_id,slug,titulo,descripcion,precio,operacion,tipo_inmueble,habitaciones,banos,area_m2,barrios!inner(nombre,slug,ciudad),imagenes_propiedad(id,alt_text,orden)')
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
/** Centro aproximado de la zona (migracion 20261011000100), o null. */
async function cargarZona(propiedadId: string): Promise<{ latitud: number; longitud: number } | null> {
  // Sin clave de Google no hay imagen que mostrar: ni se consulta la zona.
  if (!mapaDisponible()) return null
  try {
    const { data, error } = await crearClientePublico().rpc('zona_aproximada_propiedad', { p_propiedad_id: propiedadId })
    const fila = (data as { latitud: number; longitud: number }[] | null)?.[0]
    return !error && fila && Number.isFinite(fila.latitud) && Number.isFinite(fila.longitud) ? fila : null
  } catch {
    return null
  }
}

export default async function FichaPublica({ params }: { params: Promise<{ barrio: string; slug: string }> }) {
  const ruta = await params
  // La sesion no depende de la ficha: se lanza a la vez. Si la ficha no
  // existe, notFound() corta antes de esperarla; el .catch() la marca como
  // atendida para que su rechazo no quede suelto. Al esperarla mas abajo, un
  // fallo real sigue propagandose.
  const sesionPendiente = sesionActual()
  sesionPendiente.catch(() => {})
  const p = await cargarFicha(ruta.slug)
  // Lectura publica e independiente de la sesion: se lanza ya. Nunca rompe la
  // ficha: sin coordenadas o con fallo, simplemente no hay mapa.
  const zonaPendiente = cargarZona(p.id)
  const barrio = Array.isArray(p.barrios) ? p.barrios[0] : p.barrios
  if (!barrio) notFound()
  if (barrio.slug !== ruta.barrio) permanentRedirect(`/${barrio.slug}/${p.slug}`)
  const fotos = [...p.imagenes_propiedad].sort((a, b) => a.orden - b.orden)

  // La ficha es publica y esta cacheada por SP1; esta parte depende de la
  // sesion, asi que se resuelve en cada peticion. El layout raiz ya declara
  // force-dynamic, de modo que no cuesta nada extra.
  const [sesion, zona] = await Promise.all([sesionPendiente, zonaPendiente])
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

  const precio = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p.precio)
  const datosClave = [
    p.habitaciones != null && { etiqueta: 'Habitaciones', valor: String(p.habitaciones), Icono: BedDouble },
    p.banos != null && { etiqueta: 'Baños', valor: String(p.banos), Icono: Bath },
    p.area_m2 != null && { etiqueta: 'Área', valor: `${p.area_m2} m²`, Icono: Maximize2 },
  ].filter((d): d is { etiqueta: string; valor: string; Icono: typeof Bath } => Boolean(d))
  const TARJETA = 'rounded-2xl border border-linea bg-superficie p-6'

  return <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializarJsonLd(datosFicha(p, barrio)) }} />
    <nav aria-label="Miga de pan" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
      <Link href="/" className="transition-colors hover:text-tinta">Inicio</Link>
      <span aria-hidden="true">/</span>
      <Link href={`/${barrio.slug}`} className="transition-colors hover:text-tinta">{barrio.nombre}</Link>
      <span aria-hidden="true">/</span>
      <span className="line-clamp-1 font-medium text-tinta">{p.titulo}</span>
    </nav>

    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <GaleriaFicha fotos={fotos} titulo={p.titulo} />

        <div className="mt-8 mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
              {p.operacion} · {p.tipo_inmueble || 'Inmueble'} · {barrio.nombre}
            </p>
            <h1 className="break-words font-titulo text-2xl font-semibold text-tinta sm:text-3xl">{p.titulo}</h1>
          </div>
          {sesion.hayUsuario && <BotonFavorito propiedadId={p.id} inicialEsFavorito={esFavorito} mostrarTexto />}
        </div>

        <p className="cifra mb-6 text-2xl font-bold text-tinta">{precio}</p>

        {datosClave.length > 0 && (
          <dl className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-3">
            {datosClave.map(({ etiqueta, valor, Icono }) => (
              <div key={etiqueta} className="flex flex-col-reverse items-center rounded-2xl border border-linea bg-fondo p-4 text-center">
                <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
                <dd className="text-lg font-semibold text-tinta">{valor}</dd>
                <Icono aria-hidden="true" className="mb-1 h-6 w-6 text-marca" strokeWidth={1.5} />
              </div>
            ))}
          </dl>
        )}

        <section className="mb-8">
          <h2 className="mb-3 font-titulo text-xl font-semibold text-tinta">Descripción</h2>
          <p className="whitespace-pre-wrap break-words leading-relaxed text-tinta-suave">{p.descripcion}</p>
        </section>

        {zona ? (
          <section aria-labelledby="titulo-ubicacion">
            <h2 id="titulo-ubicacion" className="mb-3 font-titulo text-xl font-semibold text-tinta">Ubicación</h2>
            <MapaZona propiedadId={p.id} zona={zona} barrio={barrio.nombre} />
          </section>
        ) : (
          <div className="flex items-start gap-4 rounded-2xl bg-marca-suave p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marca/10">
              <MapPin aria-hidden="true" className="h-5 w-5 text-marca" strokeWidth={1.5} />
            </span>
            <div>
              <h3 className="mb-0.5 font-medium text-marca">Barrio {barrio.nombre}</h3>
              <p className="text-sm text-tinta-suave">
                La dirección exacta se comparte 2 horas antes de la visita agendada, para proteger la privacidad del propietario.
              </p>
            </div>
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-80 xl:w-96">
        {!sesion.hayUsuario ? (
          <div className={TARJETA}>
            <h2 className="font-titulo text-xl font-semibold text-tinta">¿Te interesa esta propiedad?</h2>
            <p className="mt-2 text-sm leading-relaxed text-tinta-suave">Entra o crea tu cuenta para contactar directamente al propietario y agendar una visita.</p>
            <Link href={`/login?volver=${encodeURIComponent(rutaFicha)}`} className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-marca px-4 py-3 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte">Entra o crea cuenta para contactar</Link>
          </div>
        ) : yaContacto ? (
          <div className={TARJETA}>
            <p className="text-sm font-medium text-tinta">Ya contactaste sobre esta propiedad.</p>
            {esComprador && <div className="mt-4"><BotonAgendar propiedadId={p.id} rutaFicha={rutaFicha} texto="Abrir el chat para agendar tu visita" /></div>}
          </div>
        ) : esDelVendedor ? null : (
          <div className={TARJETA}>
            <FormularioLead propiedadId={p.id} telefonoPrevio={telefonoPrevio} />
            {esComprador && (
              <div className="mt-5 border-t border-linea pt-5">
                <p className="mb-3 text-center text-xs text-tinta-suave">¿Prefieres hablar con el asistente de IA?</p>
                <BotonAgendar propiedadId={p.id} rutaFicha={rutaFicha} texto="Agendar visita con el asistente" />
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  </main>
}
