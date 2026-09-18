// tests/unit/notificaciones-baja-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { eqMock, updateMock } = vi.hoisted(() => {
  const eqMock = vi.fn().mockResolvedValue({ error: null, data: [{ id: 'busq-1' }] });
  return { eqMock, updateMock: vi.fn(() => ({ eq: eqMock })) };
});

vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({ from: () => ({ update: updateMock }) }),
}));

import { GET } from '@/app/notificaciones/baja/route';
import { NextRequest } from 'next/server';

describe('Route Handler de baja de busquedas guardadas', () => {
  beforeEach(() => {
    updateMock.mockClear();
    eqMock.mockClear();
  });

  it('responde 400 si falta el parametro token', async () => {
    const req = new NextRequest('http://localhost:3000/notificaciones/baja');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('desactiva notificaciones_activas por token y redirige a la pagina de confirmacion', async () => {
    const req = new NextRequest('http://localhost:3000/notificaciones/baja?token=token-abc');
    const res = await GET(req);

    expect(updateMock).toHaveBeenCalledWith({ notificaciones_activas: false });
    expect(eqMock).toHaveBeenCalledWith('token_baja', 'token-abc');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/notificaciones/baja/confirmado');
  });
});
