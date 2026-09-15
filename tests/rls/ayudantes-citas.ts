import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba, URL_BASE_DE_DATOS } from './ayudantes'

/**
 * Fixturas de SP5. Todas las cuentas son EFIMERAS (randomUUID en el correo):
 * seed.test.ts borra y recrea las cuentas fijas del seed en paralelo con el
 * resto de la suite. Ver el comentario de sesionVendedor() en ayudantes.ts.
 */
export const PASSWORD = 'CitasPrueba2026*'
export const HORA_MS = 60 * 60 * 1000

export async function crearVendedorConPropiedad() {
  const admin = clienteAdmin()
  const sufijo = randomUUID()
  const correo = `citas-vendedor-${sufijo}@prueba.test`
  const id = await crearUsuarioDePrueba({ correo, password: PASSWORD, rol: 'vendedor' })

  const { data, error } = await admin
    .from('propiedades')
    .insert({
      vendedor_id: id,
      slug: `citas-${sufijo}`,
      titulo: 'Apartamento de prueba para citas',
      descripcion: 'Descripcion de prueba, suficiente para el CHECK de longitud.',
      operacion: 'venta',
      tipo_inmueble: 'apartamento',
      precio: 350000000,
    })
    .select('id')
    .single()
  if (error) throw error
  return { id, correo, propiedadId: data.id as string }
}

export async function crearCompradorConLead(
  vendedor: { id: string; propiedadId: string },
  estado: 'nuevo' | 'aceptado' | 'descartado' = 'aceptado',
) {
  const admin = clienteAdmin()
  const correo = `citas-comprador-${randomUUID()}@prueba.test`
  const id = await crearUsuarioDePrueba({ correo, password: PASSWORD, rol: 'comprador' })

  const { data, error } = await admin
    .from('leads')
    .insert({
      propiedad_id: vendedor.propiedadId,
      comprador_id: id,
      vendedor_id: vendedor.id,
      nombre_mostrado: 'Comprador de prueba',
      mensaje: 'Mensaje de prueba para citas, suficientemente largo.',
      estado,
    })
    .select('id')
    .single()
  if (error) throw error
  return { id, correo, leadId: data.id as string }
}

export function comoUsuario(correo: string): Promise<SupabaseClient> {
  return clienteComo(correo, PASSWORD)
}

export async function consultar<T>(sql: string, parametros: unknown[] = []): Promise<T[]> {
  const base = new Client({ connectionString: URL_BASE_DE_DATOS })
  await base.connect()
  try {
    const { rows } = await base.query(sql, parametros)
    return rows as T[]
  } finally {
    await base.end()
  }
}

export async function ahoraDeLaBase(): Promise<Date> {
  const [fila] = await consultar<{ ahora: Date }>('SELECT now() AS ahora')
  return fila!.ahora
}

export function enPunto(fecha: Date): Date {
  const copia = new Date(fecha.getTime())
  copia.setUTCMinutes(0, 0, 0)
  return copia
}

export function rangoDesde(inicio: Date): string {
  const fin = new Date(inicio.getTime() + HORA_MS)
  return `[${inicio.toISOString()},${fin.toISOString()})`
}

export async function insertarCitaDirecta(datos: {
  leadId: string
  propiedadId: string
  compradorId: string
  vendedorId: string
  inicio: Date
  estado?: 'confirmada' | 'cancelada'
}): Promise<string> {
  const { data, error } = await clienteAdmin()
    .from('citas')
    .insert({
      lead_id: datos.leadId,
      propiedad_id: datos.propiedadId,
      comprador_id: datos.compradorId,
      vendedor_id: datos.vendedorId,
      rango: rangoDesde(datos.inicio),
      estado: datos.estado ?? 'confirmada',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function definirHorario(
  vendedorId: string,
  filas: { dia_semana: number; hora_inicio: string; hora_fin: string }[],
): Promise<void> {
  const { error } = await clienteAdmin()
    .from('disponibilidad_semanal')
    .insert(filas.map((fila) => ({ vendedor_id: vendedorId, ...fila })))
  if (error) throw error
}

export async function definirHorarioCompleto(vendedorId: string): Promise<void> {
  await definirHorario(
    vendedorId,
    [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia_semana: dia, hora_inicio: '00:00', hora_fin: '24:00' })),
  )
}

export async function bloquearFecha(vendedorId: string, fecha: string): Promise<void> {
  const { error } = await clienteAdmin()
    .from('fechas_bloqueadas')
    .insert({ vendedor_id: vendedorId, desde: fecha, hasta: fecha })
  if (error) throw error
}

export function fechaDeBogota(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instante)
}

export async function franjasDe(vendedorId: string): Promise<string[]> {
  const { data, error } = await clienteAdmin().rpc('franjas_libres', {
    p_vendedor_id: vendedorId, p_desde: '-infinity', p_hasta: 'infinity',
  })
  if (error) throw error
  return ((data ?? []) as { inicio: string }[]).map((f) => f.inicio)
}

export async function escenarioReserva() {
  const vendedor = await crearVendedorConPropiedad()
  await definirHorarioCompleto(vendedor.id)
  const comprador = await crearCompradorConLead(vendedor, 'aceptado')
  const franjas = await franjasDe(vendedor.id)
  if (franjas.length < 10) throw new Error('El escenario de reserva necesita al menos 10 franjas libres')
  return { vendedor, comprador, franjas }
}

export async function reservarComo(correo: string, leadId: string, inicio: string) {
  return (await comoUsuario(correo)).rpc('reservar_cita', { p_lead_id: leadId, p_inicio: inicio })
}

export async function inicioDeCita(citaId: string): Promise<number> {
  const { data, error } = await clienteAdmin().from('citas').select('rango').eq('id', citaId).single()
  if (error) throw error
  
  // Parse the tstzrange to get the start ISO string
  const rango = data.rango as string;
  const rawStart = rango.split(',')[0];
  const startClean = rawStart.replace(/["\[\]\(\)]/g, "");
  
  return new Date(startClean).getTime();
}

/** escenarioReserva() mas una visita reservada POR LA FUNCION en la primera franja. */
export async function escenarioConCita() {
  const escenario = await escenarioReserva()
  const { data, error } = await reservarComo(
    escenario.comprador.correo, escenario.comprador.leadId, escenario.franjas[0]!,
  )
  if (error) throw error
  return { ...escenario, citaId: data as string }
}

export async function cancelarComo(correo: string, citaId: string) {
  return (await comoUsuario(correo)).rpc('cancelar_cita', { p_cita_id: citaId })
}

export async function moverComo(correo: string, citaId: string, inicio: string) {
  return (await comoUsuario(correo)).rpc('mover_cita', { p_cita_id: citaId, p_nuevo_inicio: inicio })
}

