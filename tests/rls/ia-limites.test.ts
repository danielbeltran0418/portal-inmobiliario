import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { clienteAdmin } from './ayudantes';
import {
  crearVendedorConPropiedad,
  crearCompradorConLead,
} from './ayudantes-citas';
import { insertarConversacionDirecta } from './ayudantes-ia';
import {
  verificarLimitesConversacion,
  ErrorLimiteAbuso,
} from '@/lib/ia/limites';

describe('SP6 — Límites de abuso en base de datos (RLS e integridad)', () => {
  it('1. un comprador con 3 leads activos en 24h es bloqueado de iniciar una cuarta conversacion', async () => {
    const vendedor = await crearVendedorConPropiedad();
    const comprador = await crearCompradorConLead(vendedor, 'nuevo');

    // Crear 3 conversaciones activas para el mismo comprador
    const conv1 = await insertarConversacionDirecta({
      leadId: comprador.leadId,
      propiedadId: vendedor.propiedadId,
      compradorId: comprador.id,
      vendedorId: vendedor.id,
    });
    const c2 = await crearCompradorConLead(vendedor, 'nuevo');
    await insertarConversacionDirecta({
      leadId: c2.leadId,
      propiedadId: vendedor.propiedadId,
      compradorId: comprador.id, // mismo comprador
      vendedorId: vendedor.id,
    });
    const c3 = await crearCompradorConLead(vendedor, 'nuevo');
    await insertarConversacionDirecta({
      leadId: c3.leadId,
      propiedadId: vendedor.propiedadId,
      compradorId: comprador.id, // mismo comprador
      vendedorId: vendedor.id,
    });

    // Verificar que la verificacion lanza IA_CONCURRENCIA
    try {
      await verificarLimitesConversacion(conv1, comprador.id);
      expect.fail('Debio bloquear por superar limite de concurrencia');
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorLimiteAbuso);
      expect((err as ErrorLimiteAbuso).codigo).toBe('IA_CONCURRENCIA');
      expect((err as ErrorLimiteAbuso).status).toBe(429);
    }
  });

  it('2. la conversacion cerrada no admite nuevos mensajes de IA', async () => {
    const vendedor = await crearVendedorConPropiedad();
    const comprador = await crearCompradorConLead(vendedor, 'nuevo');

    const convId = await insertarConversacionDirecta({
      leadId: comprador.leadId,
      propiedadId: vendedor.propiedadId,
      compradorId: comprador.id,
      vendedorId: vendedor.id,
      estadoConversacion: 'cerrada',
    });

    try {
      await verificarLimitesConversacion(convId, comprador.id);
      expect.fail('Debio fallar porque la conversacion esta cerrada');
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorLimiteAbuso);
      expect((err as ErrorLimiteAbuso).codigo).toBe('IA_TOPE_TURNOS');
    }
  });
});
