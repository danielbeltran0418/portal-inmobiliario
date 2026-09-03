import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAdmin, clienteAnonimo, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const COMPRADOR = { correo: 'aud-comprador@prueba.test', password: 'ClaveDePrueba123!' }
const ADMIN = { correo: 'aud-admin@prueba.test', password: 'ClaveDePrueba123!' }
// Etiqueta unica por corrida: el conteo exacto no puede depender de cuantas
// filas ya existan en la tabla (la suite puede correrse varias veces sin
// `db reset` entre medio, y desde el hallazgo I5 SI hay escritores reales de
// auditoria: el trigger de registro y el limitador de intentos escriben en
// cada prueba de las demas suites). Filtrando por esta etiqueta, la prueba
// solo mira la fila que ESTA corrida inserto.
const ACCION_DE_ESTA_CORRIDA = `prueba-${Date.now()}`
const SUFIJO = `${Date.now()}`

describe('RLS de registro_auditoria', () => {
  beforeAll(async () => {
    await crearUsuarioDePrueba({ ...COMPRADOR, rol: 'comprador' })
    await crearUsuarioDePrueba({ ...ADMIN, rol: 'super_admin' })
    await clienteAdmin().from('registro_auditoria').insert({
      accion: ACCION_DE_ESTA_CORRIDA, entidad: 'sistema', metadatos: { detalle: 'evento de prueba' },
    })
  })

  it('el comprador NO lee el registro de auditoria', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { data } = await cliente.from('registro_auditoria')
      .select('id').eq('accion', ACCION_DE_ESTA_CORRIDA)
    expect(data ?? []).toHaveLength(0)
  })

  it('el super admin SI lee el registro', async () => {
    // Control positivo del caso anterior: prueba que la fila existe y que
    // solo esta oculta para el comprador, no que este ausente para todos.
    // Conteo exacto sobre la fila de ESTA corrida (identificada por
    // ACCION_DE_ESTA_CORRIDA), no sobre el total de la tabla: asi la
    // asercion sigue siendo precisa aunque la suite corra dos veces
    // seguidas sin `db reset`, o aunque otra fuente ya haya escrito en
    // registro_auditoria antes de este describe.
    const cliente = await clienteComo(ADMIN.correo, ADMIN.password)
    const { data } = await cliente.from('registro_auditoria')
      .select('id').eq('accion', ACCION_DE_ESTA_CORRIDA)
    expect(data).toHaveLength(1)
  })

  it('el comprador NO puede escribir en el registro', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { error } = await cliente.from('registro_auditoria')
      .insert({ accion: 'falsificada', entidad: 'sistema' })
    expect(error).not.toBeNull()
    // 42501 (insufficient_privilege), igual que en propiedades/barrios/imagenes.
    //
    // Ojo con lo que este 42501 significa hoy y lo que significaba antes: hasta
    // 20260831000700, authenticated SI tenia el INSERT de tabla (el ALTER
    // DEFAULT PRIVILEGES de fabrica de Supabase se lo daba, pese al comentario
    // de 20260827000800), y lo que lo frenaba era RLS sin politica de INSERT,
    // que denuncia con el MISMO codigo. Desde esa migracion el privilegio ya no
    // esta, y el rechazo ocurre antes de mirar RLS. Las dos capas devuelven
    // 42501; la prueba de abajo es la que distingue que ahora hay dos.
    expect(error?.code).toBe('42501')
  })

  /**
   * Hallazgo I5: el comprador tampoco puede REESCRIBIR ni BORRAR lo auditado.
   *
   * No basta con cerrar el INSERT. Si un usuario pudiera hacer UPDATE o DELETE,
   * un atacante que dejara rastro reescribiria o borraria su propia fila y la
   * auditoria seria papel mojado igual que si no existiera.
   *
   * Y estas dos operaciones son justamente las que RLS NO rechazaba: la filtra
   * por la clausula USING, asi que sin politica el resultado es cero filas
   * afectadas y error NULO -- la operacion se acepta y no hace nada. Por eso
   * 20260831000700 le quita a authenticated el privilegio de tabla: es lo unico
   * que convierte esto en un 42501 de verdad.
   *
   * El .select() encadenado no es decorativo: sin el, un UPDATE que no afecta
   * filas devuelve error nulo y la prueba confundiria "no me dejaron" con "no
   * habia nada que actualizar".
   */
  it('el comprador NO puede modificar ni borrar lo ya auditado', async () => {
    const { data: fila } = await clienteAdmin().from('registro_auditoria')
      .select('id').eq('accion', ACCION_DE_ESTA_CORRIDA).single()

    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)

    const { error: errorUpdate } = await cliente.from('registro_auditoria')
      .update({ accion: 'reescrita' }).eq('id', fila!.id).select()
    expect(errorUpdate?.code).toBe('42501')

    const { error: errorDelete } = await cliente.from('registro_auditoria')
      .delete().eq('id', fila!.id).select()
    expect(errorDelete?.code).toBe('42501')

    // Caso positivo en el MISMO test: la fila existe, sigue ahi y es
    // actualizable -- lo unico que se interpone es el privilegio del
    // comprador. Sin esto, los dos 42501 se verian igual si la fila hubiera
    // desaparecido o si el id fuera erroneo.
    const { data: comoServidor, error: errorServidor } = await clienteAdmin()
      .from('registro_auditoria')
      .update({ accion: ACCION_DE_ESTA_CORRIDA }).eq('id', fila!.id).select()
    expect(errorServidor).toBeNull()
    expect(comoServidor).toHaveLength(1)
  })
})

