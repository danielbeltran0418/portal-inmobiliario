import Link from 'next/link'
import { CircleDashed } from 'lucide-react'
import { ChipEstado } from '@/components/ui/compuestos'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { firmarImagenes } from '@/lib/imagenes/firmar'
import { MAXIMO_IMAGENES_POR_PROPIEDAD } from '@/lib/imagenes/procesar'
import { faltantesParaPublicar, puedePublicar } from '@/lib/propiedades/completitud'
import { textoPrecio } from '@/lib/propiedades/panel'
import { cambiarEstado, type EstadoDestino } from '../acciones'
import { FormularioDatos, type PropiedadFormulario, type BarrioOpcion } from './formulario-datos'
import { PanelFotos, type ImagenPanel } from './panel-fotos'
import { BotonEliminar } from './boton-eliminar'

export const metadata: Metadata = {
  title: 'Editar propiedad | Portal Inmobiliario',
  description: 'Completa los datos y las fotos de tu propiedad.',
  // Privada: no se indexa, y ademas no se sigue ningun enlace desde ella.
  robots: { index: false, follow: false },
}

interface ImagenCruda {
  id: string
  ruta_storage: string
  alt_text: string
  orden: number
}

interface PropiedadCruda {
  id: string
  titulo: string
  descripcion: string | null
  operacion: PropiedadFormulario['operacion']
  tipo_inmueble: PropiedadFormulario['tipo_inmueble']
  precio: number | null
  habitaciones: number | null
  banos: number | null
  area_m2: number | null
  barrio_id: string | null
  estado: string
  estrato?: number | null
  administracion?: number | null
  parqueaderos?: number | null
  anio_construccion?: number | null
  piso?: number | null
  imagenes_propiedad: readonly ImagenCruda[] | null
}

const ETIQUETA_ESTADO: Record<EstadoDestino, string> = {
  publicada: 'Publicar',
  pausada: 'Pausar',
  vendida: 'Marcar como vendida',
  borrador: 'Volver a borrador',
}

// Se ofrecen los tres destinos distintos del estado actual, siempre en este
// orden. cambiarEstado (Task 9) ya valida que solo publicar tenga requisitos.
const DESTINOS_DE_ESTADO: readonly EstadoDestino[] = ['publicada', 'pausada', 'vendida', 'borrador']

/**
 * Envoltorio con 'use server' PROPIA (aunque este archivo no lo sea): un
 * Server Component solo puede pasarle a `action` de un <form> un string o una
 * referencia de Server Action -- una funcion arbitraria sin 'use server' no
 * es serializable en el RSC payload. cambiarEstado (Task 9) SI es una accion
 * de servidor valida en tiempo de ejecucion, pero devuelve
 * Promise<EstadoPropiedad>, y el tipo de `action` exige `void | Promise<void>`
 * -- de ahi este envoltorio, solo para adaptar el tipo de retorno.
 */
async function accionCambiarEstado(id: string, destino: EstadoDestino): Promise<void> {
  'use server'
  await cambiarEstado(id, destino)
}

/**
 * Pantalla de edicion: datos + fotos + botones de estado de UNA propiedad.
 *
 * El `.eq('vendedor_id', usuario.user.id)` de abajo NO es opcional. Igual que
 * en /panel (Task 11, ver el comentario de ese page.tsx), `propiedades` tiene
 * DOS politicas SELECT permisivas para `authenticated`
 * (propiedades_lectura_dueno: vendedor_id = auth.uid(); propiedades_lectura_publica:
 * estado = 'publicada'), y Postgres las combina con OR. Sin este filtro
 * explicito, `.eq('id', id).maybeSingle()` devolveria CUALQUIER propiedad
 * publicada de cualquier vendedor con solo conocer su id -- un vendedor
 * podria abrir la pantalla de edicion (aunque no pudiera guardar cambios,
 * bloqueados por la RLS de UPDATE) de una propiedad ajena. Con el filtro,
 * una propiedad que no es del vendedor autenticado sale `null` sin importar
 * su estado, y esta funcion responde con notFound().
 */
