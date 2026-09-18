import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { procesarMock } = vi.hoisted(() => ({
  procesarMock: vi.fn().mockResolvedValue({ procesadas: 2, enviadas: 2, fallidas: 0 }),
}));

vi.mock('@/lib/notificaciones/despachador', () => ({
  procesarNotificacionesBusquedas: procesarMock,
}));

import { GET } from '@/app/api/cron/notificar-busquedas/route';
import { NextRequest } from 'next/server';

describe('Route Handler del cron diario de notificaciones de busquedas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'secreto-cron-test';
  });

  it('rechaza peticiones sin cabecera o con token incorrecto con 401', async () => {
    process.env.RESEND_API_KEY = 'clave-de-prueba';
    const reqSinToken = new NextRequest('http://localhost:3000/api/cron/notificar-busquedas');
    const resSin = await GET(reqSinToken);
    expect(resSin.status).toBe(401);

    const reqTokenInvalido = new NextRequest('http://localhost:3000/api/cron/notificar-busquedas', {
      headers: { authorization: 'Bearer token-falso' },
    });
    const resInv = await GET(reqTokenInvalido);
    expect(resInv.status).toBe(401);
  });

  it('ejecuta procesarNotificacionesBusquedas con token valido y retorna 200', async () => {
    process.env.RESEND_API_KEY = 'clave-de-prueba';
    const req = new NextRequest('http://localhost:3000/api/cron/notificar-busquedas', {
      headers: { authorization: 'Bearer secreto-cron-test' },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, procesadas: 2, enviadas: 2, fallidas: 0 });
    expect(procesarMock).toHaveBeenCalledTimes(1);
  });

  it('responde 500 sin procesar nada si RESEND_API_KEY no esta configurada', async () => {
    delete process.env.RESEND_API_KEY;
    const req = new NextRequest('http://localhost:3000/api/cron/notificar-busquedas', {
      headers: { authorization: 'Bearer secreto-cron-test' },
    });

    const res = await GET(req);
    expect(res.status).toBe(500);
    expect(procesarMock).not.toHaveBeenCalled();
  });
});
