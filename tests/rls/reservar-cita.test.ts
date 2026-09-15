import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteAnonimo } from './ayudantes'
import {
  HORA_MS, bloquearFecha, comoUsuario, crearCompradorConLead, crearVendedorConPropiedad,
  definirHorario, escenarioReserva, fechaDeBogota, franjasDe, inicioDeCita, reservarComo,
} from './ayudantes-citas'

const ms = (iso: string) => new Date(iso).getTime()

describe('reservar_cita', () => {
  it('reserva una franja libre, deriva propiedad, comprador y vendedor del lead, y la franja deja de ofrecerse', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()

    const { data: citaId, error } = await reservarComo(comprador.correo, comprador.leadId, franjas[0]!)
    expect(error).toBeNull()
    expect(citaId).toBeTruthy()

    const { data: cita } = await clienteAdmin().from('citas')
      .select('lead_id,propiedad_id,comprador_id,vendedor_id,estado,cancelada_por')
      .eq('id', citaId as string).single()
    expect(cita).toEqual({
      lead_id: comprador.leadId, propiedad_id: vendedor.propiedadId, comprador_id: comprador.id,
      vendedor_id: vendedor.id, estado: 'confirmada', cancelada_por: null,
    })
    expect(await inicioDeCita(citaId as string)).toBe(ms(franjas[0]!))

    const libres = (await franjasDe(vendedor.id)).map(ms)
    expect(libres).not.toContain(ms(franjas[0]!))
    expect(libres).toContain(ms(franjas[1]!))
  })

  it('sin sesion recibe 42501, y sin actor tambien', async () => {
    const { comprador, franjas } = await escenarioReserva()

    const anonimo = await clienteAnonimo().rpc('reservar_cita', { p_lead_id: comprador.leadId, p_inicio: franjas[0] })
    expect(anonimo.error?.code).toBe('42501')

    // service_role tiene EXECUTE sobre la variante corta, pero auth.uid() es
    // nulo: es exactamente el paso 1 de la funcion, "sin actor".
    const sinActor = await clienteAdmin().rpc('reservar_cita', { p_lead_id: comprador.leadId, p_inicio: franjas[0] })
    expect(sinActor.error?.code).toBe('42501')

    expect((await clienteAdmin().from('citas').select('id').eq('lead_id', comprador.leadId)).data).toEqual([])
  })

  it('VS001: el lead no existe', async () => {
    const { comprador, franjas } = await escenarioReserva()
    const intento = await reservarComo(comprador.correo, randomUUID(), franjas[0]!)
    expect(intento.error?.code).toBe('VS001')
  })

  it('VS002: ni un comprador ajeno ni el vendedor reservan sobre un lead que no es suyo', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()
    const otroVendedor = await crearVendedorConPropiedad()
    const ajeno = await crearCompradorConLead(otroVendedor, 'aceptado')

    expect((await reservarComo(ajeno.correo, comprador.leadId, franjas[0]!)).error?.code).toBe('VS002')
    expect((await reservarComo(vendedor.correo, comprador.leadId, franjas[0]!)).error?.code).toBe('VS002')
    expect((await clienteAdmin().from('citas').select('id').eq('lead_id', comprador.leadId)).data).toEqual([])

    // Positivo: el comprador del lead si reserva esa misma franja.
    expect((await reservarComo(comprador.correo, comprador.leadId, franjas[0]!)).error).toBeNull()
  })

  it('VS003: no se reserva sobre un lead nuevo ni descartado', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()
    const nuevo = await crearCompradorConLead(vendedor, 'nuevo')
    const descartado = await crearCompradorConLead(vendedor, 'descartado')

    expect((await reservarComo(nuevo.correo, nuevo.leadId, franjas[0]!)).error?.code).toBe('VS003')
    expect((await reservarComo(descartado.correo, descartado.leadId, franjas[0]!)).error?.code).toBe('VS003')

    // Positivo: un lead aceptado del mismo vendedor, misma franja.
    expect((await reservarComo(comprador.correo, comprador.leadId, franjas[0]!)).error).toBeNull()
  })

  it('VS004: franja fuera del horario, que no empieza en punto, fuera del horizonte o en fecha bloqueada', async () => {
    const vendedor = await crearVendedorConPropiedad()
    // Solo de 08:00 a 09:00 cada dia: todas las franjas validas son las 08:00 de Bogota.
    await definirHorario(
      vendedor.id,
      [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia_semana: dia, hora_inicio: '08:00', hora_fin: '09:00' })),
    )
    const comprador = await crearCompradorConLead(vendedor, 'aceptado')
    const franjas = await franjasDe(vendedor.id)
    const primera = ms(franjas[0]!)
    const ultima = ms(franjas[franjas.length - 1]!)

    await bloquearFecha(vendedor.id, fechaDeBogota(new Date(ms(franjas[3]!))))

    const invalidas = [
      new Date(primera + HORA_MS),             // 09:00: en punto y en horizonte, fuera del horario
      new Date(primera + 30 * 60 * 1000),      // 08:30: no empieza en punto
      new Date(primera - 24 * HORA_MS),        // 08:00 del dia anterior a la primera: antes de now() + 2 h
      new Date(ultima + 24 * HORA_MS),         // 08:00 del dia siguiente a la ultima: pasado now() + 14 dias
      new Date(ms(franjas[3]!)),               // en fecha bloqueada
    ]
    for (const inicio of invalidas) {
      const intento = await reservarComo(comprador.correo, comprador.leadId, inicio.toISOString())
      expect(intento.error?.code).toBe('VS004')
    }
    expect((await clienteAdmin().from('citas').select('id').eq('lead_id', comprador.leadId)).data).toEqual([])

    // Positivo: una franja ofrecida y no bloqueada entra.
    expect((await reservarComo(comprador.correo, comprador.leadId, franjas[1]!)).error).toBeNull()
  })

  it('VS005: un lead no tiene dos visitas confirmadas a la vez', async () => {
    const { comprador, franjas } = await escenarioReserva()

    const primera = await reservarComo(comprador.correo, comprador.leadId, franjas[0]!)
    expect(primera.error).toBeNull()

    const segunda = await reservarComo(comprador.correo, comprador.leadId, franjas[5]!)
    expect(segunda.error?.code).toBe('VS005')

    const { data } = await clienteAdmin().from('citas').select('id').eq('lead_id', comprador.leadId)
    expect(data).toEqual([{ id: primera.data }])
  })

  it('doble reserva simultanea de la misma franja: gana exactamente una y la otra recibe VS004', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()
    const rival = await crearCompradorConLead(vendedor, 'aceptado')
    // Las sesiones se abren ANTES, para que las dos llamadas salgan a la vez.
    const [clienteUno, clienteDos] = await Promise.all([comoUsuario(comprador.correo), comoUsuario(rival.correo)])
    const franja = franjas[0]!

    const resultados = await Promise.all([
      clienteUno.rpc('reservar_cita', { p_lead_id: comprador.leadId, p_inicio: franja }),
      clienteDos.rpc('reservar_cita', { p_lead_id: rival.leadId, p_inicio: franja }),
    ])

    const ganadoras = resultados.filter((r) => r.error === null)
    const perdedoras = resultados.filter((r) => r.error !== null)
    expect(ganadoras).toHaveLength(1)
    // VS004 y no 23P01: la funcion captura la exclusion y la traduce.
    expect(perdedoras.map((r) => r.error?.code)).toEqual(['VS004'])

    const { data } = await clienteAdmin().from('citas')
      .select('id').eq('vendedor_id', vendedor.id).eq('estado', 'confirmada')
    expect(data).toHaveLength(1)
  })

  it('registra cita_reservada en registro_auditoria', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()
    const { data: citaId, error } = await reservarComo(comprador.correo, comprador.leadId, franjas[0]!)
    expect(error).toBeNull()

    const { data: evento, error: errorEvento } = await clienteAdmin().from('registro_auditoria')
      .select('actor_id,accion,metadatos')
      .eq('entidad', 'cita').eq('entidad_id', citaId as string).single()
    expect(errorEvento).toBeNull()
    expect(evento?.accion).toBe('cita_reservada')
    expect(evento?.actor_id).toBe(comprador.id)
    expect(evento?.metadatos?.lead_id).toBe(comprador.leadId)
    expect(evento?.metadatos?.vendedor_id).toBe(vendedor.id)
    expect(ms(evento?.metadatos?.inicio as string)).toBe(ms(franjas[0]!))
  })
})
