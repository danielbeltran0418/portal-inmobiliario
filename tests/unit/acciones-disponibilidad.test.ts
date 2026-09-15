import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => clienteDeLaBaseFalsa() }))

const VENDEDOR = '5b0c2f1e-7d3a-4e6b-9f8c-1a2b3c4d5e6f'
const OTRO_VENDEDOR = '6c1d3e2f-8e4b-4f7c-8a9d-2b3c4d5e6f70'

type Fila = { tabla: string; id: string; vendedor_id: string } & Record<string, unknown>
let usuarioId: string | null = VENDEDOR
let filas: Fila[] = []

/**
 * Base falsa que se comporta como PostgREST con la RLS del dueno de la Tarea 2:
 *   - INSERT con un vendedor_id que no es el de la sesion: 42501.
 *   - DELETE sobre filas ajenas o inexistentes: CERO filas y error null. Es la
 *     trampa que la accion tiene que detectar contando filas.
 */
function clienteDeLaBaseFalsa() {
  return {
    auth: { getUser: async () => ({ data: { user: usuarioId ? { id: usuarioId } : null } }) },
    from: (tabla: string) => ({
      insert: (valores: Record<string, unknown>) => ({
        select: async () => {
          if (valores.vendedor_id !== usuarioId) {
            return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }
          }
          const fila: Fila = { tabla, id: randomUUID(), vendedor_id: String(valores.vendedor_id), ...valores }
          filas.push(fila)
          return { data: [{ id: fila.id }], error: null }
        },
      }),
      delete: () => {
        const filtros: Record<string, unknown> = {}
        const consulta = {
          eq(columna: string, valor: unknown) {
            filtros[columna] = valor
            return consulta
          },
          async select() {
            const alcanzadas = filas.filter((f) =>
              f.tabla === tabla && f.vendedor_id === usuarioId
              && Object.entries(filtros).every(([columna, valor]) => f[columna] === valor))
            filas = filas.filter((f) => !alcanzadas.includes(f))
            return { data: alcanzadas.map((f) => ({ id: f.id })), error: null }
          },
        }
        return consulta
      },
    }),
  }
}

const { agregarFranjaSemanal, eliminarFranjaSemanal, bloquearFechas, desbloquearFechas } = await import(
  '@/app/(vendedor)/panel/disponibilidad/acciones'
)
const { MENSAJE_BLOQUEO_NO_ENCONTRADO, MENSAJE_GENERICO, MENSAJE_HORARIO_NO_ENCONTRADO } = await import(
  '@/lib/errores/mapear'
)

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData()
  for (const [clave, valor] of Object.entries(campos)) datos.append(clave, valor)
  return datos
}

beforeEach(() => {
  usuarioId = VENDEDOR
  filas = []
  revalidatePath.mockReset()
})

describe('agregarFranjaSemanal', () => {
  it('guarda una franja valida del vendedor de la sesion, con los valores ya validados', async () => {
    const r = await agregarFranjaSemanal({}, formulario({ dia_semana: ' 4 ', hora_inicio: '15:00 ', hora_fin: ' 16:00' }))
    expect(r).toEqual({ hecho: true })
    expect(filas).toEqual([{
      tabla: 'disponibilidad_semanal', id: expect.any(String), vendedor_id: VENDEDOR,
      dia_semana: 4, hora_inicio: '15:00', hora_fin: '16:00',
    }])
    expect(revalidatePath).toHaveBeenCalledWith('/panel/disponibilidad')
  })

  it('horas que no estan en punto, al reves o ausentes no llegan a la base', async () => {
    expect(await agregarFranjaSemanal({}, formulario({ dia_semana: '4', hora_inicio: '15:30', hora_fin: '16:00' })))
      .toEqual({ error: 'Elige una hora en punto' })
    expect(await agregarFranjaSemanal({}, formulario({ dia_semana: '4', hora_inicio: '16:00', hora_fin: '15:00' })))
      .toEqual({ error: 'La hora de fin tiene que ser posterior a la de inicio' })
    expect(await agregarFranjaSemanal({}, formulario({ dia_semana: '4', hora_inicio: '15:00' })))
      .toEqual({ error: 'Elige una hora en punto' })
    expect(await agregarFranjaSemanal({}, formulario({ dia_semana: '9', hora_inicio: '15:00', hora_fin: '16:00' })))
      .toEqual({ error: 'Elige un dia' })
    expect(filas).toEqual([])
  })

  it('sin sesion no llega a la base', async () => {
    usuarioId = null
    expect(await agregarFranjaSemanal({}, formulario({ dia_semana: '4', hora_inicio: '15:00', hora_fin: '16:00' })))
      .toEqual({ error: MENSAJE_GENERICO })
    expect(filas).toEqual([])
  })
})

