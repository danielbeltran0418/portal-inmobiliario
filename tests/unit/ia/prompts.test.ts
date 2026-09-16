import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { construirSystemPrompt, formatearPrecioCOP, DatosFichaPropiedad } from '@/lib/ia/prompts';
import { ZONA_HORARIA } from '@/lib/fechas/formato';

describe('Generador de System Prompt Blindado con Ficha de Inmueble', () => {
  const fichaEjemplo: DatosFichaPropiedad = {
    titulo: 'Apartamento iluminado en Chapinero Alto',
    tipo_inmueble: 'apartamento',
    operacion: 'venta',
    precio: 450000000,
    barrio: 'Chapinero Alto',
    habitaciones: 3,
    banos: 2,
    area_m2: 85,
    descripcion: 'Hermoso apartamento con vista panorámica a los cerros orientales.',
  };

  it('1. incluye título, precio formateado en COP, barrio y habitaciones', () => {
    const prompt = construirSystemPrompt(fichaEjemplo);

    expect(prompt).toContain('Apartamento iluminado en Chapinero Alto');
    expect(prompt).toContain('Chapinero Alto');
    expect(prompt).toContain('3');
    expect(prompt).toContain('apartamento');
    expect(prompt).toContain('venta');
    expect(prompt).toContain(formatearPrecioCOP(450000000));
  });

  it('2. contiene cláusulas de seguridad contra alucinaciones y ocultamiento de dirección', () => {
    const prompt = construirSystemPrompt(fichaEjemplo);

    // Cláusula contra alucinaciones
    expect(prompt).toContain('BASE DE CONOCIMIENTO CERRADA');
    expect(prompt).toContain('no figura en la publicación oficial');
    expect(prompt).toContain('NUNCA inventes o supongas datos');

    // Cláusula de dirección
    expect(prompt).toContain('DIRECCIÓN EXACTA Y SEGURIDAD');
    expect(prompt).toContain('dos horas antes de la visita confirmada');
    expect(prompt).toContain('Bajo NINGUNA circunstancia reveles dirección exacta');
  });

  it('3. formatea la fecha de referencia en America/Bogota', () => {
    // 2026-09-15T15:00:00Z corresponde a las 10:00 AM en America/Bogota (UTC-5)
    const fechaUTC = new Date('2026-09-15T15:00:00.000Z');
    const prompt = construirSystemPrompt(fichaEjemplo, fechaUTC);

    expect(prompt).toContain(ZONA_HORARIA);
    expect(prompt).toContain('10:00');
    expect(prompt).toContain('septiembre');
  });
});
