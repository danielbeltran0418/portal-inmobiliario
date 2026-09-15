import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { ejecutarInferenciaIA } from '@/lib/ia/cliente';
import {
  HERRAMIENTAS_IA,
  ErrorIA,
  EsquemaConsultarDisponibilidad,
  EsquemaProponerCita,
  EsquemaCalificarLead,
} from '@/lib/ia/tipos';

describe('Cliente de inferencia IA', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...envOriginal };
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it('1. ejecuta inferencia con respuesta de texto plano normal via OpenAI', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai';
    delete process.env.GEMINI_API_KEY;

    const mockRespuesta = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Hola, con gusto te brindo informacion sobre el inmueble.',
          },
        },
      ],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 25,
        total_tokens: 145,
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRespuesta,
    });
    vi.stubGlobal('fetch', fetchMock);

    const respuesta = await ejecutarInferenciaIA(
      [
        { rol: 'system', contenido: 'Eres un agente inmobiliario.' },
        { rol: 'user', contenido: 'Tiene garaje?' },
      ],
      HERRAMIENTAS_IA
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(respuesta.proveedor).toBe('openai');
    expect(respuesta.modeloUtilizado).toBe('gpt-5.6-luna');
    expect(respuesta.texto).toBe('Hola, con gusto te brindo informacion sobre el inmueble.');
    expect(respuesta.tool_calls).toEqual([]);
    expect(respuesta.tokens.total_tokens).toBe(145);
  });

  it('2. ejecuta inferencia con emision de Function Calling estructurado y validado', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai';

    const mockRespuesta = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'consultar_disponibilidad',
                  arguments: JSON.stringify({ dias: 7 }),
                },
              },
            ],
          },
        },
      ],
      usage: {
        prompt_tokens: 150,
        completion_tokens: 20,
        total_tokens: 170,
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockRespuesta,
      })
    );

    const respuesta = await ejecutarInferenciaIA(
      [
        { rol: 'system', contenido: 'Eres un agente inmobiliario.' },
        { rol: 'user', contenido: 'Quisiera ver el apartamento esta semana.' },
      ],
      HERRAMIENTAS_IA
    );

    expect(respuesta.tool_calls).toHaveLength(1);
    const toolCall = respuesta.tool_calls[0];
    expect(toolCall.function.name).toBe('consultar_disponibilidad');

    const args = JSON.parse(toolCall.function.arguments);
    const validado = EsquemaConsultarDisponibilidad.safeParse(args);
    expect(validado.success).toBe(true);
    if (validado.success) {
      expect(validado.data.dias).toBe(7);
    }
  });

  it('3. realiza fallback transparente a Gemini si OpenAI arroja 500 o error de red', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai';
    process.env.GEMINI_API_KEY = 'sk-test-gemini';

    const mockRespuestaGemini = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Respuesta generada por el modelo de respaldo Gemini 3.8 Flash.',
          },
        },
      ],
      usage: {
        prompt_tokens: 95,
        completion_tokens: 18,
        total_tokens: 113,
      },
    };

    const fetchMock = vi
      .fn()
      // Primer intento a OpenAI falla con 500 Internal Server Error
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error en OpenAI',
      })
      // Segundo intento a Gemini OpenAPI compat tiene exito
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockRespuestaGemini,
      });

    vi.stubGlobal('fetch', fetchMock);

    const respuesta = await ejecutarInferenciaIA(
      [{ rol: 'user', contenido: 'Hola, hay disponibilidad manana?' }],
      HERRAMIENTAS_IA
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    );
    expect(respuesta.proveedor).toBe('gemini');
    expect(respuesta.modeloUtilizado).toBe('gemini-3.8-flash');
    expect(respuesta.texto).toBe('Respuesta generada por el modelo de respaldo Gemini 3.8 Flash.');
  });

  it('4. maneja de forma segura la ausencia de API keys con error controlado IA004', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    await expect(
      ejecutarInferenciaIA([{ rol: 'user', contenido: 'Hola' }])
    ).rejects.toThrow(ErrorIA);

    try {
      await ejecutarInferenciaIA([{ rol: 'user', contenido: 'Hola' }]);
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorIA);
      expect((err as ErrorIA).codigo).toBe('IA004');
    }
  });
});
