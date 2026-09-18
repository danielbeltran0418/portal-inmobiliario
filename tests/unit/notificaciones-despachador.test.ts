// tests/unit/notificaciones-despachador.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { obtenerBusquedasMock, enviarDigestMock, getUserByIdMock, updateMock, eqMock } = vi.hoisted(() => {
  const eqMock = vi.fn().mockResolvedValue({ error: null });
  return {
    obtenerBusquedasMock: vi.fn(),
    enviarDigestMock: vi.fn(),
    getUserByIdMock: vi.fn(),
    updateMock: vi.fn(() => ({ eq: eqMock })),
    eqMock,
  };
});

vi.mock('@/lib/notificaciones/busquedas', () => ({
  obtenerBusquedasParaNotificar: obtenerBusquedasMock,
}));

vi.mock('@/lib/notificaciones/resend', () => ({
  enviarDigestBusqueda: enviarDigestMock,
}));

vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({
    auth: { admin: { getUserById: getUserByIdMock } },
    from: () => ({ update: updateMock }),
  }),
}));

import { procesarNotificacionesBusquedas } from '@/lib/notificaciones/despachador';

const BUSQUEDA_BASE = {
  busquedaId: 'busq-1',
  usuarioId: 'user-1',
  nombre: 'Casas en Riomar',
  tokenBaja: 'token-1',
  propiedades: [{ id: 'p1', slug: 'casa-1', titulo: 'Casa 1', precio: 1, moneda: 'COP', barrioSlug: 'riomar', imagenId: null }],
};

describe('procesarNotificacionesBusquedas', () => {
  beforeEach(() => {
    obtenerBusquedasMock.mockReset();
    enviarDigestMock.mockReset();
    getUserByIdMock.mockReset();
    updateMock.mockClear();
    eqMock.mockClear();
    getUserByIdMock.mockResolvedValue({ data: { user: { email: 'comprador@prueba.test' } }, error: null });
  });

  it('envia el digest y actualiza ultima_notificacion_en cuando el envio es exitoso', async () => {
    obtenerBusquedasMock.mockResolvedValue([BUSQUEDA_BASE]);
    enviarDigestMock.mockResolvedValue(undefined);

    const resultado = await procesarNotificacionesBusquedas();

    expect(enviarDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ destinatarioEmail: 'comprador@prueba.test', nombreBusqueda: 'Casas en Riomar' })
    );
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ ultima_notificacion_en: expect.any(String) }));
    expect(eqMock).toHaveBeenCalledWith('id', 'busq-1');
    expect(resultado).toEqual({ procesadas: 1, enviadas: 1, fallidas: 0 });
  });

  it('no actualiza ultima_notificacion_en si el envio falla, y continua con las demas', async () => {
    const segundaBusqueda = { ...BUSQUEDA_BASE, busquedaId: 'busq-2', usuarioId: 'user-2' };
    obtenerBusquedasMock.mockResolvedValue([BUSQUEDA_BASE, segundaBusqueda]);
    enviarDigestMock.mockRejectedValueOnce(new Error('Resend caido')).mockResolvedValueOnce(undefined);

    const resultado = await procesarNotificacionesBusquedas();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(eqMock).toHaveBeenCalledWith('id', 'busq-2');
    expect(resultado).toEqual({ procesadas: 2, enviadas: 1, fallidas: 1 });
  });

  it('omite una busqueda si no se puede resolver el email del usuario', async () => {
    obtenerBusquedasMock.mockResolvedValue([BUSQUEDA_BASE]);
    getUserByIdMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await procesarNotificacionesBusquedas();

    expect(enviarDigestMock).not.toHaveBeenCalled();
    expect(resultado).toEqual({ procesadas: 1, enviadas: 0, fallidas: 1 });
  });

  it('procesa solo `limite` busquedas cuando hay mas coincidencias que el limite', async () => {
    const busquedas = [
      BUSQUEDA_BASE,
      { ...BUSQUEDA_BASE, busquedaId: 'busq-2', usuarioId: 'user-2' },
      { ...BUSQUEDA_BASE, busquedaId: 'busq-3', usuarioId: 'user-3' },
    ];
    obtenerBusquedasMock.mockResolvedValue(busquedas);
    enviarDigestMock.mockResolvedValue(undefined);

    const resultado = await procesarNotificacionesBusquedas(2);

    expect(enviarDigestMock).toHaveBeenCalledTimes(2);
    expect(resultado).toEqual({ procesadas: 2, enviadas: 2, fallidas: 0 });
  });

  it('registra un error distinguible por consola si falla el UPDATE de ultima_notificacion_en tras un envio exitoso', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    obtenerBusquedasMock.mockResolvedValue([BUSQUEDA_BASE]);
    enviarDigestMock.mockResolvedValue(undefined);
    eqMock.mockResolvedValueOnce({ error: new Error('fallo de red en update') });

    const resultado = await procesarNotificacionesBusquedas();

    expect(resultado).toEqual({ procesadas: 1, enviadas: 1, fallidas: 0 });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Fallo al actualizar ultima_notificacion_en'),
      'busq-1',
      expect.any(Error)
    );
    const mensajesLogueados = consoleErrorSpy.mock.calls.map((llamada) => llamada[0]);
    expect(mensajesLogueados).not.toContain('[Notificaciones] Fallo al procesar busqueda');

    consoleErrorSpy.mockRestore();
  });
});
