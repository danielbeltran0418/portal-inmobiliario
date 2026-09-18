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
  const query: Record<string, unknown> = {
    select: () => query,
    eq: () => query,
    gt: () => query,
    gte: () => query,
    lte: () => query,
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: propiedades, error: null }),
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

    fromMock.mockImplementation((tabla: string) => {
      if (tabla === 'busquedas_guardadas') return tablaBusquedas([busquedaFila]);
      if (tabla === 'barrios') return tablaBarrios('barrio-riomar-id');
      if (tabla === 'propiedades') return tablaPropiedadesConstructor([propiedadFila]);
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
