import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const fromMock = vi.fn();
vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({
    from: fromMock,
  }),
}));

import {
  verificarLimitesConversacion,
  ErrorLimiteAbuso,
  MENSAJE_DESPEDIDA_TOPE_TURNOS,
} from '@/lib/ia/limites';

describe('Módulo de límites de abuso y control de costos (unitario)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. turno 10 corta la conversacion y emite mensaje de despedida / derivacion a humano', async () => {
    // Simular 10 mensajes previos del comprador
    const diezMensajes = Array.from({ length: 10 }, () => ({
      emisor: 'comprador',
      tokens_entrada: 100,
      tokens_salida: 50,
    }));

    fromMock.mockImplementation((tabla: string) => {
      if (tabla === 'conversaciones_ia') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  estado_conversacion: 'activa',
                  comprador_id: 'comp-1',
                  vendedor_id: 'vend-1',
                },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (tabla === 'mensajes_ia') {
        return {
          select: () => ({
            eq: async () => ({
              data: diezMensajes,
              error: null,
            }),
          }),
          insert: async () => ({ error: null }),
        };
      }
      return {};
    });

    try {
      await verificarLimitesConversacion('conv-1', 'comp-1');
      expect.fail('Debio arrojar ErrorLimiteAbuso');
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorLimiteAbuso);
      const e = err as ErrorLimiteAbuso;
      expect(e.codigo).toBe('IA_TOPE_TURNOS');
      expect(e.message).toContain(MENSAJE_DESPEDIDA_TOPE_TURNOS);
    }
  });

  it('2. exceso de 5 mensajes por minuto retorna 429 con Retry-After', async () => {
    fromMock.mockImplementation((tabla: string) => {
      if (tabla === 'conversaciones_ia') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { estado_conversacion: 'activa' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (tabla === 'mensajes_ia') {
        return {
          select: (campos: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.count === 'exact') {
              return {
                eq: () => ({
                  eq: () => ({
                    gte: async () => ({ count: 5, error: null }),
                  }),
                }),
              };
            }
            return {
              eq: async () => ({
                data: [{ emisor: 'comprador', tokens_entrada: 50, tokens_salida: 20 }],
                error: null,
              }),
            };
          },
        };
      }
      return {};
    });

    try {
      await verificarLimitesConversacion('conv-1', 'comp-1');
      expect.fail('Debio arrojar rate limit 429');
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorLimiteAbuso);
      const e = err as ErrorLimiteAbuso;
      expect(e.codigo).toBe('IA_RATE_LIMIT');
      expect(e.status).toBe(429);
      expect(e.retryAfter).toBe(60);
    }
  });

  it('3. exceso de 15,000 tokens acumulados aborta la inferencia con IA_TOPE_TOKENS', async () => {
    fromMock.mockImplementation((tabla: string) => {
      if (tabla === 'conversaciones_ia') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { estado_conversacion: 'activa' },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (tabla === 'mensajes_ia') {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                { emisor: 'comprador', tokens_entrada: 8000, tokens_salida: 0 },
                { emisor: 'agente_ia', tokens_entrada: 0, tokens_salida: 7500 },
              ],
              error: null,
            }),
          }),
        };
      }
      return {};
    });

    try {
      await verificarLimitesConversacion('conv-1', 'comp-1');
      expect.fail('Debio arrojar IA_TOPE_TOKENS');
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorLimiteAbuso);
      const e = err as ErrorLimiteAbuso;
      expect(e.codigo).toBe('IA_TOPE_TOKENS');
      expect(e.message).toContain('Presupuesto');
    }
  });
});
