import { describe, it, expect, beforeEach } from 'vitest'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const CORREO = 'limite@prueba.test'
const IP = '203.0.113.5'

describe('limite de intentos de login', () => {
  beforeEach(async () => {
    await clienteAdmin().from('intentos_login').delete().eq('correo', CORREO)
  })

  it('no bloquea sin intentos previos', async () => {
    const { data } = await clienteAdmin().rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(data).toBe(false)
  })

  it('no bloquea con 4 fallos', async () => {
    for (let i = 0; i < 4; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    }
    const { data } = await clienteAdmin().rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(data).toBe(false)
  })

  it('bloquea al quinto fallo', async () => {
    for (let i = 0; i < 5; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    }
    const { data } = await clienteAdmin().rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(data).toBe(true)
  })

  it('no bloquea la misma cuenta desde otra IP', async () => {
    for (let i = 0; i < 5; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    }
    const { data } = await clienteAdmin().rpc('login_bloqueado', { p_correo: CORREO, p_ip: '198.51.100.9' })
    expect(data).toBe(false)
  })

  it('un usuario autenticado no puede leer la tabla de intentos', async () => {
    // Control positivo: se registra un intento y se prueba que el admin
    // (service_role, que ignora RLS) SI lo ve. Sin este paso, la aserción
    // de longitud 0 de mas abajo seria identica si la tabla estuviera
    // simplemente vacia, y no probaria nada sobre el ocultamiento por RLS.
    await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    const { data: comoAdmin, error: errorAdmin } = await clienteAdmin()
      .from('intentos_login').select('id').eq('correo', CORREO)
    expect(errorAdmin).toBeNull()
    expect(comoAdmin).toHaveLength(1)

    const cuenta = { correo: 'curioso@prueba.test', password: 'ClaveDePrueba123!' }
    await crearUsuarioDePrueba({ ...cuenta, rol: 'comprador' })
    const cliente = await clienteComo(cuenta.correo, cuenta.password)
    const { data, error } = await cliente.from('intentos_login').select('id')
    // RLS esta activa y no hay ninguna politica de SELECT: un SELECT no
    // tiene WITH CHECK que violar, asi que no hay error (verificado contra
    // la base real) -- simplemente no se devuelve ninguna fila. El control
    // positivo de arriba es lo que prueba que esto es ocultamiento por RLS
    // y no una tabla vacia.
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })
})
