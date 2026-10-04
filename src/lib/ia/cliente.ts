import 'server-only';
import {
  MensajeHistorial,
  DefinicionHerramienta,
  RespuestaInferencia,
  OpcionesInferencia,
  ErrorIA,
} from './tipos';

const MODELO_OPENAI_DEFAULT = 'gpt-5.6-luna';
const MODELO_GEMINI_DEFAULT = 'gemini-3.8-flash';
const TIMEOUT_MS_DEFAULT = 15000;

/**
 * Tope de tokens de cada respuesta. Sin el, lo unico que acota el gasto de
 * una llamada es la ventana de contexto del modelo. Es holgado a proposito:
 * en los modelos con razonamiento el tope incluye los tokens de razonamiento,
 * y uno demasiado bajo deja la respuesta vacia.
 */
const MAX_TOKENS_RESPUESTA_DEFAULT = 2048;

interface OpenAIMessage {
  role: string;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

function formatearMensajesOpenAI(mensajes: MensajeHistorial[]): OpenAIMessage[] {
  return mensajes.map((m) => {
    const res: OpenAIMessage = {
      role: m.rol,
      content: m.contenido,
    };
    if (m.nombre) res.name = m.nombre;
    if (m.tool_call_id) res.tool_call_id = m.tool_call_id;
    if (m.tool_calls && m.tool_calls.length > 0) res.tool_calls = m.tool_calls;
    return res;
  });
}

export async function ejecutarInferenciaIA(
  mensajes: MensajeHistorial[],
  herramientas: DefinicionHerramienta[] = [],
  opciones: OpcionesInferencia = {}
): Promise<RespuestaInferencia> {
  const apiKeyOpenAI = process.env.OPENAI_API_KEY;
  const apiKeyGemini = process.env.GEMINI_API_KEY;

  if (!apiKeyOpenAI && !apiKeyGemini) {
    throw new ErrorIA(
      'IA004',
      'No se ha configurado ninguna clave de API para los modelos de IA (OPENAI_API_KEY o GEMINI_API_KEY)'
    );
  }

  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS_DEFAULT;
  const maxTokens = opciones.maxTokens ?? MAX_TOKENS_RESPUESTA_DEFAULT;

  // 1. Intentar proveedor principal: OpenAI GPT-5.6 Luna
  if (apiKeyOpenAI) {
    try {
      return await llamarOpenAI(
        mensajes,
        herramientas,
        apiKeyOpenAI,
        opciones.model ?? MODELO_OPENAI_DEFAULT,
        timeoutMs,
        maxTokens
      );
    } catch (err: unknown) {
      if (apiKeyGemini) {
        console.warn(
          '[IA] Fallback de OpenAI a Gemini:',
          err instanceof Error ? err.message : String(err)
        );
        try {
          return await llamarGeminiOpenAICompat(
            mensajes,
            herramientas,
            apiKeyGemini,
            opciones.geminiModel ?? MODELO_GEMINI_DEFAULT,
            timeoutMs,
            maxTokens
          );
        } catch (geminiErr) {
          throw new ErrorIA(
            'IA004',
            `Fallo tanto proveedor principal como secundario: ${geminiErr instanceof Error ? geminiErr.message : String(geminiErr)}`
          );
        }
      }
      if (err instanceof ErrorIA) throw err;
      throw new ErrorIA(
        'IA004',
        `Falla en proveedor de inferencia OpenAI: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 2. Si no habia OpenAI, llamar directamente a Gemini
  if (apiKeyGemini) {
    try {
      return await llamarGeminiOpenAICompat(
        mensajes,
        herramientas,
        apiKeyGemini,
        opciones.geminiModel ?? MODELO_GEMINI_DEFAULT,
        timeoutMs,
        maxTokens
      );
    } catch (geminiErr) {
      if (geminiErr instanceof ErrorIA) throw geminiErr;
      throw new ErrorIA(
        'IA004',
        `Falla en proveedor de inferencia Gemini: ${geminiErr instanceof Error ? geminiErr.message : String(geminiErr)}`
      );
    }
  }

  throw new ErrorIA('IA004', 'Proveedor de IA no disponible');
}

async function llamarOpenAI(
  mensajes: MensajeHistorial[],
  herramientas: DefinicionHerramienta[],
  apiKey: string,
  model: string,
  timeoutMs: number,
  maxTokens: number
): Promise<RespuestaInferencia> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload: Record<string, unknown> = {
      model,
      messages: formatearMensajesOpenAI(mensajes),
      temperature: 0.2,
      // max_tokens esta obsoleto en OpenAI y los modelos GPT-5 lo rechazan.
      max_completion_tokens: maxTokens,
    };
    if (herramientas.length > 0) {
      payload.tools = herramientas;
      payload.tool_choice = 'auto';
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`OpenAI HTTP ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    return {
      texto: message?.content ?? null,
      tool_calls: (message?.tool_calls as RespuestaInferencia['tool_calls']) || [],
      tokens: {
        prompt_tokens: data.usage?.prompt_tokens ?? 0,
        completion_tokens: data.usage?.completion_tokens ?? 0,
        total_tokens: data.usage?.total_tokens ?? 0,
      },
      modeloUtilizado: model,
      proveedor: 'openai',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function llamarGeminiOpenAICompat(
  mensajes: MensajeHistorial[],
  herramientas: DefinicionHerramienta[],
  apiKey: string,
  model: string,
  timeoutMs: number,
  maxTokens: number
): Promise<RespuestaInferencia> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload: Record<string, unknown> = {
      model,
      messages: formatearMensajesOpenAI(mensajes),
      temperature: 0.2,
      // La capa compatible de Gemini documenta max_tokens.
      max_tokens: maxTokens,
    };
    if (herramientas.length > 0) {
      payload.tools = herramientas;
      payload.tool_choice = 'auto';
    }

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Gemini HTTP ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    return {
      texto: message?.content ?? null,
      tool_calls: (message?.tool_calls as RespuestaInferencia['tool_calls']) || [],
      tokens: {
        prompt_tokens: data.usage?.prompt_tokens ?? 0,
        completion_tokens: data.usage?.completion_tokens ?? 0,
        total_tokens: data.usage?.total_tokens ?? 0,
      },
      modeloUtilizado: model,
      proveedor: 'gemini',
    };
  } finally {
    clearTimeout(timer);
  }
}
