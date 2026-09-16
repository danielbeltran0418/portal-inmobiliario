import type { Metadata } from 'next'
import Link from 'next/link'
import { sesionActual } from '@/lib/auth/sesion'
import { enlaceDePanel } from '@/lib/navegacion/enlaces'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'

const urlBase = (process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')
const fallbackImg = `${urlBase}/og-fallback.jpg`
const tituloLanding = 'Portal Inmobiliario de Barranquilla'
const descripcionLanding =
  'Portal inmobiliario de Barranquilla: crea tu cuenta para buscar vivienda en la ciudad ' +
  'o para publicar las propiedades que tienes en venta y en arriendo.'

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

export default async function PaginaInicio() {
  const panel = enlaceDePanel(await sesionActual())

  // Los barrios se leen con el cliente publico: RLS decide que es visible, y
  // un visitante anonimo debe poder ver esta lista sin cuenta.
  // Un fallo de la consulta NO tumba la portada: se degrada a lista vacia.
  const { data: barriosCrudos } = await crearClientePublico()
    .from('barrios')
    .select('nombre,slug')
    .eq('activo', true)
    .order('nombre')
  const barrios = barriosCrudos ?? []

  return (
    <main className="relative mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:py-16">
      {/* Fondo ambiental sutil en el hero */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-96 opacity-60 dark:opacity-20"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 0%, color-mix(in srgb, var(--marca) 18%, transparent), transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* ─── HERO SECTION ─── */}
      <section className="mx-auto max-w-3xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-marca/30 bg-marca/10 px-3.5 py-1 text-xs font-medium text-marca">
          <span className="h-2 w-2 rounded-full bg-marca anim-pulso" aria-hidden="true" />
          <span>Plataforma directa de vivienda en Barranquilla</span>
        </div>

        <h1 className="mt-6 font-titulo text-4xl font-bold tracking-tight text-tinta sm:text-5xl lg:text-6xl">
          Vivienda en Barranquilla, <span className="text-marca">sin intermediarios</span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-tinta-suave sm:text-xl">
          Un portal donde quien vende o arrienda publica su propiedad y quien busca la encuentra
          por barrio, precio y tipo de inmueble. Trato 100% directo entre las partes, sin
          comisiones ocultas.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs font-medium text-tinta-tenue">
          <span>✨ El Prado</span>
          <span>·</span>
          <span>Alto Prado</span>
          <span>·</span>
          <span>Riomar</span>
          <span>·</span>
          <span>Villa Carolina</span>
          <span>·</span>
          <span>Boston</span>
        </div>
      </section>

      {/* ─── PUERTAS DE ACCESO O SESIÓN ABIERTA ─── */}
      {panel ? (
        <section className="mt-14 overflow-hidden rounded-xl border border-marca/30 bg-superficie p-8 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-marca-suave px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-marca">
                Sesión activa
              </span>
              <h2 className="mt-2 text-2xl font-bold text-tinta">Ya tienes una sesión abierta</h2>
              <p className="mt-1 text-sm text-tinta-suave">
                Continúa gestionando tus propiedades, citas o búsquedas guardadas.
              </p>
            </div>
            <Link
              href={panel.destino}
              className="inline-flex items-center gap-2 rounded-md bg-marca px-6 py-3 text-sm font-semibold text-marca-contraste shadow-xs transition-all hover:bg-marca-fuerte"
            >
              <span>Continuar a {panel.etiqueta}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="mt-14 grid gap-6 sm:grid-cols-2">
            {/* Puerta Comprador */}
            <div className="tarjeta-interactiva group flex flex-col justify-between rounded-xl border border-linea bg-superficie p-7 shadow-xs">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-marca-suave text-marca transition-transform group-hover:scale-110">
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <h2 className="mt-5 text-xl font-bold text-tinta">Quiero buscar una propiedad</h2>
                <p className="mt-2 text-sm leading-relaxed text-tinta-suave">
                  Crea tu cuenta de comprador para guardar búsquedas, marcar favoritos y contactar
                  directamente a los propietarios sin intermediarios.
                </p>
                <ul className="mt-4 space-y-2 text-xs font-medium text-tinta-suave">
                  <li className="flex items-center gap-2">
                    <span className="text-marca">✓</span> Búsquedas y filtros guardados por barrio
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-marca">✓</span> Agendamiento de visitas transparente
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-marca">✓</span> Trato directo y sin intermediarios
                  </li>
                </ul>
              </div>

              <div className="mt-8 border-t border-linea/60 pt-5">
                <Link
                  href="/registro"
                  className="inline-flex w-full items-center justify-center rounded-md bg-tinta px-5 py-3 text-sm font-semibold text-superficie shadow-xs transition-opacity hover:opacity-90 sm:w-auto"
                >
                  Crear cuenta de comprador
                </Link>
              </div>
            </div>

            {/* Puerta Vendedor */}
            <div className="tarjeta-interactiva group flex flex-col justify-between rounded-xl border border-marca/30 bg-superficie p-7 shadow-xs">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-realce-suave text-realce transition-transform group-hover:scale-110">
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                    />
                  </svg>
                </div>
                <h2 className="mt-5 text-xl font-bold text-tinta">Quiero publicar propiedades</h2>
                <p className="mt-2 text-sm leading-relaxed text-tinta-suave">
                  Crea tu cuenta de vendedor para publicar tus inmuebles con fotos, barrio y precio,
                  y gestionarlos desde un solo panel sin pagar comisión de corretaje.
                </p>
                <ul className="mt-4 space-y-2 text-xs font-medium text-tinta-suave">
                  <li className="flex items-center gap-2">
                    <span className="text-realce">✓</span> Publica con fotos nítidas en WebP
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-realce">✓</span> Control de agenda y visitas
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-realce">✓</span> Sin comisiones del 3% al 5%
                  </li>
                </ul>
              </div>

              <div className="mt-8 border-t border-linea/60 pt-5">
                <Link
                  href="/registro"
                  className="inline-flex w-full items-center justify-center rounded-md bg-marca px-5 py-3 text-sm font-semibold text-marca-contraste shadow-xs transition-colors hover:bg-marca-fuerte sm:w-auto"
                >
                  Crear cuenta de vendedor
                </Link>
              </div>
            </div>
          </section>

          {/* Acceso para cuentas existentes */}
          <section className="mt-8 flex flex-wrap items-center justify-center gap-3 rounded-lg border border-linea/70 bg-superficie-alt/50 p-4 text-sm text-tinta-suave">
            <span>¿Ya tienes una cuenta registrada en el portal?</span>
            <Link
              href="/login"
              className="inline-flex items-center font-semibold text-marca hover:underline"
            >
              Entrar <span aria-hidden="true" className="ml-1">→</span>
            </Link>
          </section>
        </>
      )}

      {/* ─── 4 PILARES DE CONFIANZA ─── */}
      <section className="mt-20 border-t border-linea/80 pt-12">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-linea/60 bg-superficie p-5">
            <span className="text-2xl">🤝</span>
            <h3 className="mt-3 font-semibold text-tinta">100% Trato directo</h3>
            <p className="mt-1 text-xs leading-relaxed text-tinta-suave">
              Contacto directo entre propietario y comprador, sin intermediarios ni cobros extra.
            </p>
          </div>

          <div className="rounded-lg border border-linea/60 bg-superficie p-5">
            <span className="text-2xl">📸</span>
            <h3 className="mt-3 font-semibold text-tinta">Fotos verificadas</h3>
            <p className="mt-1 text-xs leading-relaxed text-tinta-suave">
              Fotografías en alta resolución optimizadas a WebP, sin marcas de agua de terceros.
            </p>
          </div>

          <div className="rounded-lg border border-linea/60 bg-superficie p-5">
            <span className="text-2xl">🗓️</span>
            <h3 className="mt-3 font-semibold text-tinta">Agenda inteligente</h3>
            <p className="mt-1 text-xs leading-relaxed text-tinta-suave">
              Coordinación y agendamiento de visitas en franjas acordadas con confirmación segura.
            </p>
          </div>

          <div className="rounded-lg border border-linea/60 bg-superficie p-5">
            <span className="text-2xl">🔒</span>
            <h3 className="mt-3 font-semibold text-tinta">Privacidad cuidada</h3>
            <p className="mt-1 text-xs leading-relaxed text-tinta-suave">
              La dirección exacta se reserva para los interesados con cita confirmada.
            </p>
          </div>
        </div>
      </section>

      {/* ─── EXPLORA POR BARRIO ─── */}
      <section className="mt-20 border-t border-linea/80 pt-12">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-marca">Catálogo abierto</p>
            <h2 className="mt-1 text-3xl font-bold text-tinta">Explora por barrio</h2>
          </div>
          <p className="text-sm text-tinta-suave">
            Encuentra tu próximo inmueble en las zonas residenciales y comerciales de la ciudad.
          </p>
        </div>

        {barrios.length === 0 ? (
          <p className="mt-6 rounded-md border border-linea bg-superficie p-8 text-center text-tinta-suave">
            Todavía no hay barrios disponibles. Vuelve pronto.
          </p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {barrios.map((barrio) => (
              <li key={barrio.slug}>
                <Link
                  href={`/${barrio.slug}`}
                  className="tarjeta-interactiva group flex items-center justify-between rounded-lg border border-linea bg-superficie px-5 py-4 text-tinta shadow-2xs transition-all hover:border-marca hover:bg-superficie-alt/60"
                >
                  {barrio.nombre}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
