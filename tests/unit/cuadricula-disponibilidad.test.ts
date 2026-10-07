import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { horasCubiertas, rangosDesdeHoras, horasVisibles } from '@/lib/citas/cuadricula'

const FRANJAS = [
  { id: 'a', dia_semana: 1, hora_inicio: '09:00:00', hora_fin: '12:00:00' },
  { id: 'b', dia_semana: 1, hora_inicio: '11:00:00', hora_fin: '13:00:00' },
  { id: 'c', dia_semana: 3, hora_inicio: '23:00:00', hora_fin: '24:00:00' },
]

describe('modelo de la cuadricula', () => {
  it('una celda esta activa si alguna franja del dia la cubre (aunque se solapen)', () => {
    expect([...horasCubiertas(FRANJAS, 1)].sort((x, y) => x - y)).toEqual([9, 10, 11, 12])
    expect([...horasCubiertas(FRANJAS, 3)]).toEqual([23])
    expect(horasCubiertas(FRANJAS, 2).size).toBe(0)
  })

  it('las horas sueltas se funden en rangos contiguos, hasta las 24:00', () => {
    expect(rangosDesdeHoras(new Set([9, 10, 12, 23]))).toEqual([
      { hora_inicio: '09:00', hora_fin: '11:00' },
      { hora_inicio: '12:00', hora_fin: '13:00' },
      { hora_inicio: '23:00', hora_fin: '24:00' },
    ])
    expect(rangosDesdeHoras(new Set())).toEqual([])
  })

  it('muestra de 06 a 21 y se amplia si hay franjas fuera de ese rango', () => {
    expect(horasVisibles([])).toEqual(Array.from({ length: 16 }, (_, i) => i + 6))
    const v = horasVisibles(FRANJAS)
    expect(v[0]).toBe(6)
    expect(v.at(-1)).toBe(23)
  })
})

// ---------------------------------------------------------------- accion
const getUser = vi.fn()
const leer = vi.fn()
const insertar = vi.fn()
const borrar = vi.fn()
const revalidatePath = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: (r: string) => revalidatePath(r) }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => leer() }) }),
      insert: (filas: unknown) => ({ select: () => insertar(filas) }),
      delete: () => ({ in: (_c: string, ids: string[]) => ({ eq: () => ({ select: () => borrar(ids) }) }) }),
    }),
  }),
}))

const { conmutarHoraSemanal } = await import('@/app/(vendedor)/panel/disponibilidad/acciones')
const { CuadriculaSemanal } = await import('@/app/(vendedor)/panel/disponibilidad/cuadricula')

function celda(valor: string): FormData {
  const fd = new FormData()
  fd.append('celda', valor)
  return fd
}

describe('conmutarHoraSemanal', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'v1' } } })
    leer.mockReset().mockResolvedValue({ data: FRANJAS.filter((f) => f.dia_semana === 1), error: null })
    insertar.mockReset().mockImplementation(async (filas: unknown[]) => ({ data: filas.map((_, i) => ({ id: `n${i}` })), error: null }))
    borrar.mockReset().mockImplementation(async (ids: string[]) => ({ data: ids.map((id) => ({ id })), error: null }))
    revalidatePath.mockReset()
  })

  it('activar una hora contigua reescribe el dia como un solo rango y borra las filas viejas', async () => {
    const r = await conmutarHoraSemanal({}, celda('1-13'))
    expect(r).toEqual({ hecho: true })
    expect(insertar).toHaveBeenCalledWith([
      { vendedor_id: 'v1', dia_semana: 1, hora_inicio: '09:00', hora_fin: '14:00' },
    ])
    expect(borrar).toHaveBeenCalledWith(['a', 'b'])
    expect(revalidatePath).toHaveBeenCalledWith('/panel/disponibilidad')
  })

  it('quitar una hora del medio parte el rango en dos', async () => {
    await conmutarHoraSemanal({}, celda('1-10'))
    expect(insertar).toHaveBeenCalledWith([
      { vendedor_id: 'v1', dia_semana: 1, hora_inicio: '09:00', hora_fin: '10:00' },
      { vendedor_id: 'v1', dia_semana: 1, hora_inicio: '11:00', hora_fin: '13:00' },
    ])
  })

  it('quitar la ultima hora del dia solo borra', async () => {
    leer.mockResolvedValue({ data: [{ id: 'z', dia_semana: 2, hora_inicio: '08:00:00', hora_fin: '09:00:00' }], error: null })
    await conmutarHoraSemanal({}, celda('2-8'))
    expect(insertar).not.toHaveBeenCalled()
    expect(borrar).toHaveBeenCalledWith(['z'])
  })

  it('si la insercion falla no se borra nada: el horario queda como estaba', async () => {
    insertar.mockResolvedValue({ data: null, error: { message: 'x' } })
    const r = await conmutarHoraSemanal({}, celda('1-13'))
    expect(r.error).toBeTruthy()
    expect(borrar).not.toHaveBeenCalled()
  })

  it('rechaza celdas fuera de rango sin tocar la base', async () => {
    for (const v of ['0-9', '8-9', '1-24', '1-x', '']) {
      expect((await conmutarHoraSemanal({}, celda(v))).error).toBeTruthy()
    }
    expect(leer).not.toHaveBeenCalled()
  })
})

describe('CuadriculaSemanal', () => {
  it('una celda por dia y hora, con estado accesible', () => {
    const html = renderToStaticMarkup(createElement(CuadriculaSemanal, { franjas: FRANJAS }))
    expect(html).toContain('name="celda"')
    expect(html).toContain('value="1-9"')
    expect(html).toMatch(/aria-label="lunes 09:00, disponible"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="lunes 09:00, disponible"/)
    expect(html).toContain('aria-label="martes 09:00, no disponible"')
    expect((html.match(/name="celda"/g) ?? []).length).toBe(7 * 18)
  })
})
