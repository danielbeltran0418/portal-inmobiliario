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
        'area_m2, barrio_id, estado, imagenes_propiedad(id, ruta_storage, alt_text, orden)',
      )
      .eq('id', id)
      .eq('vendedor_id', usuario.user.id)
      .maybeSingle(),
    // barrios_lectura_publica ya exige activo = true; se repite aqui para no
    // depender solo de RLS en un desplegable que el vendedor va a usar.
    supabase.from('barrios').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('propiedades_ubicacion').select('direccion').eq('propiedad_id', id).maybeSingle(),
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
    direccion: ubicacion?.direccion ?? null,
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">{p.titulo}</h1>
      <p className="mt-1 opacity-80">
        Estado: {p.estado} · Precio: {textoPrecio(p.precio)}
      </p>

      {faltantes.length > 0 && (
        <div
          className="mt-4 rounded border border-amber-500/50 bg-amber-500/10 p-4 text-sm"
        >
          <p className="font-medium">Para publicarla falta:</p>
          <ul className="mt-1 list-disc pl-5">
            {faltantes.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {DESTINOS_DE_ESTADO.filter((destino) => destino !== p.estado).map((destino) => (
          <form key={destino} action={accionCambiarEstado.bind(null, id, destino)}>
            <button
              type="submit"
              disabled={destino === 'publicada' && bloqueaPublicar}
              className="rounded border px-4 py-2 text-sm disabled:opacity-40"
            >
              {ETIQUETA_ESTADO[destino]}
            </button>
          </form>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Datos</h2>
        <div className="mt-4">
          <FormularioDatos propiedad={propiedadFormulario} barrios={barriosOpciones} />
        </div>
      </section>

      <section className="mt-8">
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
      <section className="mt-8 border-t border-black/10 pt-6 dark:border-white/15">
        <h2 className="text-lg font-medium">Eliminar propiedad</h2>
        <p className="mt-1 text-sm opacity-80">
          Borra la propiedad y todas sus fotos de forma permanente.
        </p>
        <BotonEliminar id={id} />
      </section>
    </main>
  )
}
