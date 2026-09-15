import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin } from './ayudantes'
import {
  HORA_MS, ahoraDeLaBase, comoUsuario, crearCompradorConLead, crearVendedorConPropiedad,
  definirHorarioCompleto, escenarioConCita, escenarioReserva, franjasDe, insertarCitaDirecta, reservarComo,
} from './ayudantes-citas'
import {
  listarCitasDelVendedor, listarSolicitudesDelComprador, obtenerCitaDeParticipante,
  obtenerFranjasLibres, obtenerLeadParaReservar,
} from '@/lib/citas/consultas'

const ms = (iso: string) => new Date(iso).getTime()

/**
 * Un usuario con rol vendedor que ADEMAS es comprador de otra propiedad. Es el
 * caso en que las politicas permisivas combinadas con OR (leads y citas tienen
 * la del comprador y la del vendedor) devuelven filas de los dos papeles: solo
 * el filtro explicito de la consulta separa uno del otro.
 */
async function vendedorQueTambienCompra() {
  const usuario = await crearVendedorConPropiedad()
  await definirHorarioCompleto(usuario.id)
  const otroVendedor = await crearVendedorConPropiedad()
  await definirHorarioCompleto(otroVendedor.id)

  // Como vendedor: un comprador con lead aceptado sobre SU propiedad.
  const suComprador = await crearCompradorConLead(usuario, 'aceptado')

  // Como comprador: un lead aceptado sobre la propiedad de otro vendedor.
  const { data: leadPropio, error } = await clienteAdmin().from('leads').insert({
    propiedad_id: otroVendedor.propiedadId, comprador_id: usuario.id, vendedor_id: otroVendedor.id,
    nombre_mostrado: 'Vendedor que compra', mensaje: 'Mensaje de prueba para citas, largo.', estado: 'aceptado',
  }).select('id').single()
  if (error) throw error

  return { usuario, otroVendedor, suComprador, leadPropioId: leadPropio.id as string }
}

describe('consultas de citas con filtro explicito', () => {
  it('listarSolicitudesDelComprador trae solo las solicitudes donde el usuario es el comprador', async () => {
    const { usuario, leadPropioId } = await vendedorQueTambienCompra()
    const cliente = await comoUsuario(usuario.correo)

    const solicitudes = await listarSolicitudesDelComprador(cliente, usuario.id)

    expect(solicitudes.map((s) => s.id)).toEqual([leadPropioId])
    expect(solicitudes[0]!.estado).toBe('aceptado')
    expect(solicitudes[0]!.visita).toBeNull()
  })

  it('listarCitasDelVendedor trae solo las visitas donde el usuario es el vendedor', async () => {
    const { usuario, otroVendedor, suComprador, leadPropioId } = await vendedorQueTambienCompra()

    const franjasSuyas = await franjasDe(usuario.id)
    const comoVendedor = await reservarComo(suComprador.correo, suComprador.leadId, franjasSuyas[0]!)
    expect(comoVendedor.error).toBeNull()

    const franjasDelOtro = await franjasDe(otroVendedor.id)
    const comoComprador = await reservarComo(usuario.correo, leadPropioId, franjasDelOtro[0]!)
    expect(comoComprador.error).toBeNull()

    const citas = await listarCitasDelVendedor(await comoUsuario(usuario.correo), usuario.id)

    expect(citas.map((c) => c.id)).toEqual([comoVendedor.data])
    expect(citas[0]!.estado).toBe('confirmada')
    expect(citas[0]!.nombreComprador).toBe('Comprador de prueba')
    expect(ms(citas[0]!.inicio)).toBe(ms(franjasSuyas[0]!))
    expect(ms(citas[0]!.fin) - ms(citas[0]!.inicio)).toBe(HORA_MS)
  })

  it('la solicitud trae su visita con inicio y fin, y la direccion solo dentro de la ventana', async () => {
    // Fuera de la ventana: visita reservada por la funcion, a mas de 2 horas.
    const lejos = await escenarioConCita()
    const direccionLejos = `Calle lejana ${randomUUID()}`
    await clienteAdmin().from('propiedades_ubicacion')
      .upsert({ propiedad_id: lejos.vendedor.propiedadId, direccion: direccionLejos }, { onConflict: 'propiedad_id' })

    const [solicitudLejos] = await listarSolicitudesDelComprador(
      await comoUsuario(lejos.comprador.correo), lejos.comprador.id,
    )
    expect(solicitudLejos!.visita?.id).toBe(lejos.citaId)
    expect(ms(solicitudLejos!.visita!.inicio)).toBe(ms(lejos.franjas[0]!))
    expect(solicitudLejos!.direccion).toBeNull()

    // Dentro de la ventana. Uso (a) de insertarCitaDirecta: visita a 1 hora.
    const vendedor = await crearVendedorConPropiedad()
    const comprador = await crearCompradorConLead(vendedor, 'aceptado')
    const direccionCerca = `Calle cercana ${randomUUID()}`
    await clienteAdmin().from('propiedades_ubicacion')
      .upsert({ propiedad_id: vendedor.propiedadId, direccion: direccionCerca }, { onConflict: 'propiedad_id' })
    const ahora = await ahoraDeLaBase()
    await insertarCitaDirecta({
      leadId: comprador.leadId, propiedadId: vendedor.propiedadId, compradorId: comprador.id,
      vendedorId: vendedor.id, inicio: new Date(ahora.getTime() + HORA_MS),
    })

    const [solicitudCerca] = await listarSolicitudesDelComprador(await comoUsuario(comprador.correo), comprador.id)
    expect(solicitudCerca!.direccion).toBe(direccionCerca)
  })

  it('obtenerFranjasLibres manda limites abiertos y devuelve el horizonte que decide la base', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()
    const vistas = await obtenerFranjasLibres(await comoUsuario(comprador.correo), vendedor.id)
    expect(vistas.map((f) => ms(f.inicio))).toEqual(franjas.map(ms))
  })

  it('obtenerLeadParaReservar y obtenerCitaDeParticipante filtran por el papel pedido, no solo por RLS', async () => {
    const { vendedor, comprador, citaId } = await escenarioConCita()
    const clienteComprador = await comoUsuario(comprador.correo)
    const clienteVendedor = await comoUsuario(vendedor.correo)

    expect((await obtenerLeadParaReservar(clienteComprador, comprador.leadId, comprador.id))?.vendedorId)
      .toBe(vendedor.id)
    // El vendedor VE el lead por RLS, pero no es su comprador.
    expect(await obtenerLeadParaReservar(clienteVendedor, comprador.leadId, vendedor.id)).toBeNull()

    expect((await obtenerCitaDeParticipante(clienteComprador, citaId, comprador.id, 'comprador'))?.id).toBe(citaId)
    expect((await obtenerCitaDeParticipante(clienteVendedor, citaId, vendedor.id, 'vendedor'))?.id).toBe(citaId)
    // El comprador VE la cita por RLS, pero no es su vendedor.
    expect(await obtenerCitaDeParticipante(clienteComprador, citaId, comprador.id, 'vendedor')).toBeNull()
  })
})
