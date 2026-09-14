import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin } from './ayudantes'
import {
  ahoraDeLaBase, cancelarComo, crearCompradorConLead, crearVendedorConPropiedad,
  escenarioConCita, escenarioReserva, franjasDe, insertarCitaDirecta, reservarComo,
} from './ayudantes-citas'

const ms = (iso: string) => new Date(iso).getTime()

async function estadoDe(citaId: string) {
  const { data } = await clienteAdmin().from('citas').select('estado,cancelada_por').eq('id', citaId).single()
  return data
}

describe('cancelar_cita', () => {
  it('el comprador cancela: queda cancelada por el, la franja se libera y el lead puede reservar otra vez', async () => {
    const { vendedor, comprador, franjas, citaId } = await escenarioConCita()

    const cancelar = await cancelarComo(comprador.correo, citaId)
    expect(cancelar.error).toBeNull()
    expect(await estadoDe(citaId)).toEqual({ estado: 'cancelada', cancelada_por: comprador.id })

    expect((await franjasDe(vendedor.id)).map(ms)).toContain(ms(franjas[0]!))
    expect((await reservarComo(comprador.correo, comprador.leadId, franjas[0]!)).error).toBeNull()
  })

  it('el vendedor tambien cancela', async () => {
    const { vendedor, citaId } = await escenarioConCita()
    expect((await cancelarComo(vendedor.correo, citaId)).error).toBeNull()
    expect(await estadoDe(citaId)).toEqual({ estado: 'cancelada', cancelada_por: vendedor.id })
  })

  it('VS006: la visita no existe', async () => {
    const { comprador } = await escenarioConCita()
    expect((await cancelarComo(comprador.correo, randomUUID())).error?.code).toBe('VS006')
  })

  it('VS002: ni un comprador ajeno ni un vendedor ajeno cancelan una visita que no es suya', async () => {
    const { comprador, citaId } = await escenarioConCita()
    const otroVendedor = await crearVendedorConPropiedad()
    const compradorAjeno = await crearCompradorConLead(otroVendedor, 'aceptado')

    expect((await cancelarComo(compradorAjeno.correo, citaId)).error?.code).toBe('VS002')
    expect((await cancelarComo(otroVendedor.correo, citaId)).error?.code).toBe('VS002')
    expect(await estadoDe(citaId)).toEqual({ estado: 'confirmada', cancelada_por: null })

    // Positivo: el comprador de la visita si la cancela.
    expect((await cancelarComo(comprador.correo, citaId)).error).toBeNull()
  })

  it('VS007: una visita ya cancelada no se vuelve a cancelar', async () => {
    const { comprador, vendedor, citaId } = await escenarioConCita()
    expect((await cancelarComo(comprador.correo, citaId)).error).toBeNull()
    expect((await cancelarComo(vendedor.correo, citaId)).error?.code).toBe('VS007')
    expect(await estadoDe(citaId)).toEqual({ estado: 'cancelada', cancelada_por: comprador.id })
  })

  it('VS008: una visita que ya empezo no se cancela', async () => {
    const { vendedor, comprador } = await escenarioReserva()
    const ahora = await ahoraDeLaBase()
    // Uso (a) de insertarCitaDirecta: reservar_cita no crea visitas empezadas.
    const citaId = await insertarCitaDirecta({
      leadId: comprador.leadId, propiedadId: vendedor.propiedadId, compradorId: comprador.id,
      vendedorId: vendedor.id, inicio: new Date(ahora.getTime() - 30 * 60 * 1000),
    })

    expect((await cancelarComo(comprador.correo, citaId)).error?.code).toBe('VS008')
    expect((await cancelarComo(vendedor.correo, citaId)).error?.code).toBe('VS008')
    expect(await estadoDe(citaId)).toEqual({ estado: 'confirmada', cancelada_por: null })
  })

  it('registra cita_cancelada en registro_auditoria', async () => {
    const { vendedor, comprador, franjas, citaId } = await escenarioConCita()
    expect((await cancelarComo(vendedor.correo, citaId)).error).toBeNull()

    const { data: evento, error } = await clienteAdmin().from('registro_auditoria')
      .select('actor_id,metadatos')
      .eq('entidad', 'cita').eq('entidad_id', citaId).eq('accion', 'cita_cancelada').single()
    expect(error).toBeNull()
    expect(evento?.actor_id).toBe(vendedor.id)
    expect(evento?.metadatos?.lead_id).toBe(comprador.leadId)
    expect(ms(evento?.metadatos?.inicio as string)).toBe(ms(franjas[0]!))
  })
})
