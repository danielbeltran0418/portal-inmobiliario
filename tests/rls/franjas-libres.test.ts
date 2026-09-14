import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, clienteAnonimo } from './ayudantes'
import {
  HORA_MS, ahoraDeLaBase, bloquearFecha, comoUsuario, crearCompradorConLead,
  crearVendedorConPropiedad, definirHorario, definirHorarioCompleto, fechaDeBogota,
} from './ayudantes-citas'

type Franja = { inicio: string; fin: string }

// Los mismos limites que manda la aplicacion: el horizonte lo decide la base.
const LIMITES_ABIERTOS = { p_desde: '-infinity', p_hasta: 'infinity' }
const DIA_MS = 24 * HORA_MS

async function franjasComo(cliente: SupabaseClient, vendedorId: string): Promise<Franja[]> {
  const { data, error } = await cliente.rpc('franjas_libres', { p_vendedor_id: vendedorId, ...LIMITES_ABIERTOS })
  expect(error).toBeNull()
  return (data ?? []) as Franja[]
}

describe('franjas_libres', () => {
  it('jueves 15:00-16:00 de un vendedor de Barranquilla se ofrece a las 20:00 UTC', async () => {
    const vendedor = await crearVendedorConPropiedad()
    const comprador = await crearCompradorConLead(vendedor, 'aceptado')
    await definirHorario(vendedor.id, [{ dia_semana: 4, hora_inicio: '15:00', hora_fin: '16:00' }])

    const franjas = await franjasComo(await comoUsuario(comprador.correo), vendedor.id)

    // Una ventana de 14 dias contiene uno o dos jueves validos, nunca cero ni tres.
    expect(franjas.length).toBeGreaterThanOrEqual(1)
    expect(franjas.length).toBeLessThanOrEqual(2)
    for (const franja of franjas) {
      const inicio = new Date(franja.inicio)
      expect(inicio.getUTCDay()).toBe(4)
      expect(inicio.getUTCHours()).toBe(20)
      expect(inicio.getUTCMinutes()).toBe(0)
      expect(new Date(franja.fin).getTime() - inicio.getTime()).toBe(HORA_MS)
    }
  })

  it('no ofrece nada antes de now() + 2 h ni despues de now() + 14 dias', async () => {
    const vendedor = await crearVendedorConPropiedad()
    await definirHorarioCompleto(vendedor.id)

    // antes y despues acotan el now() que uso la funcion.
    const antes = (await ahoraDeLaBase()).getTime()
    const franjas = await franjasComo(await comoUsuario(vendedor.correo), vendedor.id)
    const despues = (await ahoraDeLaBase()).getTime()

    expect(franjas.length).toBeGreaterThan(300)
    const inicios = franjas.map((f) => new Date(f.inicio).getTime())
    const primera = Math.min(...inicios)
    const ultima = Math.max(...inicios)

    // Lo que se afirma: ni now() + 1 h ni now() + 14 d + 1 h estan en la lista.
    expect(primera).toBeGreaterThanOrEqual(antes + 2 * HORA_MS)
    expect(ultima).toBeLessThanOrEqual(despues + 14 * DIA_MS)

    // Positivo: el horizonte llega hasta sus dos bordes, no se recorto de mas.
    expect(primera).toBeLessThan(despues + 3 * HORA_MS)
    expect(ultima).toBeGreaterThan(antes + 14 * DIA_MS - HORA_MS)
  })

  it('una fecha bloqueada no ofrece ninguna franja ese dia', async () => {
    const vendedor = await crearVendedorConPropiedad()
    await definirHorarioCompleto(vendedor.id)
    const ahora = (await ahoraDeLaBase()).getTime()
    const bloqueada = fechaDeBogota(new Date(ahora + 5 * DIA_MS))
    await bloquearFecha(vendedor.id, bloqueada)

    const dias = (await franjasComo(await comoUsuario(vendedor.correo), vendedor.id))
      .map((f) => fechaDeBogota(new Date(f.inicio)))

    expect(dias).not.toContain(bloqueada)
    // Positivo: los dias vecinos si tienen franjas.
    expect(dias).toContain(fechaDeBogota(new Date(ahora + 4 * DIA_MS)))
    expect(dias).toContain(fechaDeBogota(new Date(ahora + 6 * DIA_MS)))
  })

  it('deduplica horarios solapados y devuelve las franjas ordenadas', async () => {
    const vendedor = await crearVendedorConPropiedad()
    await definirHorarioCompleto(vendedor.id)
    await definirHorario(
      vendedor.id,
      [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia_semana: dia, hora_inicio: '08:00', hora_fin: '18:00' })),
    )

    const inicios = (await franjasComo(await comoUsuario(vendedor.correo), vendedor.id))
      .map((f) => new Date(f.inicio).getTime())

    expect(new Set(inicios).size).toBe(inicios.length)
    expect(inicios).toEqual([...inicios].sort((a, b) => a - b))
  })

  it('solo la ven el propio vendedor, un comprador con lead aceptado de ese vendedor y service_role', async () => {
    const vendedor = await crearVendedorConPropiedad()
    await definirHorarioCompleto(vendedor.id)
    const aceptado = await crearCompradorConLead(vendedor, 'aceptado')
    const nuevo = await crearCompradorConLead(vendedor, 'nuevo')
    const descartado = await crearCompradorConLead(vendedor, 'descartado')
    const otroVendedor = await crearVendedorConPropiedad()
    const aceptadoDeOtro = await crearCompradorConLead(otroVendedor, 'aceptado')

    expect((await franjasComo(await comoUsuario(vendedor.correo), vendedor.id)).length).toBeGreaterThan(0)
    expect((await franjasComo(await comoUsuario(aceptado.correo), vendedor.id)).length).toBeGreaterThan(0)
    expect((await franjasComo(clienteAdmin(), vendedor.id)).length).toBeGreaterThan(0)

    expect(await franjasComo(await comoUsuario(nuevo.correo), vendedor.id)).toEqual([])
    expect(await franjasComo(await comoUsuario(descartado.correo), vendedor.id)).toEqual([])
    expect(await franjasComo(await comoUsuario(aceptadoDeOtro.correo), vendedor.id)).toEqual([])
    expect(await franjasComo(await comoUsuario(otroVendedor.correo), vendedor.id)).toEqual([])

    const anonimo = await clienteAnonimo().rpc('franjas_libres', { p_vendedor_id: vendedor.id, ...LIMITES_ABIERTOS })
    expect(anonimo.error?.code).toBe('42501')
  })
})
