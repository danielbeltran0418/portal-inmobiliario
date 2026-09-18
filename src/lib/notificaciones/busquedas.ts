import 'server-only';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';

export interface FiltrosBusquedaGuardada {
  barrio: string;
  operacion?: 'venta' | 'arriendo';
  tipo?: string;
  precio_min?: number;
  precio_max?: number;
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

  const resultado: BusquedaConCoincidencias[] = [];

  for (const fila of (busquedas ?? []) as FilaBusquedaGuardada[]) {
    const filtros = fila.filtros;
    if (!filtros?.barrio) continue;

    const { data: barrio, error: errorBarrio } = await admin
      .from('barrios')
      .select('id')
      .eq('slug', filtros.barrio)
      .maybeSingle();

    if (errorBarrio) {
      console.error('[Notificaciones] Error al consultar barrio:', errorBarrio);
    }

    if (!barrio) continue;

    let consulta = admin
      .from('propiedades')
      .select('id, slug, titulo, precio, moneda, barrio:barrios(slug), imagenes_propiedad(id, orden)')
      .eq('estado', 'publicada')
      .eq('barrio_id', barrio.id)
      .gt('creado_en', fila.ultima_notificacion_en);

    if (filtros.operacion) consulta = consulta.eq('operacion', filtros.operacion);
    if (filtros.tipo) consulta = consulta.eq('tipo_inmueble', filtros.tipo);
    if (filtros.precio_min !== undefined) consulta = consulta.gte('precio', filtros.precio_min);
    if (filtros.precio_max !== undefined) consulta = consulta.lte('precio', filtros.precio_max);

    const { data: propiedades, error: errorPropiedades } = await consulta;

    if (errorPropiedades) {
      console.error('[Notificaciones] Error al consultar propiedades:', errorPropiedades);
    }

    const filas = (propiedades ?? []) as unknown as FilaPropiedadCoincidente[];
    if (filas.length === 0) continue;

    resultado.push({
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
    });
  }

  return resultado;
}
