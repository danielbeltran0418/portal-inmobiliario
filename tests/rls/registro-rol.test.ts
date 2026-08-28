import { describe, it, expect } from 'vitest'
import { clienteAnonimo, clienteAdmin } from './ayudantes'

async function borrarSiExiste(correo: string) {
  const admin = clienteAdmin()
  const { data } = await admin.auth.admin.listUsers()
  const u = data?.users.find((x) => x.email === correo)
  if (u) await admin.auth.admin.deleteUser(u.id)
}

describe('creacion de perfil al registrarse', () => {
  it('un registro normal como comprador crea el perfil con rol comprador', async () => {
    const correo = 'nuevo-comprador@prueba.test'
    await borrarSiExiste(correo)

    const { data, error } = await clienteAnonimo().auth.signUp({
      email: correo,
      password: 'ClaveDePrueba123!',
      options: { data: { nombre: 'Nuevo Comprador', telefono: '3001112233', rol_solicitado: 'comprador' } },
    })
    expect(error).toBeNull()

    const { data: perfil } = await clienteAdmin()
      .from('perfiles').select('rol, nombre').eq('id', data.user!.id).single()
    expect(perfil!.rol).toBe('comprador')
    expect(perfil!.nombre).toBe('Nuevo Comprador')
  })

  it('un registro como vendedor crea el perfil con rol vendedor', async () => {
    const correo = 'nuevo-vendedor@prueba.test'
    await borrarSiExiste(correo)

    const { data } = await clienteAnonimo().auth.signUp({
      email: correo,
      password: 'ClaveDePrueba123!',
      options: { data: { nombre: 'Nuevo Vendedor', telefono: '3001112244', rol_solicitado: 'vendedor' } },
    })

    const { data: perfil } = await clienteAdmin()
      .from('perfiles').select('rol').eq('id', data.user!.id).single()
    expect(perfil!.rol).toBe('vendedor')
  })

  it('inyectar rol_solicitado super_admin produce un comprador', async () => {
    const correo = 'atacante@prueba.test'
    await borrarSiExiste(correo)

    const { data } = await clienteAnonimo().auth.signUp({
      email: correo,
      password: 'ClaveDePrueba123!',
      options: { data: { nombre: 'Atacante', telefono: '3009998877', rol_solicitado: 'super_admin' } },
    })

    const { data: perfil } = await clienteAdmin()
      .from('perfiles').select('rol').eq('id', data.user!.id).single()
    expect(perfil!.rol).toBe('comprador')
  })

  it('un rol_solicitado basura produce un comprador', async () => {
    const correo = 'basura@prueba.test'
    await borrarSiExiste(correo)

    const { data } = await clienteAnonimo().auth.signUp({
      email: correo,
      password: 'ClaveDePrueba123!',
      options: { data: { nombre: 'Basura', telefono: '3009998866', rol_solicitado: '; DROP TABLE perfiles;--' } },
    })

    const { data: perfil } = await clienteAdmin()
      .from('perfiles').select('rol').eq('id', data.user!.id).single()
    expect(perfil!.rol).toBe('comprador')
  })
})
