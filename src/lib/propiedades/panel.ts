import { faltantesParaPublicar } from './completitud'

/**
 * Forma exacta que necesita esta funcion de la fila que devuelve la consulta
 * de la Task 11 (`imagenes_propiedad(id)` es una relacion anidada de
 * PostgREST, no una columna). No se tipa contra ningun `Database` generado:
 * este proyecto no lo usa en ningun otro punto (ver acciones.ts, que hace lo
 * mismo con un cast puntual).
 */
export interface PropiedadCruda {
  id: string
  titulo: string
  estado: string
  precio: number | null
  barrio_id: string | null
  descripcion: string | null
  imagenes_propiedad: readonly { id: string }[] | null
}

export interface FilaPanel {
  id: string
  titulo: string
  estado: string
  estadoTexto: string
  precioTexto: string
  faltantes: string[]
}

const ESTADO_TEXTO: Record<string, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  publicada: 'Publicada',
  pausada: 'Pausada',
  vendida: 'Vendida',
  rechazada: 'Rechazada',
}

const FORMATEADOR_PRECIO = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

/**
 * `precio` es anulable desde la Task 8: un borrador recien creado no tiene
 * precio todavia. `precio.toLocaleString()` sin este chequeo revienta en la
 * primera propiedad nueva.
 */
export function textoPrecio(precio: number | null): string {
  if (precio === null) return 'Sin precio'
  return FORMATEADOR_PRECIO.format(precio)
}

/**
 * Convierte las filas crudas de Supabase en lo que pinta el panel.
 *
 * A una propiedad YA publicada no se le calculan faltantes aunque
 * faltantesParaPublicar (Task 5) pudiera seguir señalando barrio o
 * descripcion: esos dos son solo guia del panel, no requisito real de
 * publicacion (los unicos que la base exige son foto y precio, ver el
 * comentario de faltaParaPublicar en acciones.ts), y mostrarlos aqui
 * confundiria al vendedor sobre algo que ya publico con exito.
 */
export function filasDelPanel(propiedades: readonly PropiedadCruda[]): FilaPanel[] {
  return propiedades.map((p) => {
    const numeroDeImagenes = p.imagenes_propiedad?.length ?? 0

    const faltantes = p.estado === 'publicada'
      ? []
      : faltantesParaPublicar({
        descripcion: p.descripcion,
        barrio_id: p.barrio_id,
        precio: p.precio,
        numeroDeImagenes,
      })

    return {
      id: p.id,
      titulo: p.titulo,
      estado: p.estado,
      estadoTexto: ESTADO_TEXTO[p.estado] ?? p.estado,
      precioTexto: textoPrecio(p.precio),
      faltantes,
    }
  })
}