export default async function PaginaEditarPropiedad({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await crearClienteServidor()

  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario.user) redirect('/login')

  // direccion vive en propiedades_ubicacion desde 20260914000100 (cierre de
  // la fuga: authenticated conservaba el SELECT de tabla completa sobre
  // propiedades, asi que un autenticado ajeno podia leer la direccion de
  // cualquier propiedad publicada). RLS por fila (ubicacion_lectura_dueno)
  // hace el mismo trabajo que el `.eq('vendedor_id', ...)` de abajo: si la
  // propiedad no es del vendedor autenticado, la consulta a
  // propiedades_ubicacion devuelve null igual que la de propiedades.
  const [{ data: propiedad }, { data: barrios }, { data: ubicacion }] = await Promise.all([
    supabase
      .from('propiedades')
      .select(
        'id, titulo, descripcion, operacion, tipo_inmueble, precio, habitaciones, banos, ' +
        'area_m2, barrio_id, estado, estrato, administracion, parqueaderos, anio_construccion, piso, ' +
        'imagenes_propiedad(id, ruta_storage, alt_text, orden)',
      )
      .eq('id', id)
      .eq('vendedor_id', usuario.user.id)
      .maybeSingle(),
    // barrios_lectura_publica ya exige activo = true; se repite aqui para no
    // depender solo de RLS en un desplegable que el vendedor va a usar.
    supabase.from('barrios').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('propiedades_ubicacion').select('direccion, latitud, longitud').eq('propiedad_id', id).maybeSingle(),
  ])

  if (!propiedad) notFound()

  const p = propiedad as unknown as PropiedadCruda
  const imagenes = [...(p.imagenes_propiedad ?? [])].sort((a, b) => a.orden - b.orden)

  // El bucket es PRIVADO (ver firmar.ts): jamas se construye una URL publica
  // de Storage. Toda URL que llegue a PanelFotos sale de firmarImagenes.
  const firmadas = await firmarImagenes(imagenes.map((img) => img.ruta_storage))

  const datosParaCompletitud = {
    descripcion: p.descripcion,
    barrio_id: p.barrio_id,
    precio: p.precio,
    numeroDeImagenes: imagenes.length,
  }
  // faltantes: la lista COMPLETA (foto, precio, barrio, descripcion) es solo
  // guia y se sigue mostrando entera. bloqueaPublicar: hallazgo Importante de
  // la revision final -- el boton "Publicar" solo debe condicionarse a lo
  // que la base impone de verdad (foto y precio), nunca a barrio ni
  // descripcion. Ver el comentario de puedePublicar() en completitud.ts.
  const faltantes = faltantesParaPublicar(datosParaCompletitud)
  const bloqueaPublicar = !puedePublicar(datosParaCompletitud)

  const imagenesPanel: ImagenPanel[] = imagenes.map((img) => ({
    id: img.id,
    altText: img.alt_text,
    url: firmadas.get(img.ruta_storage) ?? null,
  }))

  const barriosOpciones: BarrioOpcion[] = (barrios ?? []) as BarrioOpcion[]

  const propiedadFormulario: PropiedadFormulario = {
    id: p.id,
    titulo: p.titulo,
    descripcion: p.descripcion,
    operacion: p.operacion,
    tipo_inmueble: p.tipo_inmueble,
    precio: p.precio,
    habitaciones: p.habitaciones,
    banos: p.banos,
    area_m2: p.area_m2,
    barrio_id: p.barrio_id,
    estrato: p.estrato ?? null,
    administracion: p.administracion ?? null,
    parqueaderos: p.parqueaderos ?? null,
    anio_construccion: p.anio_construccion ?? null,
    piso: p.piso ?? null,
    direccion: ubicacion?.direccion ?? null,
    coordenadas:
      ubicacion?.latitud != null && ubicacion?.longitud != null
        ? `${ubicacion.latitud}, ${ubicacion.longitud}`
        : null,
  }

  const TARJETA = 'rounded-2xl border border-linea bg-superficie p-6'

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Miga de pan" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
        <Link href="/panel" className="transition-colors hover:text-tinta">Mis propiedades</Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-tinta">Editar propiedad</span>
      </nav>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words font-titulo text-3xl font-semibold text-tinta">{p.titulo}</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Estado: {p.estado} · Precio: {textoPrecio(p.precio)}
          </p>
        </div>
        <ChipEstado estado={p.estado} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <section className={TARJETA}>
            <h2 className="mb-5 font-titulo text-xl font-semibold text-tinta">Información general</h2>
            <FormularioDatos propiedad={propiedadFormulario} barrios={barriosOpciones} />
          </section>

          <section className={TARJETA}>
            <PanelFotos
              propiedadId={id}
              imagenes={imagenesPanel}
              maximoFotos={MAXIMO_IMAGENES_POR_PROPIEDAD}
              alMaximo={imagenes.length >= MAXIMO_IMAGENES_POR_PROPIEDAD}
            />
          </section>

          {/* Hallazgo Importante de la revision final de rama: eliminarPropiedad()
              (acciones.ts) ya estaba construida y probada, pero ninguna pantalla la
              llamaba -- y por eso drenarLimpieza(), que solo se invoca desde ahi
              dentro, nunca corria en produccion. Seccion propia, separada de "Datos"
              y "Fotos": es la unica accion irreversible de esta pantalla. */}
          <section className="rounded-2xl border border-peligro/30 bg-superficie p-6">
            <h2 className="font-titulo text-xl font-semibold text-tinta">Eliminar propiedad</h2>
            <p className="mt-1 text-sm text-tinta-suave">
              Borra la propiedad y todas sus fotos de forma permanente.
            </p>
            <BotonEliminar id={id} />
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <section className={TARJETA}>
            <h2 className="mb-4 text-sm font-semibold text-tinta">Estado y publicación</h2>
            <div className="flex flex-col gap-2">
              {DESTINOS_DE_ESTADO.filter((destino) => destino !== p.estado).map((destino) => (
                <form key={destino} action={accionCambiarEstado.bind(null, id, destino)}>
                  <button
                    type="submit"
                    disabled={destino === 'publicada' && bloqueaPublicar}
                    className={
                      destino === 'publicada'
                        ? 'w-full cursor-pointer rounded-xl bg-marca py-2.5 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte disabled:cursor-not-allowed disabled:opacity-40'
                        : 'w-full cursor-pointer rounded-xl border border-linea py-2.5 text-sm font-medium text-tinta transition-colors hover:border-marca hover:text-marca disabled:cursor-not-allowed disabled:opacity-40'
                    }
                  >
                    {ETIQUETA_ESTADO[destino]}
                  </button>
                </form>
              ))}
            </div>
          </section>

          {faltantes.length > 0 && (
            <section className="rounded-2xl border border-realce/30 bg-realce-suave p-5 text-sm">
              <h2 className="mb-2 font-semibold text-realce">Para publicarla falta:</h2>
              <ul className="space-y-1.5 text-tinta">
                {faltantes.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CircleDashed aria-hidden="true" className="h-4 w-4 shrink-0 text-realce" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  )
}
