import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { clienteAdmin, crearUsuarioDePrueba } from './ayudantes'

// Control 20 de la auditoria (20261014000300): todo cambio de rol queda en
// registro_auditoria, tambien los hechos con service_role.
describe('auditoria de cambios de rol', () => {
  it('promover una cuenta a super_admin deja un evento rol_cambiado con el antes y el despues', async () => {
    const admin = clienteAdmin()
    const id = await crearUsuarioDePrueba({
      correo: `rol-auditado-${randomUUID()}@prueba.test`, password: 'ClaveDePrueba123!', rol: 'comprador',
    })

    const { error } = await admin.from('perfiles').update({ rol: 'super_admin' }).eq('id', id)
    expect(error).toBeNull()

    const { data } = await admin.from('registro_auditoria')
      .select('accion, entidad, metadatos').eq('accion', 'rol_cambiado').eq('entidad_id', id)
    expect(data).toContainEqual(expect.objectContaining({
      entidad: 'perfiles',
      metadatos: expect.objectContaining({ rol_anterior: 'comprador', rol_nuevo: 'super_admin' }),
    }))
  })

  it('una actualizacion que no cambia el rol no genera evento (control negativo)', async () => {
    const admin = clienteAdmin()
    const id = await crearUsuarioDePrueba({
      correo: `rol-sin-cambio-${randomUUID()}@prueba.test`, password: 'ClaveDePrueba123!', rol: 'vendedor',
    })
    // crearUsuarioDePrueba ya paso de comprador a vendedor: un evento.
    await admin.from('perfiles').update({ nombre: 'Otro nombre' }).eq('id', id)

    const { data } = await admin.from('registro_auditoria')
      .select('id').eq('accion', 'rol_cambiado').eq('entidad_id', id)
    expect(data).toHaveLength(1)
  })
})
