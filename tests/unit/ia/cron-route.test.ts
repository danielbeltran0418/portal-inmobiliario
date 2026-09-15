import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { procesarLeadsNuevosMock } = vi.hoisted(() => ({
  procesarLeadsNuevosMock: vi.fn().mockResolvedValue(3),
}));

vi.mock('@/lib/ia/despachador', () => ({
  procesarLeadsNuevos: procesarLeadsNuevosMock,
}));

import { GET } from '@/app/api/cron/procesar-leads/route';
import { NextRequest } from 'next/server';

describe('Route Handler del cron diario de leads IA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'secreto-cron-test';
  });

  it('1. rechaza peticiones sin cabecera o con token incorrecto con 401', async () => {
    const reqSinToken = new NextRequest('http://localhost:3000/api/cron/procesar-leads');
    const resSin = await GET(reqSinToken);
    expect(resSin.status).toBe(401);

    const reqTokenInvalido = new NextRequest('http://localhost:3000/api/cron/procesar-leads', {
      headers: { authorization: 'Bearer token-falso' },
    });
    const resInv = await GET(reqTokenInvalido);
    expect(resInv.status).toBe(401);
  });

  it('2. ejecuta procesarLeadsNuevos con token valido y retorna 200 con procesados', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/procesar-leads', {
      headers: { authorization: 'Bearer secreto-cron-test' },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, procesados: 3 });
    expect(procesarLeadsNuevosMock).toHaveBeenCalledTimes(1);
  });
});
