import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MENSAJE_GENERICO, MENSAJE_LEAD_YA_RESPONDIDO } from '@/lib/errores/mapear'

const crearClienteServidor = vi.fn()
const revalidatePath = vi.fn()
const updateMock = vi.fn()
const eqMock = vi.fn()
const selectMock = vi.fn()
const resultadoMock = vi.fn()

// Mismo patron que tests/unit/acciones-imagenes.test.ts: se sustituye el
// cliente de Supabase y next/cache por completo.
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor }))
vi.mock('next/cache', () => ({ revalidatePath }))

const { aceptarLead, descartarLead } = await import(
  '@/app/(vendedor)/panel/leads/acciones'
)

/**
 * Reproduce la cadena real: .from('leads').update({estado}).eq('id',
 * id).select('id'), resuelta por resultadoMock(). updateMock/eqMock/selectMock
 * quedan disponibles para comprobar CON QUE se llamo cada eslabon (el estado
 * pedido, el id filtrado, la columna seleccionada).
 */
function clienteFalso() {
  return {
    from: (tabla: string) => ({
      update: (payload: unknown) => {
        updateMock(tabla, payload)
        return {
          eq: (columna: string, valor: unknown) => {
            eqMock(columna, valor)
            return { select: (columnas: string) => { selectMock(columnas); return resultadoMock() } }
          },
        }
      },
    }),
  }
}

function formularioConId(id?: string): FormData {
  const fd = new FormData()
  if (id !== undefined) fd.append('id', id)
  return fd
}

beforeEach(() => {
  crearClienteServidor.mockReset().mockResolvedValue(clienteFalso())
  revalidatePath.mockReset()
  updateMock.mockReset()
  eqMock.mockReset()
  selectMock.mockReset()
  resultadoMock.mockReset()
})

describe('aceptarLead / descartarLead: validacion de entrada', () => {
  it('sin id en el formData responde el mensaje generico sin tocar la base', async () => {
    const r = await aceptarLead(formularioConId())
    expect(r).toEqual({ error: MENSAJE_GENERICO })
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })

  it('con un id que no es string (por ejemplo un File) responde el mensaje generico sin tocar la base', async () => {
    const fd = new FormData()
    fd.append('id', new File([new Uint8Array(1)], 'x.txt'))
    const r = await descartarLead(fd)
    expect(r).toEqual({ error: MENSAJE_GENERICO })
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })
})

describe('aceptarLead', () => {
  it('pide el UPDATE con estado "aceptado" y filtra por el id recibido', async () => {
    resultadoMock.mockResolvedValue({ data: [{ id: 'lead-1' }], error: null })
    await aceptarLead(formularioConId('lead-1'))
    expect(updateMock).toHaveBeenCalledWith('leads', { estado: 'aceptado' })
    expect(eqMock).toHaveBeenCalledWith('id', 'lead-1')
    expect(selectMock).toHaveBeenCalledWith('id')
  })

  /**
   * EL GUARDIA QUE LA REVISION SEÑALO SIN COBERTURA: un UPDATE de PostgREST
   * que afecta CERO filas (lead ajeno, o de otro vendedor) vuelve con
   * error: null. Sin el `if (!data || data.length === 0)` de acciones.ts,
   * este caso pasaria de largo como EXITO -- exactamente la trampa que el
   * brief de la Task 8 pedia evitar. Esta prueba falla (queda en rojo) si
   * ese guardia se borra o se debilita.
   */
  it('UPDATE que afecta CERO filas sin error (lead ajeno) NO es exito', async () => {
    resultadoMock.mockResolvedValue({ data: [], error: null })
    const r = await aceptarLead(formularioConId('lead-ajeno'))
    expect(r).toEqual({ error: MENSAJE_LEAD_YA_RESPONDIDO })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('UPDATE exitoso (una fila) revalida /panel/leads y /panel y no devuelve error', async () => {
    resultadoMock.mockResolvedValue({ data: [{ id: 'lead-1' }], error: null })
    const r = await aceptarLead(formularioConId('lead-1'))
    expect(r).toEqual({})
    expect(revalidatePath).toHaveBeenCalledWith('/panel/leads')
    expect(revalidatePath).toHaveBeenCalledWith('/panel')
  })

  /**
   * Codigo LD004 (Hallazgo M2 de la revision final de SP4): validar_transicion_lead()
   * distingue por SQLSTATE, no por el texto del mensaje. Antes de ese arreglo
   * esta rama miraba /ya fue respondido/i.test(error.message); un mensaje es
   * texto de interfaz, cambia y se traduce, y una rama atada a el se rompe
   * por un motivo que no es el comportamiento.
   */
  it('UPDATE que falla con el codigo LD004 traduce al mensaje propio', async () => {
    resultadoMock.mockResolvedValue({
      data: null,
      error: { code: 'LD004', message: 'Este lead ya fue respondido' },
    })
    const r = await aceptarLead(formularioConId('lead-1'))
    expect(r).toEqual({ error: MENSAJE_LEAD_YA_RESPONDIDO })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('UPDATE que falla con cualquier otro codigo responde el mensaje generico, sin filtrar el detalle', async () => {
    resultadoMock.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'detalle interno de postgres' },
    })
    const r = await aceptarLead(formularioConId('lead-1'))
    expect(r).toEqual({ error: MENSAJE_GENERICO })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('descartarLead', () => {
  it('pide el UPDATE con estado "descartado"', async () => {
    resultadoMock.mockResolvedValue({ data: [{ id: 'lead-1' }], error: null })
    await descartarLead(formularioConId('lead-1'))
    expect(updateMock).toHaveBeenCalledWith('leads', { estado: 'descartado' })
  })

  // El mismo guardia, del otro lado: descartar un lead ya respondido (o
  // ajeno) tampoco puede pasar por exito.
  it('UPDATE que afecta CERO filas sin error NO es exito', async () => {
    resultadoMock.mockResolvedValue({ data: [], error: null })
    const r = await descartarLead(formularioConId('lead-ya-respondido'))
    expect(r).toEqual({ error: MENSAJE_LEAD_YA_RESPONDIDO })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('UPDATE exitoso revalida las dos rutas', async () => {
    resultadoMock.mockResolvedValue({ data: [{ id: 'lead-1' }], error: null })
    const r = await descartarLead(formularioConId('lead-1'))
    expect(r).toEqual({})
    expect(revalidatePath).toHaveBeenCalledWith('/panel/leads')
    expect(revalidatePath).toHaveBeenCalledWith('/panel')
  })
})
