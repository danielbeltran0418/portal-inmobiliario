import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const COMPRADOR = { correo: 'rls-comprador@prueba.test', password: 'ClaveDePrueba123!' }
const OTRO = { correo: 'rls-otro@prueba.test', password: 'ClaveDePrueba123!' }
const ADMIN = { correo: 'rls-super@prueba.test', password: 'ClaveDePrueba123!' }

let idComprador = ''

describe('RLS de perfiles', () => {
  beforeAll(async () => {
    idComprador = await crearUsuarioDePrueba({ ...COMPRADOR, rol: 'comprador', nombre: 'Ana Comprador' })
    await crearUsuarioDePrueba({ ...OTRO, rol: 'comprador', nombre: 'Otro Usuario' })
    await crearUsuarioDePrueba({ ...ADMIN, rol: 'super_admin', nombre: 'Super Admin' })
  })

  it('el usuario lee su propio perfil', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { data } = await cliente.from('perfiles').select('nombre, rol')
    expect(data).toHaveLength(1)
    expect(data![0].nombre).toBe('Ana Comprador')
  })

  it('el usuario NO lee el perfil de otro', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { data } = await cliente.from('perfiles').select('nombre')
    expect(data!.some((f) => f.nombre === 'Otro Usuario')).toBe(false)
  })

  it('el usuario actualiza su propio nombre', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { error } = await cliente.from('perfiles')
      .update({ nombre: 'Ana Actualizada' }).eq('id', idComprador)
    expect(error).toBeNull()
  })

  it('el usuario NO puede escalar su propio rol', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { error } = await cliente.from('perfiles')
      .update({ rol: 'super_admin' }).eq('id', idComprador)
    expect(error).not.toBeNull()
  })

  it('el rol en base de datos sigue siendo comprador tras el intento', async () => {
    const { data } = await clienteAdmin()
      .from('perfiles').select('rol').eq('id', idComprador).single()
    expect(data!.rol).toBe('comprador')
  })

  it('el super admin SI lee los perfiles de todos', async () => {
    const cliente = await clienteComo(ADMIN.correo, ADMIN.password)
    const { data } = await cliente.from('perfiles').select('id')
    expect(data!.length).toBeGreaterThan(1)
  })
})
