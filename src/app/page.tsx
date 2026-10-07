import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarCheck, MessageCircle, Search } from 'lucide-react'
import { BuscadorPortada } from '@/components/buscador-portada'
import { TarjetaPropiedad, type PropiedadDeTarjeta } from '@/components/tarjeta-propiedad'
import { sesionActual } from '@/lib/auth/sesion'
import { CorazonTarjeta } from '@/components/comprador/corazon-tarjeta'
import { idsFavoritos } from '@/lib/comprador/favoritos'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { listarRecientes } from '@/lib/catalogo/consultas'
import { listarCiudades } from '@/lib/catalogo/ciudades'
import { enlaceDePanel } from '@/lib/navegacion/enlaces'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'

const urlBase = (process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')
const fallbackImg = `${urlBase}/og-fallback.jpg`
// El portal es nacional: ni el titulo ni la descripcion lo atan a una ciudad.
const tituloLanding = 'Portal Inmobiliario: vivienda en venta y arriendo en Colombia'
const descripcionLanding =
  'Encuentra vivienda en venta y en arriendo por barrio, o publica tus propiedades y trata ' +
  'directamente con los interesados, sin intermediarios.'

export const metadata: Metadata = {
  title: tituloLanding,
  description: descripcionLanding,
  alternates: {
    canonical: urlBase,
  },
  openGraph: {
    title: tituloLanding,
    description: descripcionLanding,
    url: urlBase,
    siteName: 'Portal Inmobiliario',
    locale: 'es_CO',
    type: 'website',
    images: [
      {
        url: fallbackImg,
        width: 1200,
        height: 630,
        alt: tituloLanding,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: tituloLanding,
    description: descripcionLanding,
    images: [fallbackImg],
  },
}

// Fondo de los barrios mientras no tengan foto propia: alterna los tonos suaves
// de la marca para que la cuadricula no sea un bloque uniforme.
const FONDOS_BARRIO = [
  'from-[#DDEDE9] to-[#C9E0DA]',
  'from-[#F7EAD6] to-[#EBD6B2]',
  'from-[#F3EEE5] to-[#E3DACC]',
  'from-[#DDEDE9] to-[#F3EEE5]',
]

const PASOS = [
  {
    icono: Search,
    titulo: 'Busca',
    texto: 'Filtra por barrio, tipo de inmueble y precio, y encuentra la propiedad que encaja con tu presupuesto.',
  },
  {
    icono: MessageCircle,
    titulo: 'Escribe',
    texto: 'El asistente de IA te atiende de inmediato, responde tus preguntas y consulta la agenda del propietario.',
  },
  {
    icono: CalendarCheck,
    titulo: 'Agenda tu visita',
    texto: 'Confirma la visita en una franja libre. La dirección exacta se revela 2 horas antes para proteger la privacidad.',
  },
] as const

export default async function PaginaInicio() {
  // La sesion y los barrios no dependen entre si: en paralelo.
  const sesionPendiente = sesionActual()
  // Si la consulta de barrios lanza antes de esperarla, no dejar su rechazo suelto.
  sesionPendiente.catch(() => {})

  // Los barrios y las propiedades se leen con el cliente publico: RLS decide que
  // es visible, y un visitante anonimo debe poder verlo sin cuenta. Un fallo de
  // cualquiera de las dos consultas NO tumba la portada: se degrada a vacio.
  const db = crearClientePublico()
  // Portal nacional: la portada ofrece CIUDADES, no la lista de todos los
  // barrios del pais (serian miles). Cada ciudad lleva a /ciudad/{slug}, que
  // muestra sus barrios.
  const [ciudades, recientes] = await Promise.all([listarCiudades(db), listarRecientes(db)])
  const sesion = await sesionPendiente
  const panel = enlaceDePanel(sesion)
  // Sin tipos generados, supabase-js tipa la relacion como lista aunque llegue
  // un objeto (es N:1): se normaliza como en la ficha, y sin barrio no hay enlace.
  const propiedades = (
    recientes as unknown as (PropiedadDeTarjeta & {
      barrios: { slug: string; nombre: string } | { slug: string; nombre: string }[] | null
    })[]
  )
    .map((p) => {
      const barrio = Array.isArray(p.barrios) ? p.barrios[0] : p.barrios
      return { ...p, barrioSlug: barrio?.slug, barrioNombre: barrio?.nombre }
    })
    .filter((p): p is typeof p & { barrioSlug: string } => Boolean(p.barrioSlug))
  // Los favoritos son del usuario: se leen con SU cliente (RLS), no con el publico.
  const favoritos = sesion.idUsuario
    ? await idsFavoritos(await crearClienteServidor(), sesion.idUsuario, propiedades.map((p) => p.id))
    : new Set<string>()

  return (
    <main className="flex-1">
      {/* ─── HERO ─── */}
      {/* Fondo oscuro FIJO (no el token de tinta, que en modo oscuro es claro):
          el texto del hero es blanco en ambos temas. La foto vive en
          /public/portada.jpg; mientras no exista, queda el degradado. */}
      <section
        className="relative isolate overflow-hidden bg-[#1F1B14] bg-cover bg-center"
        style={{
          backgroundImage:
            'linear-gradient(to bottom, rgb(31 27 20 / 0.65), rgb(31 27 20 / 0.55) 55%, rgb(31 27 20 / 0.35)), url(/portada.jpg)',
        }}
      >
        <div className="mx-auto flex min-h-[580px] max-w-7xl flex-col items-center justify-center px-4 py-20 text-center sm:min-h-[640px] sm:px-6">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-white/80">Vivienda en Colombia</p>
          <h1 className="mb-6 max-w-2xl font-titulo text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
            Encuentra tu próximo hogar, sin intermediarios
          </h1>
          <p className="mb-10 max-w-md text-lg text-white/75">
            Quien vende o arrienda publica su propiedad, y un asistente de IA agenda las visitas en tiempo real.
          </p>
          <BuscadorPortada ciudades={ciudades} />
        </div>
      </section>

      {/* ─── CIUDADES ─── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-8">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-tinta-tenue">Explorar por zona</p>
          <h2 className="font-titulo text-3xl font-semibold text-tinta">Explora por ciudad</h2>
        </div>

        {ciudades.length === 0 ? (
          <p className="rounded-2xl border border-linea bg-superficie p-8 text-center text-tinta-suave">
            Todavía no hay barrios disponibles. Vuelve pronto.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {ciudades.map((ciudad, i) => (
              <li key={ciudad.slug}>
                {/* aria-label: el nombre accesible es solo el de la ciudad. */}
                <Link
                  href={`/ciudad/${ciudad.slug}`}
                  aria-label={ciudad.nombre}
                  className={`tarjeta-interactiva group flex aspect-[4/3] flex-col justify-end rounded-2xl bg-gradient-to-br p-4 ${FONDOS_BARRIO[i % FONDOS_BARRIO.length]}`}
                >
                  <span className="break-words font-titulo text-xl font-semibold text-[#1F1B14]">{ciudad.nombre}</span>
                  <span className="mt-0.5 text-sm font-medium text-[#3F392F]" aria-hidden="true">
                    {ciudad.barrios} {ciudad.barrios === 1 ? 'barrio' : 'barrios'} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── RECIÉN PUBLICADOS ─── */}
      {propiedades.length > 0 && (
        <section className="bg-superficie py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-8">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-tinta-tenue">Catálogo</p>
              <h2 className="font-titulo text-3xl font-semibold text-tinta">Recién publicados</h2>
            </div>
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {propiedades.map((p) => (
                <TarjetaPropiedad
                  key={p.id}
                  propiedad={p}
                  barrioSlug={p.barrioSlug}
                  barrioNombre={p.barrioNombre}
                  accion={<CorazonTarjeta propiedadId={p.id} conSesion={sesion.hayUsuario} favorito={favoritos.has(p.id)} volver="/" />}
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ─── CÓMO FUNCIONA ─── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-tinta-tenue">Simple y transparente</p>
          <h2 className="font-titulo text-3xl font-semibold text-tinta">Cómo funciona</h2>
        </div>
        <ol className="grid grid-cols-1 gap-8 md:grid-cols-3 lg:gap-12">
          {PASOS.map(({ icono: Icono, titulo, texto }, i) => (
            <li key={titulo}>
              <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-marca-suave">
                <Icono aria-hidden="true" className="h-7 w-7 text-marca" strokeWidth={1.5} />
                <span
                  aria-hidden="true"
                  className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-marca text-xs font-bold text-marca-contraste"
                >
                  {i + 1}
                </span>
              </div>
              <h3 className="mb-2 font-titulo text-xl font-semibold text-tinta">{titulo}</h3>
              <p className="text-sm leading-relaxed text-tinta-suave">{texto}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ─── LLAMADA A LA ACCIÓN ─── */}
      {/* Verde fijo (no el token, que en oscuro se aclara): texto blanco en ambos temas. */}
      <section className="mx-4 mb-16 overflow-hidden rounded-3xl bg-[#0B6B5F] sm:mx-6 lg:mx-auto lg:max-w-7xl">
        {panel ? (
          <div className="flex flex-col items-start justify-between gap-6 px-8 py-12 sm:flex-row sm:items-center">
            <div>
              <h2 className="mb-2 font-titulo text-2xl font-semibold text-white sm:text-3xl">Ya tienes una sesión abierta</h2>
              <p className="text-white/80">Continúa gestionando tus propiedades, citas o búsquedas guardadas.</p>
            </div>
            <Link
              href={panel.destino}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#0B6B5F] transition-colors hover:bg-[#DDEDE9]"
            >
              Continuar a {panel.etiqueta} <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-start justify-between gap-6 px-8 py-12 lg:flex-row lg:items-center">
            <div>
              <h2 className="mb-2 font-titulo text-2xl font-semibold text-white sm:text-3xl">
                ¿Tienes un inmueble para vender o arrendar?
              </h2>
              <p className="text-white/80">
                Publica gratis y deja que el asistente de IA atienda a los interesados.{' '}
                <span className="whitespace-nowrap">
                  ¿Ya tienes cuenta?{' '}
                  <Link href="/login" className="font-semibold text-white underline underline-offset-2">
                    Entrar
                  </Link>
                </span>
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link
                href="/registro"
                className="inline-flex min-h-11 items-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#0B6B5F] transition-colors hover:bg-[#DDEDE9]"
              >
                Crear cuenta de vendedor
              </Link>
              <Link
                href="/registro"
                className="inline-flex min-h-11 items-center rounded-xl border border-white/60 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Crear cuenta de comprador
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
