import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { afterMock, procesarLeadIndividualMock, rpcMock } = vi.hoisted(() => ({
  afterMock: vi.fn((cb: () => void | Promise<void>) => cb()),
  procesarLeadIndividualMock: vi.fn().mockResolvedValue({
    conversacionId: 'conv-123',
    respuestaAgente: 'Hola',
  }),
  rpcMock: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: afterMock,
}));

vi.mock('@/lib/ia/despachador', () => ({
  procesarLeadIndividual: procesarLeadIndividualMock,
}));

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: vi.fn().mockResolvedValue({
    rpc: rpcMock,
  }),
}));

import { enviarLead } from '@/app/[barrio]/[slug]/acciones';

describe('enviarLead con despacho asincrono de IA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('al crearse el lead exitosamente, invoca after() y retorna { enviado: true }', async () => {
    rpcMock.mockResolvedValue({
      data: '00000000-0000-0000-0000-000000000001',
      error: null,
    });

    const formData = new FormData();
    formData.set('propiedad_id', '11111111-1111-1111-1111-111111111111');
    formData.set('mensaje', 'Quisiera conocer el inmueble.');
    formData.set('telefono', '3001234567');

    const res = await enviarLead({}, formData);

    expect(res).toEqual({ enviado: true });
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(procesarLeadIndividualMock).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001');
  });
});
