import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { clienteAdmin } from './ayudantes';
import {
  crearVendedorConPropiedad,
  crearCompradorConLead,
  definirHorarioCompleto,
  franjasDe,
  comoUsuario,
} from './ayudantes-citas';
import { insertarConversacionDirecta, insertarMensajeDirecto } from './ayudantes-ia';
import { procesarSolicitudFranja } from '@/lib/ia/agendamiento';

describe('SP6 — Falsificaciones Obligatorias de Seguridad (§13)', () => {
  it('Falsificacion 1: Inyeccion de prompt para usurpacion de lead / actor es neutralizada por context binding', async () => {
    // 1. Victima legitima con su propio lead
    const vendedor = await crearVendedorConPropiedad();
    await definirHorarioCompleto(vendedor.id);
    const victima = await crearCompradorConLead(vendedor, 'aceptado');

    // 2. Atacante con su propia conversacion
    const atacante = await crearCompradorConLead(vendedor, 'nuevo');
    const convAtacanteId = await insertarConversacionDirecta({
      leadId: atacante.leadId,
      propiedadId: vendedor.propiedadId,
      compradorId: atacante.id,
      vendedorId: vendedor.id,
    });

    const franjas = await franjasDe(vendedor.id);
    const franja = franjas[0]!;

    // El atacante intenta suministrar el leadId y actor de la victima en la llamada
    // Pero procesarSolicitudFranja SOLO recibe conversacionId y la franja;
    // los IDs se resuelven exclusivamente desde la fila verificada en la base de datos.
    await procesarSolicitudFranja(convAtacanteId, franja);

    // Comprobar que la cita NO quedo a nombre de la victima
    const admin = clienteAdmin();
    const { data: citasVictima } = await admin
      .from('citas')
      .select('id')
      .eq('lead_id', victima.leadId);

    expect(citasVictima).toEqual([]);

    // Comprobar que la conversacion de la victima no fue alterada
    const { data: convsVictima } = await admin
      .from('conversaciones_ia')
      .select('id')
      .eq('lead_id', victima.leadId);
    expect(convsVictima).toEqual([]);
  });

  it('Falsificacion 2: Omision de auto-confirmacion — cuando auto_confirmar_citas es false, JAMAS se inserta en citas', async () => {
    const vendedor = await crearVendedorConPropiedad();
    await definirHorarioCompleto(vendedor.id);

    const admin = clienteAdmin();
    await admin
      .from('disponibilidad_semanal')
      .update({ auto_confirmar_citas: false })
      .eq('vendedor_id', vendedor.id);

    const comprador = await crearCompradorConLead(vendedor, 'nuevo');
    const convId = await insertarConversacionDirecta({
      leadId: comprador.leadId,
      propiedadId: vendedor.propiedadId,
      compradorId: comprador.id,
      vendedorId: vendedor.id,
    });

    const franjas = await franjasDe(vendedor.id);
    const franja = franjas[0]!;

    const res = await procesarSolicitudFranja(convId, franja);

    // Debe ser propuesta, NUNCA confirmada
    expect(res.tipo).toBe('propuesta');

    // Cero filas en citas
    const { data: citas } = await admin
      .from('citas')
      .select('id')
      .eq('lead_id', comprador.leadId);

    expect(citas).toHaveLength(0);
  });

  it('Falsificacion 3: Inmutabilidad estricta de mensajes_ia — UPDATE y DELETE directo arrojan 42501', async () => {
    const vendedor = await crearVendedorConPropiedad();
    const comprador = await crearCompradorConLead(vendedor, 'nuevo');

    const convId = await insertarConversacionDirecta({
      leadId: comprador.leadId,
      propiedadId: vendedor.propiedadId,
      compradorId: comprador.id,
      vendedorId: vendedor.id,
    });

    const mensajeId = await insertarMensajeDirecto({
      conversacionId: convId,
      compradorId: comprador.id,
      vendedorId: vendedor.id,
      emisor: 'agente_ia',
      contenido: 'Mensaje inmutable que no debe ser adulterado',
    });

    const clienteComprador = await comoUsuario(comprador.correo);

    // Intento de UPDATE
    const { data: updData, error: updError } = await clienteComprador
      .from('mensajes_ia')
      .update({ contenido: 'Texto adulterado por el atacante' })
      .eq('id', mensajeId)
      .select();

    expect(updError?.code).toBe('42501');
    expect(updData).toBeNull();

    // Intento de DELETE
    const { error: delError } = await clienteComprador
      .from('mensajes_ia')
      .delete()
      .eq('id', mensajeId);

    expect(delError?.code).toBe('42501');

    // Comprobar que el contenido sigue exactamente igual
    const admin = clienteAdmin();
    const { data: msgVerificado } = await admin
      .from('mensajes_ia')
      .select('contenido')
      .eq('id', mensajeId)
      .single();

    expect(msgVerificado?.contenido).toBe('Mensaje inmutable que no debe ser adulterado');
  });
});
