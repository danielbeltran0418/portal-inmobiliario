import { z } from 'zod';

export type RolMensaje = 'system' | 'user' | 'assistant' | 'tool';

export interface LlamadaHerramienta {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface MensajeHistorial {
  rol: RolMensaje;
  contenido: string;
  nombre?: string;
  tool_call_id?: string;
  tool_calls?: LlamadaHerramienta[];
}

export interface TokensConsumidos {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface RespuestaInferencia {
  texto: string | null;
  tool_calls: LlamadaHerramienta[];
  tokens: TokensConsumidos;
  modeloUtilizado: string;
  proveedor: 'openai' | 'gemini';
}

export interface OpcionesInferencia {
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  geminiModel?: string;
}

export type CodigoErrorIA = 'IA001' | 'IA002' | 'IA003' | 'IA004' | 'IA005';

export class ErrorIA extends Error {
  readonly codigo: CodigoErrorIA;
  readonly detalle?: unknown;

  constructor(codigo: CodigoErrorIA, mensaje: string, detalle?: unknown) {
    super(`[${codigo}] ${mensaje}`);
    this.name = 'ErrorIA';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

// Schemas Zod para validar argumentos emitidos por el modelo
export const EsquemaConsultarDisponibilidad = z.object({
  dias: z.number().int().min(1).max(30).optional().default(14),
});
export type ArgumentosConsultarDisponibilidad = z.infer<typeof EsquemaConsultarDisponibilidad>;

export const EsquemaProponerCita = z.object({
  inicio_iso: z.string().min(1),
});
export type ArgumentosProponerCita = z.infer<typeof EsquemaProponerCita>;

export const EsquemaCalificarLead = z.object({
  decision: z.enum(['aceptado', 'descartado']),
  razon: z.string().min(3),
});
export type ArgumentosCalificarLead = z.infer<typeof EsquemaCalificarLead>;

export interface DefinicionHerramienta {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const HERRAMIENTAS_IA: DefinicionHerramienta[] = [
  {
    type: 'function',
    function: {
      name: 'consultar_disponibilidad',
      description: 'Consulta las franjas horarias libres del vendedor para visitas en los proximos dias.',
      parameters: {
        type: 'object',
        properties: {
          dias: {
            type: 'integer',
            description: 'Numero de dias a consultar a futuro (por defecto 14).',
            default: 14,
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proponer_cita',
      description: 'Propone o solicita una franja de visita seleccionada de las franjas disponibles. No incluye datos personales ni IDs, solo la fecha y hora de inicio.',
      parameters: {
        type: 'object',
        properties: {
          inicio_iso: {
            type: 'string',
            description: 'Fecha y hora de inicio en formato ISO 8601 (ej. 2026-09-20T10:00:00-05:00 o UTC).',
          },
        },
        required: ['inicio_iso'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calificar_lead',
      description: 'Determina si el lead cumple con criterios minimos de interes y solvencia (aceptado) o si es spam/descarte explicito (descartado).',
      parameters: {
        type: 'object',
        properties: {
          decision: {
            type: 'string',
            enum: ['aceptado', 'descartado'],
            description: 'Resultado de la calificacion.',
          },
          razon: {
            type: 'string',
            description: 'Justificacion concisa de la calificacion.',
          },
        },
        required: ['decision', 'razon'],
      },
    },
  },
];
