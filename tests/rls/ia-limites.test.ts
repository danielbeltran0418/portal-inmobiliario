import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { clienteAdmin, clienteAnonimo } from './ayudantes';
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

  // CN-013: comprobar e insertar en una sola transaccion con la fila de la
  // conversacion bloqueada. Antes, N envios simultaneos leian el mismo conteo
  // y pasaban todos.
  it('3. una rafaga simultanea no salta el tope de 5 mensajes por minuto', async () => {
    const vendedor = await crearVendedorConPropiedad();
    const comprador = await crearCompradorConLead(vendedor, 'nuevo');
    const convId = await insertarConversacionDirecta({
      leadId: comprador.leadId,
      propiedadId: vendedor.propiedadId,
      compradorId: comprador.id,
      vendedorId: vendedor.id,
    });

    const admin = clienteAdmin();
    const resultados = await Promise.all(
      Array.from({ length: 8 }, (_, i) => admin.rpc('registrar_mensaje_comprador_ia', {
        p_conversacion_id: convId, p_comprador_id: comprador.id, p_contenido: `hola ${i}`,
      })),
    );
    const codigos = resultados.map((r) => r.data);
    expect(codigos.filter((c) => c === 'ok')).toHaveLength(5);
    expect(codigos.filter((c) => c === 'rate_limit')).toHaveLength(3);

    const { count } = await admin.from('mensajes_ia').select('*', { count: 'exact', head: true })
      .eq('conversacion_id', convId).eq('emisor', 'comprador');
    expect(count).toBe(5);
  });

  it('4. no inserta en la conversacion de otro comprador', async () => {
    const vendedor = await crearVendedorConPropiedad();
    const comprador = await crearCompradorConLead(vendedor, 'nuevo');
    const intruso = await crearCompradorConLead(vendedor, 'nuevo');
    const convId = await insertarConversacionDirecta({
      leadId: comprador.leadId,
      propiedadId: vendedor.propiedadId,
      compradorId: comprador.id,
      vendedorId: vendedor.id,
    });
    const { data } = await clienteAdmin().rpc('registrar_mensaje_comprador_ia', {
      p_conversacion_id: convId, p_comprador_id: intruso.id, p_contenido: 'hola',
    });
    expect(data).toBe('no_encontrada');
  });

  it('5. anon no puede llamar a la funcion', async () => {
    const { error } = await clienteAnonimo().rpc('registrar_mensaje_comprador_ia', {
      p_conversacion_id: '00000000-0000-0000-0000-000000000000',
      p_comprador_id: '00000000-0000-0000-0000-000000000000',
      p_contenido: 'x',
    });
    expect(error).not.toBeNull();
  });
});
