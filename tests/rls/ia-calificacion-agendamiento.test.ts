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
import { insertarConversacionDirecta } from './ayudantes-ia';
import { calificarLeadConversacion } from '@/lib/ia/calificacion';
import { procesarSolicitudFranja } from '@/lib/ia/agendamiento';
import { ErrorIA } from '@/lib/ia/tipos';

describe('SP6 — Calificación y Agendamiento Autónomo (RLS y Costuras)', () => {
  it('1. calificacion exitosa transiciona lead a aceptado y revela leads_contacto al vendedor por RLS', async () => {
    const vendedor = await crearVendedorConPropiedad();
    const comprador = await crearCompradorConLead(vendedor, 'nuevo');

    const admin = clienteAdmin();
    // Insertar contacto (tal como hace crear_lead() en produccion)
    await admin.from('leads_contacto').insert({
      lead_id: comprador.leadId,
      correo: comprador.correo,
      telefono: '3001234567',
    });

    const convId = await insertarConversacionDirecta({
      leadId: comprador.leadId,
      propiedadId: vendedor.propiedadId,
      compradorId: comprador.id,
      vendedorId: vendedor.id,
    });

    // Antes de calificar, el vendedor NO ve el contacto por RLS (SP4)
    const clienteVendedor = await comoUsuario(vendedor.correo);
    const { data: contactoAntes } = await clienteVendedor
      .from('leads_contacto')
      .select('telefono')
      .eq('lead_id', comprador.leadId);
    expect(contactoAntes ?? []).toEqual([]);

    // Calificar favorablemente
    const res = await calificarLeadConversacion(convId, 'aceptado', 'Comprador con crédito pre-aprobado');
    expect(res.ok).toBe(true);
    expect(res.decision).toBe('aceptado');

    // Ahora el lead está 'aceptado'
    const { data: leadActualizado } = await admin
      .from('leads')
      .select('estado')
      .eq('id', comprador.leadId)
      .single();
    expect(leadActualizado?.estado).toBe('aceptado');

    // Por RLS de SP4, al estar aceptado el vendedor SI puede leer leads_contacto
    const { data: contactoDespues } = await clienteVendedor
      .from('leads_contacto')
      .select('telefono')
      .eq('lead_id', comprador.leadId)
      .single();
    expect(contactoDespues?.telefono).toBe('3001234567');
  });

  it('2. vendedor con auto_confirmar_citas = true: franja valida reserva cita real en citas (confirmada)', async () => {
    const vendedor = await crearVendedorConPropiedad();
    await definirHorarioCompleto(vendedor.id);

    // Activar auto_confirmar_citas en disponibilidad_semanal
    const admin = clienteAdmin();
    await admin
      .from('disponibilidad_semanal')
      .update({ auto_confirmar_citas: true })
      .eq('vendedor_id', vendedor.id);

    const comprador = await crearCompradorConLead(vendedor, 'nuevo');
    const convId = await insertarConversacionDirecta({
      leadId: comprador.leadId,
      propiedadId: vendedor.propiedadId,
      compradorId: comprador.id,
      vendedorId: vendedor.id,
    });

    const franjas = await franjasDe(vendedor.id);
    expect(franjas.length).toBeGreaterThan(0);
    const franjaElegida = franjas[0]!;

    const res = await procesarSolicitudFranja(convId, franjaElegida);
    expect(res.tipo).toBe('confirmada');
    if (res.tipo === 'confirmada') {
      expect(res.citaId).toBeDefined();

      // Verificar que la cita existe de verdad en citas con estado confirmada
      const { data: cita } = await admin
        .from('citas')
        .select('id, lead_id, comprador_id, vendedor_id, estado')
        .eq('id', res.citaId)
        .single();
      expect(cita?.lead_id).toBe(comprador.leadId);
      expect(cita?.estado).toBe('confirmada');

      // Verificar que la conversacion quedo en cita_confirmada
      const { data: conv } = await admin
        .from('conversaciones_ia')
        .select('estado_conversacion, franja_propuesta')
        .eq('id', convId)
        .single();
      expect(conv?.estado_conversacion).toBe('cita_confirmada');
      expect(conv?.franja_propuesta).toBe(franjaElegida);
    }
  });

  it('3. vendedor con auto_confirmar_citas = false: cita queda en cita_propuesta y no se inserta en citas', async () => {
    const vendedor = await crearVendedorConPropiedad();
    await definirHorarioCompleto(vendedor.id);

    // Asegurar auto_confirmar_citas = false (por defecto)
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
    expect(franjas.length).toBeGreaterThan(0);
    const franjaElegida = franjas[0]!;

    const res = await procesarSolicitudFranja(convId, franjaElegida);
    expect(res.tipo).toBe('propuesta');
    expect(res.inicioIso).toBe(franjaElegida);

    // Comprobar que NO existe fila en citas
    const { data: citas } = await admin
      .from('citas')
      .select('id')
      .eq('lead_id', comprador.leadId);
    expect(citas).toEqual([]);

    // Comprobar que la conversacion quedo en cita_propuesta
    const { data: conv } = await admin
      .from('conversaciones_ia')
      .select('estado_conversacion, franja_propuesta')
      .eq('id', convId)
      .single();
    expect(conv?.estado_conversacion).toBe('cita_propuesta');
    expect(conv?.franja_propuesta).toBe(franjaElegida);
  });

  it('4. solicitud de franja ocupada o fuera de horario falla con IA002 sin tocar la base', async () => {
    const vendedor = await crearVendedorConPropiedad();
    await definirHorarioCompleto(vendedor.id);

    const comprador = await crearCompradorConLead(vendedor, 'nuevo');
    const convId = await insertarConversacionDirecta({
      leadId: comprador.leadId,
      propiedadId: vendedor.propiedadId,
      compradorId: comprador.id,
      vendedorId: vendedor.id,
    });

    // Franja inválida (minuto 37, no empieza en punto :00)
    const franjaInvalida = '2026-09-20T10:37:00-05:00';

    await expect(procesarSolicitudFranja(convId, franjaInvalida)).rejects.toThrow(ErrorIA);

    try {
      await procesarSolicitudFranja(convId, franjaInvalida);
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorIA);
      expect((err as ErrorIA).codigo).toBe('IA002');
    }

    // Comprobar que no se inserto nada en citas
    const admin = clienteAdmin();
    const { data: citas } = await admin
      .from('citas')
      .select('id')
      .eq('lead_id', comprador.leadId);
    expect(citas).toEqual([]);
  });
});
