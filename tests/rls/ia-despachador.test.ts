import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, it, expect } from 'vitest';
import { clienteAdmin } from './ayudantes';
import { crearVendedorConPropiedad, crearCompradorConLead } from './ayudantes-citas';
import { procesarLeadIndividual, procesarLeadsNuevos } from '@/lib/ia/despachador';

describe('SP6 — Despachador de IA (RLS e Idempotencia)', () => {
  it('1. procesarLeadIndividual crea conversacion_ia, mensajes_ia y registra auditoria ia_lead_atendido', async () => {
    const vendedor = await crearVendedorConPropiedad();
    const comprador = await crearCompradorConLead(vendedor, 'nuevo');

    const resultado = await procesarLeadIndividual(comprador.leadId);
    expect(resultado).not.toBeNull();
    expect(resultado?.conversacionId).toBeDefined();

    const admin = clienteAdmin();

    // Comprobar fila en conversaciones_ia
    const { data: conv } = await admin
      .from('conversaciones_ia')
      .select('id, lead_id, estado_conversacion')
      .eq('id', resultado!.conversacionId)
      .single();
    expect(conv?.lead_id).toBe(comprador.leadId);
    expect(conv?.estado_conversacion).toBe('activa');

    // Comprobar mensajes en mensajes_ia (mensaje del comprador y mensaje de agente)
    const { data: mensajes } = await admin
      .from('mensajes_ia')
      .select('id, emisor, contenido')
      .eq('conversacion_id', resultado!.conversacionId)
      .order('creado_en', { ascending: true });

    expect(mensajes).toHaveLength(2);
    expect(mensajes![0].emisor).toBe('comprador');
    expect(mensajes![1].emisor).toBe('agente_ia');

    // Comprobar evento de auditoria ia_lead_atendido
    const { data: auditoria } = await admin
      .from('registro_auditoria')
      .select('id, accion, entidad, entidad_id')
      .eq('accion', 'ia_lead_atendido')
      .eq('entidad_id', resultado!.conversacionId);

    expect(auditoria).not.toBeNull();
    expect(auditoria!.length).toBeGreaterThan(0);
  });

  it('2. idempotencia: una segunda invocacion sobre el mismo leadId no duplica conversacion ni mensajes', async () => {
    const vendedor = await crearVendedorConPropiedad();
    const comprador = await crearCompradorConLead(vendedor, 'nuevo');

    const primerLlamado = await procesarLeadIndividual(comprador.leadId);
    expect(primerLlamado).not.toBeNull();

    const segundoLlamado = await procesarLeadIndividual(comprador.leadId);
    expect(segundoLlamado).toBeNull();

    const admin = clienteAdmin();
    const { data: convs } = await admin
      .from('conversaciones_ia')
      .select('id')
      .eq('lead_id', comprador.leadId);

    expect(convs).toHaveLength(1);
  });

  it('3. procesarLeadsNuevos barre leads huerfanos pendientes y los procesa', async () => {
    const vendedor = await crearVendedorConPropiedad();
    const c1 = await crearCompradorConLead(vendedor, 'nuevo');

    const procesados = await procesarLeadsNuevos(50);
    expect(procesados).toBeGreaterThanOrEqual(1);

    // Ahora c1 ya debe tener conversacion creada
    const admin = clienteAdmin();
    const { data: conv } = await admin
      .from('conversaciones_ia')
      .select('id')
      .eq('lead_id', c1.leadId)
      .single();

    expect(conv?.id).toBeDefined();
  });
});
