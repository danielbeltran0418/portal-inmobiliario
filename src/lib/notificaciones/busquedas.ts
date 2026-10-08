import 'server-only';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';
import { leerFiltros } from '@/lib/catalogo/filtros';
import { aplicarFiltros } from '@/lib/catalogo/consultas';

export interface FiltrosBusquedaGuardada {
  barrio: string;
  operacion?: 'venta' | 'arriendo';
  tipo?: string;
  precio_min?: number;
  precio_max?: number;
  q?: string;
}

export interface PropiedadCoincidente {
  id: string;
  slug: string;
  titulo: string;
  precio: number;
  moneda: string;
  barrioSlug: string;
  imagenId: string | null;
}

export interface BusquedaConCoincidencias {
  busquedaId: string;
  usuarioId: string;
  nombre: string;
  tokenBaja: string;
  propiedades: PropiedadCoincidente[];
}

interface FilaBusquedaGuardada {
  id: string;
  usuario_id: string;
  nombre: string;
  filtros: FiltrosBusquedaGuardada;
  ultima_notificacion_en: string;
  token_baja: string;
}

interface FilaPropiedadCoincidente {
  id: string;
  slug: string;
  titulo: string;
  precio: number;
  moneda: string;
  barrio: { slug: string } | null;
  imagenes_propiedad: { id: string; orden: number }[];
}

/** El jsonb guardado a la forma de la URL (texto), que es lo que valida leerFiltros. */
function comoParametros(filtros: Record<string, unknown>): Record<string, string | undefined> {
  const salida: Record<string, string | undefined> = {};
  for (const [clave, valor] of Object.entries(filtros)) {
    if (typeof valor === 'string' || typeof valor === 'number') salida[clave] = String(valor);
  }
  return salida;
}

const CONCURRENCIA = 8;

export async function obtenerBusquedasParaNotificar(): Promise<BusquedaConCoincidencias[]> {
  const admin = crearClienteAdmin();

  const { data: busquedas, error: errorBusquedas } = await admin
    .from('busquedas_guardadas')
    .select('id, usuario_id, nombre, filtros, ultima_notificacion_en, token_baja')
    .eq('notificaciones_activas', true)
    .limit(300);

  if (errorBusquedas) {
    console.error('[Notificaciones] Error al consultar busquedas guardadas:', errorBusquedas);
    throw new Error(`Fallo al consultar busquedas guardadas: ${errorBusquedas.message}`);
  }

  const filasBusqueda = ((busquedas ?? []) as FilaBusquedaGuardada[]).filter((f) => f.filtros?.barrio);

  // Un solo viaje para todos los barrios (antes, una consulta por busqueda).
  const slugs = [...new Set(filasBusqueda.map((f) => f.filtros.barrio))];
  const idPorSlug = new Map<string, string>();
  if (slugs.length > 0) {
    const { data: barrios, error: errorBarrios } = await admin.from('barrios').select('id, slug').in('slug', slugs);
    if (errorBarrios) console.error('[Notificaciones] Error al consultar barrios:', errorBarrios);
    for (const b of (barrios ?? []) as { id: string; slug: string }[]) idPorSlug.set(b.slug, b.id);
  }

  const procesar = async (fila: FilaBusquedaGuardada): Promise<BusquedaConCoincidencias | null> => {
    const filtros = fila.filtros;
    const barrioId = idPorSlug.get(filtros.barrio);
    if (!barrioId) return null;

    let consulta = admin
      .from('propiedades')
      .select('id, slug, titulo, precio, moneda, barrio:barrios(slug), imagenes_propiedad(id, orden)')
      .eq('estado', 'publicada')
      .eq('barrio_id', barrioId)
      .gt('creado_en', fila.ultima_notificacion_en);

    // Los mismos filtros que el catalogo, re-validados al leer: filas guardadas
    // antes de normalizarFiltrosGuardados (o editadas por UPDATE directo, que
    // la columna permite) pueden traer cualquier cosa, y el texto va dentro de
    // un or() de PostgREST.
    consulta = aplicarFiltros(consulta, leerFiltros(comoParametros(filtros as unknown as Record<string, unknown>)));

    const { data: propiedades, error: errorPropiedades } = await consulta;

    if (errorPropiedades) {
      console.error('[Notificaciones] Error al consultar propiedades:', errorPropiedades);
    }

    const filas = (propiedades ?? []) as unknown as FilaPropiedadCoincidente[];
    if (filas.length === 0) return null;

    return {
      busquedaId: fila.id,
      usuarioId: fila.usuario_id,
      nombre: fila.nombre,
      tokenBaja: fila.token_baja,
      propiedades: filas.map((p) => {
        const primeraFoto = [...p.imagenes_propiedad].sort((a, b) => a.orden - b.orden)[0];
        return {
          id: p.id,
          slug: p.slug,
          titulo: p.titulo,
          precio: p.precio,
          moneda: p.moneda,
          barrioSlug: p.barrio?.slug ?? filtros.barrio,
          imagenId: primeraFoto ? primeraFoto.id : null,
        };
      }),
    };
  };

  // Las consultas de propiedades van en paralelo, de CONCURRENCIA en
  // CONCURRENCIA: 300 en serie tardaban 300 viajes; todas a la vez saturarian
  // el pool de conexiones. El orden del resultado se conserva.
  const resultado: BusquedaConCoincidencias[] = [];
  for (let i = 0; i < filasBusqueda.length; i += CONCURRENCIA) {
    const lote = await Promise.all(filasBusqueda.slice(i, i + CONCURRENCIA).map(procesar));
    for (const r of lote) if (r) resultado.push(r);
  }

  return resultado;
}
