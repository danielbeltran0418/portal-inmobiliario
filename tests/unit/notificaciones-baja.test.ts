// tests/unit/notificaciones-baja.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { eqMock, updateMock, redirectMock } = vi.hoisted(() => {
  const eqMock = vi.fn().mockResolvedValue({ error: null, data: [{ id: 'busq-1' }] });
  return {
    eqMock,
    updateMock: vi.fn(() => ({ eq: eqMock })),
    redirectMock: vi.fn(),
  };
});

vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({ from: () => ({ update: updateMock }) }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import { darDeBajaBusqueda } from '@/app/notificaciones/baja/acciones';

// Generado en tiempo de ejecucion: un UUID literal en el codigo lo marca
// gitleaks como posible clave (regla generic-api-key).
const TOKEN_BAJA = crypto.randomUUID();

function formulario(token?: string): FormData {
  const datos = new FormData();
  if (token !== undefined) datos.set('token', token);
  return datos;
}

describe('Server action de baja de busquedas guardadas', () => {
  beforeEach(() => {
    updateMock.mockClear();
    eqMock.mockClear();
    redirectMock.mockClear();
  });

  it('desactiva notificaciones_activas por token y redirige a la confirmacion', async () => {
    await darDeBajaBusqueda(formulario(TOKEN_BAJA));

    expect(updateMock).toHaveBeenCalledWith({ notificaciones_activas: false });
    expect(eqMock).toHaveBeenCalledWith('token_baja', TOKEN_BAJA);
    expect(redirectMock).toHaveBeenCalledWith('/notificaciones/baja/confirmado');
  });

  it('no toca la base si falta el token, pero responde igual', async () => {
    await darDeBajaBusqueda(formulario());

    expect(updateMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith('/notificaciones/baja/confirmado');
  });

  it('no toca la base si el token no tiene forma de UUID, pero responde igual', async () => {
    await darDeBajaBusqueda(formulario('token-abc'));

    expect(updateMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith('/notificaciones/baja/confirmado');
  });
});
