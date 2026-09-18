import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({ from: fromMock }),
}));

function tablaBusquedas(filas: unknown[]) {
  return {
    select: () => ({
      eq: () => Promise.resolve({ data: filas, error: null }),
    }),
  };
}

function tablaBarrios(id: string | null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: id ? { id } : null, error: null }),
      }),
    }),
  };
}

function tablaPropiedadesConstructor(propiedades: unknown[]) {
  const filterCalls: Array<{ method: string; column: string; value: unknown }> = [];

  const query: Record<string, unknown> = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filterCalls.push({ method: 'eq', column, value });
      return query;
    },
    gt: (column: string, value: unknown) => {
      filterCalls.push({ method: 'gt', column, value });
      return query;
    },
    gte: (column: string, value: unknown) => {
      filterCalls.push({ method: 'gte', column, value });
      return query;
    },
    lte: (column: string, value: unknown) => {
      filterCalls.push({ method: 'lte', column, value });
      return query;
    },
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: propiedades, error: null }),
    _getFilterCalls: () => filterCalls,
  };
  return query;
}

import { obtenerBusquedasParaNotificar } from '@/lib/notificaciones/busquedas';

describe('obtenerBusquedasParaNotificar', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('devuelve una busqueda con sus propiedades coincidentes cuando hay resultados', async () => {
    const busquedaFila = {
      id: 'busq-1',
      usuario_id: 'user-1',
      nombre: 'Casas en Riomar',
      filtros: { barrio: 'riomar', operacion: 'venta' },
      ultima_notificacion_en: '2026-09-01T00:00:00Z',
      token_baja: 'token-1',
    };
    const propiedadFila = {
      id: 'prop-1',
      slug: 'casa-riomar',
      titulo: 'Casa en Riomar',
      precio: 500000000,
      moneda: 'COP',
      barrio: { slug: 'riomar' },
      imagenes_propiedad: [{ id: 'img-1', orden: 0 }],
    };

    let propiedadesQuery: unknown;

    fromMock.mockImplementation((tabla: string) => {
      if (tabla === 'busquedas_guardadas') return tablaBusquedas([busquedaFila]);
      if (tabla === 'barrios') return tablaBarrios('barrio-riomar-id');
      if (tabla === 'propiedades') {
        propiedadesQuery = tablaPropiedadesConstructor([propiedadFila]);
        return propiedadesQuery;
      }
      throw new Error(`tabla no mockeada: ${tabla}`);
    });

    const resultado = await obtenerBusquedasParaNotificar();

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      busquedaId: 'busq-1',
      usuarioId: 'user-1',
      nombre: 'Casas en Riomar',
      tokenBaja: 'token-1',
    });
    expect(resultado[0].propiedades).toEqual([
      {
        id: 'prop-1',
        slug: 'casa-riomar',
        titulo: 'Casa en Riomar',
        precio: 500000000,
        moneda: 'COP',
        barrioSlug: 'riomar',
        imagenId: 'img-1',
      },
    ]);

    // Assert filter calls to Supabase
    const filterCalls = (propiedadesQuery as Record<string, unknown>)._getFilterCalls?.() as unknown[];
    expect(filterCalls).toBeDefined();
    expect(filterCalls).toContainEqual({ method: 'eq', column: 'estado', value: 'publicada' });
    expect(filterCalls).toContainEqual({ method: 'eq', column: 'barrio_id', value: 'barrio-riomar-id' });
    expect(filterCalls).toContainEqual({ method: 'gt', column: 'creado_en', value: '2026-09-01T00:00:00Z' });
    expect(filterCalls).toContainEqual({ method: 'eq', column: 'operacion', value: 'venta' });

    // Verify precio filters were NOT called (precio_min/max not in filtros)
    const precioFilterCalls = filterCalls.filter(
      (call: Record<string, unknown>) => call.column === 'precio'
    );
    expect(precioFilterCalls).toHaveLength(0);
  });

  it('omite una busqueda sin coincidencias nuevas', async () => {
    const busquedaFila = {
      id: 'busq-2',
      usuario_id: 'user-2',
      nombre: 'Apartamentos en Riomar',
      filtros: { barrio: 'riomar' },
      ultima_notificacion_en: '2026-09-01T00:00:00Z',
      token_baja: 'token-2',
    };

    fromMock.mockImplementation((tabla: string) => {
      if (tabla === 'busquedas_guardadas') return tablaBusquedas([busquedaFila]);
      if (tabla === 'barrios') return tablaBarrios('barrio-riomar-id');
      if (tabla === 'propiedades') return tablaPropiedadesConstructor([]);
      throw new Error(`tabla no mockeada: ${tabla}`);
    });

    const resultado = await obtenerBusquedasParaNotificar();

    expect(resultado).toHaveLength(0);
  });

  it('omite una busqueda cuyo barrio en filtros ya no existe', async () => {
    const busquedaFila = {
      id: 'busq-3',
      usuario_id: 'user-3',
      nombre: 'Busqueda con barrio eliminado',
      filtros: { barrio: 'barrio-que-no-existe' },
      ultima_notificacion_en: '2026-09-01T00:00:00Z',
      token_baja: 'token-3',
    };

    fromMock.mockImplementation((tabla: string) => {
      if (tabla === 'busquedas_guardadas') return tablaBusquedas([busquedaFila]);
      if (tabla === 'barrios') return tablaBarrios(null);
      throw new Error(`no deberia consultar propiedades sin barrio resuelto`);
    });

    const resultado = await obtenerBusquedasParaNotificar();

    expect(resultado).toHaveLength(0);
  });
});
