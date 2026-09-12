import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const rpc = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ rpc }),
}))

const { enviarLead } = await import('@/app/[barrio]/[slug]/acciones')
const { FormularioLead } = await import('@/app/[barrio]/[slug]/formulario-lead')
const {
  MENSAJE_GENERICO, MENSAJE_LEAD_DUPLICADO, MENSAJE_LEAD_NO_PUBLICADA, MENSAJE_LEAD_PROPIA,
} = await import('@/lib/errores/mapear')

// Un fichero 'use server' solo puede exportar funciones async (Next lo exige
// en build), asi que acciones.ts no exporta sus constantes de codigo -- se
// repiten aqui literales. LD002/LD003 son los SQLSTATE propios (clase LD) que
// public.crear_lead() levanta para estas dos causas -- ver el comentario en
// acciones.ts y supabase/migrations/20260911000400_crear_lead.sql. Si cambian
// alla, cambian aqui tambien.
const CODIGO_NO_PUBLICADA = 'LD002'
const CODIGO_PROPIA = 'LD003'
const CODIGO_DUPLICADO = '23505'

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [clave, valor] of Object.entries(campos)) fd.append(clave, valor)
  return fd
}

const CAMPOS_VALIDOS = {
  propiedad_id: 'prop-123',
  telefono: '3001234567',
  mensaje: 'Me interesa esta propiedad, quisiera visitarla.',
}

describe('enviarLead', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('rechaza sin llamar al RPC cuando el mensaje no pasa esquemaLead', async () => {
    const r = await enviarLead({}, formulario({ ...CAMPOS_VALIDOS, mensaje: 'hola' }))

    expect(r.error).toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechaza sin llamar al RPC cuando el telefono no pasa esquemaLead', async () => {
    const r = await enviarLead({}, formulario({ ...CAMPOS_VALIDOS, telefono: '' }))

    expect(r.error).toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()
  })

  // El campo oculto siempre lo pone FormularioLead, pero la accion no confia
  // en eso: sin el, no tiene sentido intentar el RPC.
  it('rechaza sin propiedad_id, sin llamar al RPC', async () => {
    const fd = formulario(CAMPOS_VALIDOS)
    fd.delete('propiedad_id')

    const r = await enviarLead({}, fd)

    expect(r.error).toBe(MENSAJE_GENERICO)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('llama a crear_lead con los datos validados y devuelve enviado', async () => {
    rpc.mockResolvedValue({ data: 'lead-1', error: null })

    const r = await enviarLead({}, formulario(CAMPOS_VALIDOS))

    expect(r).toEqual({ enviado: true })
    expect(rpc).toHaveBeenCalledWith('crear_lead', {
      p_propiedad_id: 'prop-123',
      p_telefono: '3001234567',
      p_mensaje: 'Me interesa esta propiedad, quisiera visitarla.',
    })
  })

  it('el duplicado (23505, el UNIQUE de la tabla) da el mensaje de ya contactado', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: CODIGO_DUPLICADO } })

    const r = await enviarLead({}, formulario(CAMPOS_VALIDOS))

    expect(r.error).toBe(MENSAJE_LEAD_DUPLICADO)
  })

  /**
   * Distinguido por CODIGO (una constante con nombre, LD002), no por el texto
   * del mensaje de Postgres: un error atado al texto se rompe en cuanto
   * alguien lo reescribe o lo traduce, por un motivo que no tiene nada que
   * ver con el comportamiento.
   */
  it('la propiedad no publicada da su mensaje propio', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: CODIGO_NO_PUBLICADA } })

    const r = await enviarLead({}, formulario(CAMPOS_VALIDOS))

    expect(r.error).toBe(MENSAJE_LEAD_NO_PUBLICADA)
  })

  it('contactar sobre la propia propiedad da su mensaje propio', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: CODIGO_PROPIA } })

    const r = await enviarLead({}, formulario(CAMPOS_VALIDOS))

    expect(r.error).toBe(MENSAJE_LEAD_PROPIA)
  })

  it('cualquier otro error cae en el mensaje generico, sin filtrar el original', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '99999', message: 'boom interno' } })

    const r = await enviarLead({}, formulario(CAMPOS_VALIDOS))

    expect(r.error).toBe(MENSAJE_GENERICO)
  })
})

describe('FormularioLead', () => {
  it('lleva la propiedad en un campo oculto y el telefono precargado', () => {
    const html = renderToStaticMarkup(
      createElement(FormularioLead, { propiedadId: 'prop-123', telefonoPrevio: '3007654321' }),
    )

    expect(html).toContain('name="propiedad_id"')
    expect(html).toContain('value="prop-123"')
    expect(html).toContain('name="telefono"')
    expect(html).toContain('3007654321')
    expect(html).toContain('name="mensaje"')
    expect(html).toContain('Contactar al vendedor')
  })

  it('sin envio previo no muestra el mensaje de confirmacion', () => {
    const html = renderToStaticMarkup(
      createElement(FormularioLead, { propiedadId: 'prop-123', telefonoPrevio: '' }),
    )

    expect(html).not.toContain('Tu mensaje se envio')
  })
})