/**
 * Hallazgo I5: hasta esta migracion nadie escribia en registro_auditoria.
 *
 * Todas estas pruebas provocan el evento REAL (un signUp contra GoTrue, el RPC
 * del limitador) y despues miran la tabla. Ninguna llama a
 * registrar_evento_auditoria para luego comprobar que la fila esta: eso solo
 * probaria que un INSERT inserta.
 */
describe('escritura de la auditoria', () => {
  it('un registro real deja la fila con el rol REALMENTE asignado', async () => {
    const correo = `aud-registro-${SUFIJO}@prueba.test`

    // rol_solicitado 'super_admin' a proposito: la lista blanca de
    // handle_new_user lo degrada a comprador, y lo que se comprueba aqui es
    // que la auditoria guarda los DOS valores. Una auditoria que copiara el
    // rol pedido en vez del asignado seria peor que ninguna: diria que se creo
    // un super_admin que no existe.
    const { data, error } = await clienteAnonimo().auth.signUp({
      email: correo,
      password: 'ClaveDePrueba123!',
      options: { data: { nombre: 'Registro Auditado', telefono: '3001234567', rol_solicitado: 'super_admin' } },
    })
    expect(error).toBeNull()
    const id = data.user!.id

    const { data: filas } = await clienteAdmin().from('registro_auditoria')
      .select('actor_id, accion, entidad, entidad_id, metadatos')
      .eq('accion', 'usuario_registrado').eq('entidad_id', id)
    expect(filas).toHaveLength(1)
    expect(filas![0].actor_id).toBe(id)
    expect(filas![0].entidad).toBe('perfiles')
    expect(filas![0].metadatos).toEqual({ rol_solicitado: 'super_admin', rol_asignado: 'comprador' })

    // Y el rol asignado que quedo auditado es el que de verdad tiene el perfil.
    const { data: perfil } = await clienteAdmin()
      .from('perfiles').select('rol').eq('id', id).single()
    expect(perfil!.rol).toBe('comprador')
  })

  it('un login fallido deja la fila, con el actor resuelto por correo', async () => {
    const correo = `aud-fallo-${SUFIJO}@prueba.test`
    const id = await crearUsuarioDePrueba({ correo, password: 'ClaveDePrueba123!', rol: 'vendedor' })

    const { error } = await clienteAdmin()
      .rpc('registrar_intento_login', { p_correo: correo, p_ip: '203.0.113.10', p_exitoso: false })
    expect(error).toBeNull()

    const { data: filas } = await clienteAdmin().from('registro_auditoria')
      .select('actor_id, accion, entidad, metadatos, ip')
      .eq('accion', 'login_fallido').contains('metadatos', { correo })
    expect(filas).toHaveLength(1)
    expect(filas![0].actor_id).toBe(id)
    expect(filas![0].entidad).toBe('sesion')
    expect(filas![0].ip).toBe('203.0.113.10')
    expect(filas![0].metadatos).toEqual({ correo, ip_confiable: true })

    // Contraste dentro del mismo test: el exito se distingue del fallo. Sin
    // esto, una funcion que escribiera siempre 'login_fallido' pasaria.
    await clienteAdmin()
      .rpc('registrar_intento_login', { p_correo: correo, p_ip: '203.0.113.10', p_exitoso: true })
    const { data: exitos } = await clienteAdmin().from('registro_auditoria')
      .select('actor_id').eq('accion', 'login_exitoso').contains('metadatos', { correo })
    expect(exitos).toHaveLength(1)
    expect(exitos![0].actor_id).toBe(id)
  })

  // Un intento contra un correo sin cuenta no tiene actor: el uuid queda NULL y
  // el correo vive solo en metadatos. Si en vez de eso se intentara insertar un
  // actor_id inventado, la FK a perfiles reventaria el INSERT con 23503 y se
  // llevaria por delante el registro del intento -- es decir, el limitador.
  it('un login fallido contra un correo sin cuenta se audita sin actor', async () => {
    const correo = `aud-inexistente-${SUFIJO}@prueba.test`

    const { error } = await clienteAdmin()
      .rpc('registrar_intento_login', { p_correo: correo, p_ip: null, p_exitoso: false })
    expect(error).toBeNull()

    const { data: filas } = await clienteAdmin().from('registro_auditoria')
      .select('actor_id, ip, metadatos')
      .eq('accion', 'login_fallido').contains('metadatos', { correo })
    expect(filas).toHaveLength(1)
    expect(filas![0].actor_id).toBeNull()
    expect(filas![0].ip).toBeNull()
    expect(filas![0].metadatos).toEqual({ correo, ip_confiable: false })
  })

  /**
   * El bloqueo se audita en el CRUCE del umbral: una sola vez, en el quinto
   * fallo. Seis llamadas, no cinco, precisamente para que una implementacion
   * que escribiera una fila por cada fallo a partir del quinto -- perdiendo el
   * dato con valor, que es CUANDO se cerro la cuenta -- salga en rojo aqui.
   */
  it('el bloqueo por limite de intentos se registra una sola vez', async () => {
    const correo = `aud-bloqueo-${SUFIJO}@prueba.test`
    const ip = '203.0.113.11'

    for (let i = 0; i < 4; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: correo, p_ip: ip, p_exitoso: false })
    }
    // Control del umbral: con cuatro fallos la cuenta NO esta bloqueada y no
    // hay ninguna fila de bloqueo todavia.
    const { data: bloqueadoAlCuarto } = await clienteAdmin()
      .rpc('login_bloqueado', { p_correo: correo, p_ip: ip })
    expect(bloqueadoAlCuarto).toBe(false)
    const { data: sinBloqueo } = await clienteAdmin().from('registro_auditoria')
      .select('id').eq('accion', 'bloqueo_por_intentos').contains('metadatos', { correo })
    expect(sinBloqueo ?? []).toHaveLength(0)

    for (let i = 0; i < 2; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: correo, p_ip: ip, p_exitoso: false })
    }

    const { data: bloqueos } = await clienteAdmin().from('registro_auditoria')
      .select('accion, ip, metadatos').eq('accion', 'bloqueo_por_intentos')
      .contains('metadatos', { correo })
    expect(bloqueos).toHaveLength(1)
    expect(bloqueos![0].ip).toBe(ip)
    expect(bloqueos![0].metadatos).toEqual({ correo, ip_confiable: true, minutos_bloqueo: 15 })

    // Y los seis fallos si quedaron auditados uno a uno: el bloqueo es un
    // evento aparte, no un sustituto del registro del intento.
    const { data: fallos } = await clienteAdmin().from('registro_auditoria')
      .select('id').eq('accion', 'login_fallido').contains('metadatos', { correo })
    expect(fallos).toHaveLength(6)
  })

  /**
   * Mismo patron de permisos que las funciones del limitador (20260831000100):
   * REVOKE ... FROM PUBLIC, anon, authenticated + GRANT a service_role.
   *
   * Revocar solo de anon y authenticated no sirve: Postgres concede EXECUTE a
   * PUBLIC por defecto y un rol conserva lo que hereda de ahi. Ese error ya
   * costo un critico en este proyecto.
   *
   * El caso positivo con service_role va EN EL MISMO test: sin el, un 42501 se
   * veria identico si la funcion no existiera o hubiera cambiado de firma.
   */
  it('el cliente anonimo NO puede invocar registrar_evento_auditoria por RPC', async () => {
    const accion = `intrusion-anon-${SUFIJO}`
    const argumentos = { p_accion: accion, p_entidad: 'sistema' }

    const { error } = await clienteAnonimo().rpc('registrar_evento_auditoria', argumentos)
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    // Nada llego a escribirse.
    const { data: tras } = await clienteAdmin().from('registro_auditoria')
      .select('id').eq('accion', accion)
    expect(tras ?? []).toHaveLength(0)

    // Caso positivo: la misma llamada, con service_role, si escribe.
    const { error: errorAdmin } = await clienteAdmin().rpc('registrar_evento_auditoria', argumentos)
    expect(errorAdmin).toBeNull()
    const { data: escrita } = await clienteAdmin().from('registro_auditoria')
      .select('id').eq('accion', accion)
    expect(escrita).toHaveLength(1)
  })

  it('un usuario autenticado tampoco puede invocarla por RPC', async () => {
    const accion = `intrusion-auth-${SUFIJO}`
    const cuenta = { correo: `aud-curioso-${SUFIJO}@prueba.test`, password: 'ClaveDePrueba123!' }
    await crearUsuarioDePrueba({ ...cuenta, rol: 'comprador' })
    const cliente = await clienteComo(cuenta.correo, cuenta.password)

    const { error } = await cliente
      .rpc('registrar_evento_auditoria', { p_accion: accion, p_entidad: 'sistema' })
    expect(error?.code).toBe('42501')

    const { data: tras } = await clienteAdmin().from('registro_auditoria')
      .select('id').eq('accion', accion)
    expect(tras ?? []).toHaveLength(0)

    // Caso positivo: con service_role la misma llamada funciona, asi que lo
    // que falla arriba es el privilegio del usuario y no la funcion.
    const { error: errorAdmin } = await clienteAdmin()
      .rpc('registrar_evento_auditoria', { p_accion: accion, p_entidad: 'sistema' })
    expect(errorAdmin).toBeNull()
  })
})
