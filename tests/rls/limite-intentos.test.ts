import { describe, it, expect, beforeEach } from 'vitest'
import { clienteAnonimo, clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

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

  // Sin esta prueba, una funcion que filtrara SOLO por ip pasaria todo lo anterior:
  // las demas pruebas varian la IP pero nunca el correo. La combinacion es el diseno.
  it('no bloquea otra cuenta desde la misma IP', async () => {
    const otroCorreo = 'otro-usuario@prueba.test'
    await clienteAdmin().from('intentos_login').delete().eq('correo', otroCorreo)

    for (let i = 0; i < 5; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    }

    const { data: bloqueadoOriginal } = await clienteAdmin()
      .rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(bloqueadoOriginal).toBe(true)

    const { data: bloqueadoOtro } = await clienteAdmin()
      .rpc('login_bloqueado', { p_correo: otroCorreo, p_ip: IP })
    expect(bloqueadoOtro).toBe(false)
  })

  // La rama IF p_exitoso THEN DELETE de registrar_intento_login no tenia cobertura:
  // todas las demas pruebas registran fallos. Un borrado de esa rama pasaria inadvertido.
  it('un login exitoso limpia los fallos previos de esa combinacion', async () => {
    for (let i = 0; i < 5; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    }
    const { data: antes } = await clienteAdmin().rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(antes).toBe(true)

    await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: true })

    const { data: despues } = await clienteAdmin().rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(despues).toBe(false)
  })

  // El REVOKE original solo nombraba a anon y authenticated. Postgres concede
  // EXECUTE a PUBLIC por defecto, y revocar de un rol no le quita lo heredado
  // via PUBLIC: ambas funciones (SECURITY DEFINER) quedaban invocables sin
  // autenticar por RPC. Verificado contra la base antes del arreglo: los dos
  // POST anonimos devolvian 204 y 200.
  //
  // Cada prueba lleva su caso positivo con service_role EN EL MISMO test: sin
  // el, un 42501 se veria igual si la funcion hubiera desaparecido o cambiado
  // de firma, y la prueba pasaria sin demostrar nada sobre los privilegios.
  it('el cliente anonimo NO puede ejecutar registrar_intento_login por RPC', async () => {
    const argumentos = { p_correo: CORREO, p_ip: IP, p_exitoso: false }

    const { error } = await clienteAnonimo().rpc('registrar_intento_login', argumentos)
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { error: errorAdmin } = await clienteAdmin().rpc('registrar_intento_login', argumentos)
    expect(errorAdmin).toBeNull()
  })

  it('el cliente anonimo NO puede ejecutar login_bloqueado por RPC', async () => {
    const argumentos = { p_correo: CORREO, p_ip: IP }

    const { error } = await clienteAnonimo().rpc('login_bloqueado', argumentos)
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data, error: errorAdmin } = await clienteAdmin().rpc('login_bloqueado', argumentos)
    expect(errorAdmin).toBeNull()
    expect(data).toBe(false)
  })

  // authenticated tampoco: el REVOKE lo nombra explicitamente ademas de PUBLIC,
  // y un usuario con sesion es tan capaz de bloquear cuentas ajenas como uno
  // anonimo. Sin esta prueba, un REVOKE que solo quitara PUBLIC dejando un
  // GRANT a authenticated pasaria las dos de arriba.
  it('un usuario autenticado tampoco puede ejecutar las funciones por RPC', async () => {
    const cuenta = { correo: 'rpc-curioso@prueba.test', password: 'ClaveDePrueba123!' }
    await crearUsuarioDePrueba({ ...cuenta, rol: 'comprador' })
    const cliente = await clienteComo(cuenta.correo, cuenta.password)

    const { error: errorRegistrar } = await cliente
      .rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    expect(errorRegistrar?.code).toBe('42501')

    const { error: errorConsulta } = await cliente
      .rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(errorConsulta?.code).toBe('42501')

    const { error: errorAdmin } = await clienteAdmin()
      .rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(errorAdmin).toBeNull()
  })

  /**
   * Modo degradado del hallazgo I3.
   *
   * Cuando no hay una IP de confianza, la aplicacion pasa NULL en vez de
   * inventarse una. Estas dos pruebas fijan lo que NULL significa en la base:
   * ventana por correo, sin discriminar IP. Es un limite mas estricto, no mas
   * laxo -- y "mas laxo" es justo el fallo que habria que detectar, porque
   * dejaria el modo degradado como un bypass del limitador.
   */
  it('con IP desconocida la ventana cuenta los fallos del correo desde cualquier IP', async () => {
    // Cinco fallos repartidos entre dos IPs distintas: con la ventana normal
    // ninguna de las dos combinaciones llega al limite.
    for (let i = 0; i < 3; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    }
    for (let i = 0; i < 2; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: '198.51.100.9', p_exitoso: false })
    }

    // Control: por separado, ninguna de las dos IPs esta bloqueada.
    const { data: porIpUno } = await clienteAdmin()
      .rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    const { data: porIpDos } = await clienteAdmin()
      .rpc('login_bloqueado', { p_correo: CORREO, p_ip: '198.51.100.9' })
    expect(porIpUno).toBe(false)
    expect(porIpDos).toBe(false)

    // Sin IP de confianza, los cinco cuentan juntos y la cuenta queda cerrada.
    const { data: sinIp, error } = await clienteAdmin()
      .rpc('login_bloqueado', { p_correo: CORREO, p_ip: null })
    expect(error).toBeNull()
    expect(sinIp).toBe(true)

    // Y sigue siendo por correo: otra cuenta no se ve arrastrada.
    const { data: otroCorreo } = await clienteAdmin()
      .rpc('login_bloqueado', { p_correo: 'ajeno@prueba.test', p_ip: null })
    expect(otroCorreo).toBe(false)
  })

  // `ip = p_ip` con p_ip NULL no es falso, es NULL: nunca cierto. Si el DELETE
  // de limpieza no llevara el `(p_ip IS NULL OR ...)`, la ventana de un usuario
  // legitimo no se vaciaria jamas en modo degradado y el bloqueo seria
  // permanente. Es un fallo que no se ve hasta que le pasa a alguien.
  it('un login exitoso sin IP limpia la ventana por correo', async () => {
    for (let i = 0; i < 3; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    }
    for (let i = 0; i < 2; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: null, p_exitoso: false })
    }
    const { data: antes } = await clienteAdmin()
      .rpc('login_bloqueado', { p_correo: CORREO, p_ip: null })
    expect(antes).toBe(true)

    const { error } = await clienteAdmin()
      .rpc('registrar_intento_login', { p_correo: CORREO, p_ip: null, p_exitoso: true })
    expect(error).toBeNull()

    const { data: despues } = await clienteAdmin()
      .rpc('login_bloqueado', { p_correo: CORREO, p_ip: null })
    expect(despues).toBe(false)
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
