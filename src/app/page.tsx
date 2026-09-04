import type { Metadata } from 'next'
import Link from 'next/link'
import { sesionActual } from '@/lib/auth/sesion'
import { enlaceDePanel } from '@/lib/navegacion/enlaces'

export const metadata: Metadata = {
  title: 'Portal Inmobiliario de Barranquilla',
  description:
    'Portal inmobiliario de Barranquilla: crea tu cuenta para buscar vivienda en la ciudad ' +
    'o para publicar las propiedades que tienes en venta y en arriendo.',
}

const CLASE_BOTON_PRIMARIO =
  'inline-flex items-center justify-center rounded bg-foreground px-5 py-2.5 ' +
  'text-sm font-medium text-background hover:opacity-90'

const CLASE_BOTON_SECUNDARIO =
  'inline-flex items-center justify-center rounded border border-black/20 px-5 py-2.5 ' +
  'text-sm font-medium hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10'

/**
 * Las dos puertas de entrada. Las dos llevan a /registro porque es alli donde
 * se elige el rol (comprador o vendedor), que es lo que de verdad las
 * distingue; el enlace a /login queda aparte para quien ya tiene cuenta.
 */
const PUERTAS = [
  {
    titulo: 'Quiero buscar una propiedad',
    texto:
      'Crea tu cuenta de comprador para guardar búsquedas y contactar directamente a quien ' +
      'publica.',
    accion: 'Crear cuenta de comprador',
  },
  {
    titulo: 'Quiero publicar propiedades',
    texto:
      'Crea tu cuenta de vendedor para publicar tus inmuebles con fotos, barrio y precio, y ' +
      'gestionarlos desde un solo panel.',
    accion: 'Crear cuenta de vendedor',
  },
] as const

export default async function PaginaInicio() {
  const panel = enlaceDePanel(await sesionActual())

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <section className="max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-wide opacity-60">Barranquilla</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Vivienda en Barranquilla, sin intermediarios
        </h1>
        <p className="mt-5 text-lg leading-relaxed opacity-80">
          Un sitio donde quien vende o arrienda publica su propiedad y quien busca la encuentra
          por barrio, precio y tipo de inmueble. El trato es directo entre las dos partes.
        </p>
      </section>

      {panel ? (
        /**
         * Con la sesion ya abierta no tiene sentido invitar a registrarse: se
         * ofrece el panel que le toca al rol. El destino sale de
         * enlaceDePanel, la misma funcion que usa la cabecera.
         */
        <section className="mt-12 rounded border border-black/10 p-6 dark:border-white/15">
          <h2 className="text-xl font-semibold">Ya tienes una sesión abierta</h2>
          <p className="mt-2 opacity-80">Continúa donde lo dejaste.</p>
          <Link href={panel.destino} className={`${CLASE_BOTON_PRIMARIO} mt-5`}>
            Continuar a {panel.etiqueta}
          </Link>
        </section>
      ) : (
        <>
          <section className="mt-12 grid gap-6 sm:grid-cols-2">
            {PUERTAS.map((puerta) => (
              <div
                key={puerta.titulo}
                className="flex flex-col rounded border border-black/10 p-6 dark:border-white/15"
              >
                <h2 className="text-xl font-semibold">{puerta.titulo}</h2>
                <p className="mt-2 flex-1 opacity-80">{puerta.texto}</p>
                <Link href="/registro" className={`${CLASE_BOTON_PRIMARIO} mt-6 self-start`}>
                  {puerta.accion}
                </Link>
              </div>
            ))}
          </section>

          <section className="mt-10 flex flex-wrap items-center gap-4">
            <p className="opacity-80">¿Ya tienes cuenta?</p>
            <Link href="/login" className={CLASE_BOTON_SECUNDARIO}>
              Entrar
            </Link>
          </section>
        </>
      )}

      {/*
        Sin propiedades de muestra. El catalogo es el SP1 y todavia no hay nada
        publicado: inventar tarjetas de casas aqui seria enseñar datos falsos.
      */}
      <p className="mt-16 border-t border-black/10 pt-6 text-sm opacity-60 dark:border-white/15">
        El catálogo público de propiedades está en construcción. Por ahora puedes crear tu cuenta
        para tenerla lista cuando abra.
      </p>
    </main>
  )
}
