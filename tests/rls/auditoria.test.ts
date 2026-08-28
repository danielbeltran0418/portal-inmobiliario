import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const COMPRADOR = { correo: 'aud-comprador@prueba.test', password: 'ClaveDePrueba123!' }
const ADMIN = { correo: 'aud-admin@prueba.test', password: 'ClaveDePrueba123!' }

describe('RLS de registro_auditoria', () => {
  beforeAll(async () => {
    await crearUsuarioDePrueba({ ...COMPRADOR, rol: 'comprador' })
    await crearUsuarioDePrueba({ ...ADMIN, rol: 'super_admin' })
    await clienteAdmin().from('registro_auditoria').insert({
      accion: 'prueba', entidad: 'sistema', metadatos: { detalle: 'evento de prueba' },
    })
  })

  it('el comprador NO lee el registro de auditoria', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { data } = await cliente.from('registro_auditoria').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('el super admin SI lee el registro', async () => {
    // Control positivo del caso anterior: prueba que la fila existe y que
    // solo esta oculta para el comprador, no que este ausente para todos.
    // Conteo exacto (no solo > 0): en este punto de la suite solo existe
    // la fila insertada en el beforeAll de arriba.
    const cliente = await clienteComo(ADMIN.correo, ADMIN.password)
    const { data } = await cliente.from('registro_auditoria').select('id')
    expect(data).toHaveLength(1)
  })

  it('el comprador NO puede escribir en el registro', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { error } = await cliente.from('registro_auditoria')
      .insert({ accion: 'falsificada', entidad: 'sistema' })
    expect(error).not.toBeNull()
    // No hay GRANT de INSERT para authenticated: el rechazo ocurre a nivel
    // de privilegio de tabla, antes de evaluar RLS. SQLSTATE 42501
    // (insufficient_privilege), igual que en propiedades/barrios/imagenes.
    expect(error?.code).toBe('42501')
  })
})
