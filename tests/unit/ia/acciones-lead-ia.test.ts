import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { redirectMock, procesarLeadIndividualMock, rpcMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((ruta: string) => {
    throw new Error(`NEXT_REDIRECT:${ruta}`);
  }),
  procesarLeadIndividualMock: vi.fn().mockResolvedValue({
    conversacionId: 'conv-123',
    respuestaAgente: 'Hola',
  }),
  rpcMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
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

describe('enviarLead lleva al comprador directo al chat con la IA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('al crearse el lead abre la conversacion y redirige al chat, sin esperar al vendedor', async () => {
    rpcMock.mockResolvedValue({
      data: '00000000-0000-0000-0000-000000000001',
      error: null,
    });

    const formData = new FormData();
    formData.set('propiedad_id', '11111111-1111-1111-1111-111111111111');
    formData.set('mensaje', 'Quisiera conocer el inmueble.');
    formData.set('telefono', '3001234567');

    await expect(enviarLead({}, formData)).rejects.toThrow(
      'NEXT_REDIRECT:/mi-cuenta/chat/00000000-0000-0000-0000-000000000001'
    );
    expect(procesarLeadIndividualMock).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001');
    // La conversacion ya existe cuando llega la redireccion: el chat no llega vacio.
    expect(procesarLeadIndividualMock.mock.invocationCallOrder[0]).toBeLessThan(
      redirectMock.mock.invocationCallOrder[0]
    );
  });

  it('si la IA falla, igual redirige al chat', async () => {
    rpcMock.mockResolvedValue({ data: 'lead-2', error: null });
    procesarLeadIndividualMock.mockRejectedValueOnce(new Error('IA caida'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const formData = new FormData();
    formData.set('propiedad_id', '11111111-1111-1111-1111-111111111111');
    formData.set('mensaje', 'Quisiera conocer el inmueble.');
    formData.set('telefono', '3001234567');

    await expect(enviarLead({}, formData)).rejects.toThrow('NEXT_REDIRECT:/mi-cuenta/chat/lead-2');
  });
});
