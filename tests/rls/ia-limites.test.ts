import { describe, it, expect } from 'vitest';
import { clienteAdmin, clienteAnonimo } from './ayudantes';
import { crearVendedorConPropiedad, crearCompradorConLead } from './ayudantes-citas';
import { insertarConversacionDirecta, insertarMensajeDirecto } from './ayudantes-ia';

/**
 * Limites del chat con IA. Viven en la base (registrar_mensaje_comprador_ia,
 * migraciones 20261009000100 y 20261010000100): comprobar e insertar en la
 * misma transaccion, con la fila de la conversacion bloqueada (CN-013).
 */
const registrar = (conversacionId: string, compradorId: string, contenido = 'hola') =>
  clienteAdmin().rpc('registrar_mensaje_comprador_ia', {
    p_conversacion_id: conversacionId, p_comprador_id: compradorId, p_contenido: contenido,
  });

async function conversacion(estado?: 'activa' | 'cerrada') {
  const vendedor = await crearVendedorConPropiedad();
  const comprador = await crearCompradorConLead(vendedor, 'nuevo');
  const id = await insertarConversacionDirecta({
    leadId: comprador.leadId,
    propiedadId: vendedor.propiedadId,
    compradorId: comprador.id,
    vendedorId: vendedor.id,
    estadoConversacion: estado,
  });
  return { id, vendedor, comprador };
}

describe('SP6 — Límites de abuso del chat con IA (en la base)', () => {
  it('1. con 3 conversaciones activas en 24 h, las 3 siguen funcionando y la cuarta queda bloqueada', async () => {
    const vendedor = await crearVendedorConPropiedad();
    const comprador = await crearCompradorConLead(vendedor, 'nuevo');
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const lead = i === 0 ? comprador : await crearCompradorConLead(vendedor, 'nuevo');
      ids.push(await insertarConversacionDirecta({
        leadId: lead.leadId,
        propiedadId: vendedor.propiedadId,
        compradorId: comprador.id, // todas del mismo comprador
        vendedorId: vendedor.id,
      }));
    }

    for (const id of ids.slice(0, 3)) {
      expect((await registrar(id, comprador.id)).data).toBe('ok');
    }
    expect((await registrar(ids[3]!, comprador.id)).data).toBe('concurrencia');

    // Al cerrarse una de las tres primeras, la cuarta ya puede hablar.
    await clienteAdmin().from('conversaciones_ia').update({ estado_conversacion: 'cerrada' }).eq('id', ids[0]!);
    expect((await registrar(ids[3]!, comprador.id)).data).toBe('ok');
  });

  it('2. la conversacion cerrada no admite nuevos mensajes', async () => {
    const { id, comprador } = await conversacion('cerrada');
    expect((await registrar(id, comprador.id)).data).toBe('cerrada');
  });

  it('3. el turno 11 cierra la conversacion y deja la despedida del asistente', async () => {
    const { id, comprador, vendedor } = await conversacion();
    // Los 10 turnos previos son de hace una hora: fuera de la ventana de 1 minuto,
    // para que lo que dispare sea el tope de turnos y no el de frecuencia.
    const haceUnaHora = new Date(Date.now() - 3_600_000).toISOString();
    const { error } = await clienteAdmin().from('mensajes_ia').insert(Array.from({ length: 10 }, (_, i) => ({
      conversacion_id: id, comprador_id: comprador.id, vendedor_id: vendedor.id,
      emisor: 'comprador', contenido: `m${i}`, tokens_entrada: 0, tokens_salida: 0,
      modelo: 'usuario', creado_en: haceUnaHora,
    })));
    expect(error).toBeNull();

    expect((await registrar(id, comprador.id)).data).toBe('tope_turnos');
    const { data: conv } = await clienteAdmin().from('conversaciones_ia')
      .select('estado_conversacion').eq('id', id).single();
    expect(conv?.estado_conversacion).toBe('cerrada');
    const { data: ultimo } = await clienteAdmin().from('mensajes_ia').select('emisor, contenido')
      .eq('conversacion_id', id).order('creado_en', { ascending: false }).limit(1).single();
    expect(ultimo?.emisor).toBe('agente_ia');
    expect(ultimo?.contenido).toMatch(/transferido tu historial/);
  });

  it('4. superar 15000 tokens cierra la conversacion', async () => {
    const { id, comprador, vendedor } = await conversacion();
    await insertarMensajeDirecto({
      conversacionId: id, compradorId: comprador.id, vendedorId: vendedor.id,
      emisor: 'agente_ia', contenido: 'larga', tokensEntrada: 10000, tokensSalida: 5000,
    });
    expect((await registrar(id, comprador.id)).data).toBe('tope_tokens');
  });

  it('5. una rafaga simultanea no salta el tope de 5 mensajes por minuto', async () => {
    const { id, comprador } = await conversacion();
    const resultados = await Promise.all(Array.from({ length: 8 }, (_, i) => registrar(id, comprador.id, `hola ${i}`)));
    const codigos = resultados.map((r) => r.data);
    expect(codigos.filter((c) => c === 'ok')).toHaveLength(5);
    expect(codigos.filter((c) => c === 'rate_limit')).toHaveLength(3);
    const { count } = await clienteAdmin().from('mensajes_ia').select('*', { count: 'exact', head: true })
      .eq('conversacion_id', id).eq('emisor', 'comprador');
    expect(count).toBe(5);
  });

  it('6. no inserta en la conversacion de otro comprador', async () => {
    const { id, vendedor } = await conversacion();
    const intruso = await crearCompradorConLead(vendedor, 'nuevo');
    expect((await registrar(id, intruso.id)).data).toBe('no_encontrada');
  });

  it('7. anon no puede llamar a las funciones de limites', async () => {
    const cero = '00000000-0000-0000-0000-000000000000';
    const { error } = await clienteAnonimo().rpc('registrar_mensaje_comprador_ia', {
      p_conversacion_id: cero, p_comprador_id: cero, p_contenido: 'x',
    });
    expect(error).not.toBeNull();
    const { error: e2 } = await clienteAnonimo().rpc('conversacion_excede_concurrencia', { p_conversacion_id: cero });
    expect(e2).not.toBeNull();
  });
});
