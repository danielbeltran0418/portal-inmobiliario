import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteAnonimo } from './ayudantes'
import {
  comoUsuario, consultar, crearCompradorConLead, crearVendedorConPropiedad,
  escenarioConCita, escenarioReserva, inicioDeCita,
} from './ayudantes-citas'

const ms = (iso: string) => new Date(iso).getTime()

const COMO = [
  'public.reservar_cita_como(uuid, timestamptz, uuid)',
  'public.mover_cita_como(uuid, timestamptz, uuid)',
  'public.cancelar_cita_como(uuid, uuid)',
] as const

const INTERNAS = [
  'public.franja_valida(uuid, timestamptz)',
  'public.franjas_candidatas(uuid, timestamptz, timestamptz)',
] as const

const DE_AUTHENTICATED = [
  'public.reservar_cita(uuid, timestamptz)',
  'public.mover_cita(uuid, timestamptz)',
  'public.cancelar_cita(uuid)',
  'public.franjas_libres(uuid, timestamptz, timestamptz)',
] as const

/** has_function_privilege sobre la firma exacta. El ::regprocedure revienta si la firma no existe. */
async function ejecuta(rol: string, firma: string): Promise<boolean> {
  const [fila] = await consultar<{ ejecuta: boolean }>(
    `SELECT has_function_privilege($1, $2::regprocedure, 'EXECUTE') AS ejecuta`, [rol, firma],
  )
  return fila!.ejecuta
}

describe('privilegios de ejecucion de SP5', () => {
  it('anon y authenticated no ejecutan las _como ni las internas; service_role solo las _como; authenticated si las cortas', async () => {
    const sobrantes: string[] = []
    const faltantes: string[] = []

    for (const firma of [...COMO, ...INTERNAS]) {
      if (await ejecuta('anon', firma)) sobrantes.push(`anon ${firma}`)
      if (await ejecuta('authenticated', firma)) sobrantes.push(`authenticated ${firma}`)
    }
    for (const firma of INTERNAS) {
      if (await ejecuta('service_role', firma)) sobrantes.push(`service_role ${firma}`)
    }
    for (const firma of COMO) {
      if (!(await ejecuta('service_role', firma))) faltantes.push(`service_role ${firma}`)
    }
    for (const firma of DE_AUTHENTICATED) {
      if (await ejecuta('anon', firma)) sobrantes.push(`anon ${firma}`)
      if (!(await ejecuta('authenticated', firma))) faltantes.push(`authenticated ${firma}`)
    }

    expect(sobrantes).toEqual([])
    expect(faltantes).toEqual([])
  })

  it('un authenticated no reserva en nombre de otro comprador con reservar_cita_como; service_role si', async () => {
    const { vendedor, comprador: victima, franjas } = await escenarioReserva()
    // El atacante es verosimil: otro comprador con su propio lead aceptado del mismo vendedor.
    const atacante = await crearCompradorConLead(vendedor, 'aceptado')
    const argumentos = { p_lead_id: victima.leadId, p_inicio: franjas[0], p_actor: victima.id }

    const comoAtacante = await (await comoUsuario(atacante.correo)).rpc('reservar_cita_como', argumentos)
    expect(comoAtacante.error?.code).toBe('42501')
    const comoAnonimo = await clienteAnonimo().rpc('reservar_cita_como', argumentos)
    expect(comoAnonimo.error?.code).toBe('42501')
    expect((await clienteAdmin().from('citas').select('id').eq('lead_id', victima.leadId)).data).toEqual([])

    // Positivo: la costura de SP6. service_role reserva en nombre del comprador.
    const comoServicio = await clienteAdmin().rpc('reservar_cita_como', argumentos)
    expect(comoServicio.error).toBeNull()
    const { data: cita } = await clienteAdmin().from('citas')
      .select('comprador_id').eq('id', comoServicio.data as string).single()
    expect(cita?.comprador_id).toBe(victima.id)
  })

  it('un authenticated no mueve una visita ajena con mover_cita_como; service_role si', async () => {
    const { comprador: victima, franjas, citaId } = await escenarioConCita()
    const atacante = await crearVendedorConPropiedad()
    const argumentos = { p_cita_id: citaId, p_nuevo_inicio: franjas[2], p_actor: victima.id }

    expect((await (await comoUsuario(atacante.correo)).rpc('mover_cita_como', argumentos)).error?.code).toBe('42501')
    expect((await clienteAnonimo().rpc('mover_cita_como', argumentos)).error?.code).toBe('42501')
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[0]!))

    expect((await clienteAdmin().rpc('mover_cita_como', argumentos)).error).toBeNull()
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[2]!))
  })

  it('un authenticated no cancela una visita ajena con cancelar_cita_como; service_role si', async () => {
    const { comprador: victima, citaId } = await escenarioConCita()
    const atacante = await crearVendedorConPropiedad()
    const argumentos = { p_cita_id: citaId, p_actor: victima.id }

    expect((await (await comoUsuario(atacante.correo)).rpc('cancelar_cita_como', argumentos)).error?.code).toBe('42501')
    expect((await clienteAnonimo().rpc('cancelar_cita_como', argumentos)).error?.code).toBe('42501')
    const antes = await clienteAdmin().from('citas').select('estado').eq('id', citaId).single()
    expect(antes.data?.estado).toBe('confirmada')

    expect((await clienteAdmin().rpc('cancelar_cita_como', argumentos)).error).toBeNull()
    const despues = await clienteAdmin().from('citas').select('estado,cancelada_por').eq('id', citaId).single()
    expect(despues.data).toEqual({ estado: 'cancelada', cancelada_por: victima.id })
  })
})