describe('eliminarFranjaSemanal', () => {
  it('borra una franja propia', async () => {
    const id = randomUUID()
    filas = [{ tabla: 'disponibilidad_semanal', id, vendedor_id: VENDEDOR }]
    expect(await eliminarFranjaSemanal({}, formulario({ id }))).toEqual({ hecho: true })
    expect(filas).toEqual([])
    expect(revalidatePath).toHaveBeenCalledWith('/panel/disponibilidad')
  })

  it('una franja ajena afecta cero filas y NO se reporta como exito', async () => {
    const id = randomUUID()
    filas = [{ tabla: 'disponibilidad_semanal', id, vendedor_id: OTRO_VENDEDOR }]
    expect(await eliminarFranjaSemanal({}, formulario({ id }))).toEqual({ error: MENSAJE_HORARIO_NO_ENCONTRADO })
    expect(filas).toHaveLength(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('un id que no es uuid no llega a la base', async () => {
    expect(await eliminarFranjaSemanal({}, formulario({ id: 'fila-1' }))).toEqual({ error: MENSAJE_GENERICO })
  })
})

describe('bloquearFechas', () => {
  it('guarda un rango valido del vendedor de la sesion', async () => {
    expect(await bloquearFechas({}, formulario({ desde: '2026-12-24', hasta: ' 2026-12-26 ' }))).toEqual({ hecho: true })
    expect(filas).toEqual([{
      tabla: 'fechas_bloqueadas', id: expect.any(String), vendedor_id: VENDEDOR,
      desde: '2026-12-24', hasta: '2026-12-26',
    }])
  })

  it('una fecha final anterior, ilegible o ausente no llega a la base', async () => {
    expect(await bloquearFechas({}, formulario({ desde: '2026-12-26', hasta: '2026-12-24' })))
      .toEqual({ error: 'La fecha final no puede ser anterior a la inicial' })
    expect(await bloquearFechas({}, formulario({ desde: 'ayer', hasta: '2026-12-24' })))
      .toEqual({ error: 'Elige una fecha' })
    expect(await bloquearFechas({}, formulario({ hasta: '2026-12-24' })))
      .toEqual({ error: 'Elige una fecha' })
    expect(filas).toEqual([])
  })
})

describe('desbloquearFechas', () => {
  it('borra un bloqueo propio', async () => {
    const id = randomUUID()
    filas = [{ tabla: 'fechas_bloqueadas', id, vendedor_id: VENDEDOR }]
    expect(await desbloquearFechas({}, formulario({ id }))).toEqual({ hecho: true })
    expect(filas).toEqual([])
  })

  it('un bloqueo ajeno afecta cero filas y NO se reporta como exito', async () => {
    const id = randomUUID()
    filas = [{ tabla: 'fechas_bloqueadas', id, vendedor_id: OTRO_VENDEDOR }]
    expect(await desbloquearFechas({}, formulario({ id }))).toEqual({ error: MENSAJE_BLOQUEO_NO_ENCONTRADO })
    expect(filas).toHaveLength(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
