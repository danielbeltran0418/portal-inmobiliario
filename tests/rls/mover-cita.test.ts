import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin } from './ayudantes'
import {
  ahoraDeLaBase, cancelarComo, crearCompradorConLead, crearVendedorConPropiedad, escenarioConCita,
  escenarioReserva, franjasDe, inicioDeCita, insertarCitaDirecta, moverComo, reservarComo,
} from './ayudantes-citas'

const ms = (iso: string) => new Date(iso).getTime()

describe('mover_cita', () => {
  it('el comprador mueve su visita: la franja nueva se ocupa y la vieja se libera', async () => {
    const { vendedor, comprador, franjas, citaId } = await escenarioConCita()

    const mover = await moverComo(comprador.correo, citaId, franjas[2]!)
    expect(mover.error).toBeNull()
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[2]!))

    const libres = (await franjasDe(vendedor.id)).map(ms)
    expect(libres).toContain(ms(franjas[0]!))
    expect(libres).not.toContain(ms(franjas[2]!))
  })

  it('el vendedor tambien la mueve', async () => {
    const { vendedor, franjas, citaId } = await escenarioConCita()
    expect((await moverComo(vendedor.correo, citaId, franjas[3]!)).error).toBeNull()
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[3]!))
  })

  it('mover es atomico: a una franja ocupada falla con VS004 y la original sigue ocupada', async () => {
    const { vendedor, comprador, franjas, citaId } = await escenarioConCita()
    const rival = await crearCompradorConLead(vendedor, 'aceptado')
    expect((await reservarComo(rival.correo, rival.leadId, franjas[2]!)).error).toBeNull()

    const mover = await moverComo(comprador.correo, citaId, franjas[2]!)
    expect(mover.error?.code).toBe('VS004')

    // La original no se solto: sigue en su franja, confirmada, y no se ofrece.
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[0]!))
    const { data } = await clienteAdmin().from('citas').select('estado').eq('id', citaId).single()
    expect(data?.estado).toBe('confirmada')
    const libres = (await franjasDe(vendedor.id)).map(ms)
    expect(libres).not.toContain(ms(franjas[0]!))
    expect(libres).not.toContain(ms(franjas[2]!))
  })

  it('VS006: la visita no existe', async () => {
    const { comprador, franjas } = await escenarioConCita()
    expect((await moverComo(comprador.correo, randomUUID(), franjas[2]!)).error?.code).toBe('VS006')
  })

  it('VS002: ni un comprador ajeno ni un vendedor ajeno mueven una visita que no es suya', async () => {
    const { comprador, franjas, citaId } = await escenarioConCita()
    const otroVendedor = await crearVendedorConPropiedad()
    const compradorAjeno = await crearCompradorConLead(otroVendedor, 'aceptado')

    expect((await moverComo(compradorAjeno.correo, citaId, franjas[2]!)).error?.code).toBe('VS002')
    expect((await moverComo(otroVendedor.correo, citaId, franjas[2]!)).error?.code).toBe('VS002')
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[0]!))

    // Positivo: el comprador de la visita si la mueve a esa franja.
    expect((await moverComo(comprador.correo, citaId, franjas[2]!)).error).toBeNull()
  })

  it('VS007: una visita cancelada no se mueve', async () => {
    const { comprador, franjas, citaId } = await escenarioConCita()
    expect((await cancelarComo(comprador.correo, citaId)).error).toBeNull()
    expect((await moverComo(comprador.correo, citaId, franjas[2]!)).error?.code).toBe('VS007')
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[0]!))
  })

  it('VS008: una visita que ya empezo no se mueve', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()
    const ahora = await ahoraDeLaBase()
    const inicioEmpezada = new Date(ahora.getTime() - 30 * 60 * 1000)
    // Uso (a) de insertarCitaDirecta: reservar_cita no crea visitas empezadas.
    const citaId = await insertarCitaDirecta({
      leadId: comprador.leadId, propiedadId: vendedor.propiedadId, compradorId: comprador.id,
      vendedorId: vendedor.id, inicio: inicioEmpezada,
    })

    expect((await moverComo(comprador.correo, citaId, franjas[1]!)).error?.code).toBe('VS008')
    expect((await moverComo(vendedor.correo, citaId, franjas[1]!)).error?.code).toBe('VS008')
    expect(await inicioDeCita(citaId)).toBe(inicioEmpezada.getTime())
  })

  it('VS004: la nueva franja no es valida', async () => {
    const { comprador, franjas, citaId } = await escenarioConCita()
    const mediaHora = new Date(ms(franjas[1]!) + 30 * 60 * 1000).toISOString()
    expect((await moverComo(comprador.correo, citaId, mediaHora)).error?.code).toBe('VS004')
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[0]!))
  })

  it('registra cita_movida con el rango viejo y el nuevo', async () => {
    const { comprador, franjas, citaId } = await escenarioConCita()
    expect((await moverComo(comprador.correo, citaId, franjas[2]!)).error).toBeNull()

    const { data: evento, error } = await clienteAdmin().from('registro_auditoria')
      .select('actor_id,metadatos')
      .eq('entidad', 'cita').eq('entidad_id', citaId).eq('accion', 'cita_movida').single()
    expect(error).toBeNull()
    expect(evento?.actor_id).toBe(comprador.id)
    const metadatos = evento?.metadatos as {
      rango_anterior: { inicio: string; fin: string }
      rango_nuevo: { inicio: string; fin: string }
    }
    expect(ms(metadatos.rango_anterior.inicio)).toBe(ms(franjas[0]!))
    expect(ms(metadatos.rango_nuevo.inicio)).toBe(ms(franjas[2]!))
    expect(ms(metadatos.rango_nuevo.fin) - ms(metadatos.rango_nuevo.inicio)).toBe(60 * 60 * 1000)
  })
})
