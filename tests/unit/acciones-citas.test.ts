import { describe, it, expect, vi, beforeEach } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({
    rpc: baseFalsaRpc,
    auth: { getUser: async () => ({ data: { user: { id: ACTOR } } }) },
  }),
}))
// El correo a la otra parte se prueba aparte (notificaciones-citas.test.ts):
// aqui solo importa que cada accion lo pida con el evento correcto.
const avisarCita = vi.fn()
vi.mock('@/lib/notificaciones/citas', () => ({ avisarCita }))

const ACTOR = '5b7e9c11-2d4f-4a6b-8c1d-3e5f7a9b1c2d'

const LEAD = '3f1c1b5e-8f5a-4d2b-9c1e-2a7b6d4e5f60'
const CITA = '9a2d7c41-3b6e-4f18-8d5a-1c2b3e4f5a6b'
const FRANJA = '2026-09-17T20:00:00+00:00'
const OTRA_FRANJA = '2026-09-17T21:00:00+00:00'

let codigoForzado: string | null = null
let escrituras: string[] = []

const falla = (code: string) => ({ data: null, error: { code, message: 'detalle interno de postgres' } })

/**
 * Base falsa CON comportamiento, no un espia de llamadas. Acepta solo la
 * combinacion exacta de valores validos y responde como las funciones reales a
 * todo lo demas. Las pruebas miran el RESULTADO de la accion y las escrituras
 * que la base dejo: una accion que mandara la cadena cruda del formulario (con
 * espacios) recibiria el mismo VS001/VS004 que le daria la base de verdad.
 */
async function baseFalsaRpc(nombre: string, argumentos: Record<string, unknown>) {
  if (codigoForzado) return falla(codigoForzado)
  if (nombre === 'reservar_cita') {
    if (argumentos.p_lead_id !== LEAD) return falla('VS001')
    if (argumentos.p_inicio !== FRANJA) return falla('VS004')
    escrituras.push(`reservada ${FRANJA}`)
    return { data: CITA, error: null }
  }
  if (nombre === 'mover_cita') {
    if (argumentos.p_cita_id !== CITA) return falla('VS006')
    if (argumentos.p_nuevo_inicio !== OTRA_FRANJA) return falla('VS004')
    escrituras.push(`movida ${OTRA_FRANJA}`)
    return { data: null, error: null }
  }
  if (nombre === 'cancelar_cita') {
    if (argumentos.p_cita_id !== CITA) return falla('VS006')
    escrituras.push('cancelada')
    return { data: null, error: null }
  }
  return falla('PGRST202')
}

const { reservarCita, moverCita, cancelarCita } = await import('@/componentes/citas/acciones')
const mapear = await import('@/lib/errores/mapear')

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData()
  for (const [clave, valor] of Object.entries(campos)) datos.append(clave, valor)
  return datos
}

beforeEach(() => {
  codigoForzado = null
  escrituras = []
  revalidatePath.mockReset()
  avisarCita.mockReset()
})

describe('reservarCita', () => {
  it('con un lead y una franja validos queda hecha y revalida las dos vistas', async () => {
    expect(await reservarCita({}, formulario({ lead_id: LEAD, inicio: FRANJA }))).toEqual({ hecho: true })
    expect(escrituras).toEqual([`reservada ${FRANJA}`])
    expect(avisarCita).toHaveBeenCalledWith(CITA, 'reservada', ACTOR)
    expect(revalidatePath).toHaveBeenCalledWith('/mi-cuenta')
    expect(revalidatePath).toHaveBeenCalledWith('/panel/citas')
  })

  it('manda a la base los valores ya validados, no la cadena cruda del formulario', async () => {
    const r = await reservarCita({}, formulario({ lead_id: ` ${LEAD} `, inicio: `  ${FRANJA}\n` }))
    expect(r).toEqual({ hecho: true })
    expect(escrituras).toEqual([`reservada ${FRANJA}`])
  })

  it('un inicio que no es un instante con zona no llega a la base', async () => {
    for (const inicio of ['ma\u00f1ana', '2026-09-17T20:00:00', '']) {
      expect(await reservarCita({}, formulario({ lead_id: LEAD, inicio }))).toEqual({ error: mapear.MENSAJE_GENERICO })
    }
    expect(escrituras).toEqual([])
  })

  it('sin lead_id no llega a la base', async () => {
    expect(await reservarCita({}, formulario({ inicio: FRANJA }))).toEqual({ error: mapear.MENSAJE_GENERICO })
    expect(escrituras).toEqual([])
  })

  it.each([
    ['VS001', mapear.MENSAJE_VISITA_SOLICITUD_INEXISTENTE],
    ['VS002', mapear.MENSAJE_VISITA_NO_PARTICIPA],
    ['VS003', mapear.MENSAJE_VISITA_LEAD_NO_ACEPTADO],
    ['VS004', mapear.MENSAJE_VISITA_FRANJA_NO_DISPONIBLE],
    ['VS005', mapear.MENSAJE_VISITA_YA_RESERVADA],
    ['VS006', mapear.MENSAJE_VISITA_INEXISTENTE],
    ['VS007', mapear.MENSAJE_VISITA_YA_CANCELADA],
    ['VS008', mapear.MENSAJE_VISITA_YA_EMPEZO],
  ])('el codigo %s de la base llega como su mensaje, sin revalidar', async (codigo, mensaje) => {
    codigoForzado = codigo
    expect(await reservarCita({}, formulario({ lead_id: LEAD, inicio: FRANJA }))).toEqual({ error: mensaje })
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(avisarCita).not.toHaveBeenCalled()
  })

  it('un error que no es VS cae en el mensaje generico', async () => {
    codigoForzado = '42501'
    expect(await reservarCita({}, formulario({ lead_id: LEAD, inicio: FRANJA }))).toEqual({ error: mapear.MENSAJE_GENERICO })
  })
})

describe('moverCita', () => {
  it('con una cita y una franja validas queda hecha y revalida', async () => {
    expect(await moverCita({}, formulario({ cita_id: CITA, inicio: OTRA_FRANJA }))).toEqual({ hecho: true })
    expect(escrituras).toEqual([`movida ${OTRA_FRANJA}`])
    expect(avisarCita).toHaveBeenCalledWith(CITA, 'movida', ACTOR)
    expect(revalidatePath).toHaveBeenCalledWith('/mi-cuenta')
    expect(revalidatePath).toHaveBeenCalledWith('/panel/citas')
  })

  it('manda a la base los valores ya validados', async () => {
    expect(await moverCita({}, formulario({ cita_id: `${CITA} `, inicio: ` ${OTRA_FRANJA}` }))).toEqual({ hecho: true })
  })

  it('una visita que ya empezo llega como su mensaje, sin revalidar', async () => {
    codigoForzado = 'VS008'
    expect(await moverCita({}, formulario({ cita_id: CITA, inicio: OTRA_FRANJA })))
      .toEqual({ error: mapear.MENSAJE_VISITA_YA_EMPEZO })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('un cita_id que no es un uuid no llega a la base', async () => {
    expect(await moverCita({}, formulario({ cita_id: 'cita-1', inicio: OTRA_FRANJA })))
      .toEqual({ error: mapear.MENSAJE_GENERICO })
    expect(escrituras).toEqual([])
  })
})

describe('cancelarCita', () => {
  it('con una cita valida queda hecha y revalida', async () => {
    expect(await cancelarCita({}, formulario({ cita_id: CITA }))).toEqual({ hecho: true })
    expect(escrituras).toEqual(['cancelada'])
    expect(avisarCita).toHaveBeenCalledWith(CITA, 'cancelada', ACTOR)
    expect(revalidatePath).toHaveBeenCalledWith('/mi-cuenta')
  })

  it('una visita ya cancelada llega como su mensaje', async () => {
    codigoForzado = 'VS007'
    expect(await cancelarCita({}, formulario({ cita_id: CITA }))).toEqual({ error: mapear.MENSAJE_VISITA_YA_CANCELADA })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('sin cita_id no llega a la base', async () => {
    expect(await cancelarCita({}, formulario({}))).toEqual({ error: mapear.MENSAJE_GENERICO })
    expect(escrituras).toEqual([])
  })
})
