import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { clienteAdmin, clienteAnonimo, clienteComo, crearUsuarioDePrueba, URL_BASE_DE_DATOS } from './ayudantes'

/**
 * Fija los privilegios de la migracion 20260909000100_historial_rutas_publicas:
 * la tabla rutas_publicas_propiedad (solo lectura para anon/authenticated,
 * lectura y escritura para service_role) y la funcion registrar_ruta_publica()
 * (sin EXECUTE para nadie salvo el dueno y service_role). Sin esta prueba nada
 * impide que una migracion futura reabra ese permiso en silencio -- que es
 * exactamente como se colo un critico en SP0: el REVOKE de aquella vez no
 * incluia PUBLIC, y Postgres concede EXECUTE a PUBLIC por defecto en toda
 * funcion nueva.
 *
 * La tabla se comprueba con los clientes normales de Supabase (el mismo
 * camino que usa la app de verdad, vía PostgREST). Los mensajes de error se
 * comprueban ademas del codigo: con RLS activada y sin politica de escritura,
 * un GRANT INSERT/UPDATE/DELETE concedido por error a anon NO cambia el
 * codigo (sigue siendo 42501, ahora por la politica en vez de por el GRANT de
 * tabla), pero SI cambia el mensaje de "permission denied for table" a "new
 * row violates row-level security policy". Comprobado a mano contra la base
 * real. Sin el mensaje, esa regresion pasaria la prueba en verde.
 *
 * La funcion NO se puede probar por el mismo camino: es RETURNS trigger, y
 * PostgREST directamente la excluye de su cache de esquema para TODOS los
 * roles por igual (comprobado contra la API real: incluso service_role recibe
 * PGRST202 "no encontrada" al invocarla por RPC HTTP). Esa exclusion no
 * distingue privilegios, asi que probarla por RPC de PostgREST no comprobaria
 * el REVOKE de esta migracion. Se abre entonces una conexion Postgres directa
 * y se hace SET ROLE para invocarla como la invocaria alguien con credenciales
 * de base de datos, o una migracion futura que le cambie el tipo de retorno y
 * la vuelva a exponer por RPC.
 */

const RUTA_DE_PRUEBA = `/prueba-privilegios/${randomUUID()}`

describe('privilegios de rutas_publicas_propiedad y registrar_ruta_publica', () => {
  let base: Client
  let correoAutenticado: string
  let passwordAutenticado: string

  beforeAll(async () => {
    base = new Client({ connectionString: URL_BASE_DE_DATOS })
    await base.connect()

    correoAutenticado = `rutas-privilegios-${randomUUID()}@prueba.test`
    passwordAutenticado = 'RutasPrivilegios2026*'
    await crearUsuarioDePrueba({ correo: correoAutenticado, password: passwordAutenticado, rol: 'comprador' })
  })

  afterAll(async () => {
    // Por si alguna aserción reventó a mitad del test y dejó basura o un ROLE
    // sin resetear.
    await base.query('RESET ROLE').catch(() => {})
    await clienteAdmin().from('rutas_publicas_propiedad').delete().eq('ruta', RUTA_DE_PRUEBA)
    await base.end()
    const { data } = await clienteAdmin().auth.admin.listUsers({ perPage: 200 })
    const usuario = data.users.find((u) => u.email === correoAutenticado)
    if (usuario) await clienteAdmin().auth.admin.deleteUser(usuario.id)
  })

  it('anon no puede insertar, actualizar ni borrar en rutas_publicas_propiedad, pero service_role si', async () => {
    const idOriginal = randomUUID()
    const idNuevo = randomUUID()

    const insertAnon = await clienteAnonimo()
      .from('rutas_publicas_propiedad')
      .insert({ ruta: RUTA_DE_PRUEBA, propiedad_id: idOriginal })
    expect(insertAnon.error?.code).toBe('42501')
    expect(insertAnon.error?.message).toMatch(/permission denied for table/)

    // Caso positivo: la misma fila, con service_role, si se crea. Sin esto,
    // la aserción de arriba pasaría igual aunque la tabla no existiera.
    const insertAdmin = await clienteAdmin()
      .from('rutas_publicas_propiedad')
      .insert({ ruta: RUTA_DE_PRUEBA, propiedad_id: idOriginal })
    expect(insertAdmin.error).toBeNull()

    const updateAnon = await clienteAnonimo()
      .from('rutas_publicas_propiedad')
      .update({ propiedad_id: idNuevo })
      .eq('ruta', RUTA_DE_PRUEBA)
    expect(updateAnon.error?.code).toBe('42501')
    expect(updateAnon.error?.message).toMatch(/permission denied for table/)

    const updateAdmin = await clienteAdmin()
      .from('rutas_publicas_propiedad')
      .update({ propiedad_id: idNuevo })
      .eq('ruta', RUTA_DE_PRUEBA)
    expect(updateAdmin.error).toBeNull()
    const verificacion = await clienteAdmin()
      .from('rutas_publicas_propiedad')
      .select('propiedad_id')
      .eq('ruta', RUTA_DE_PRUEBA)
      .single()
    expect(verificacion.data?.propiedad_id).toBe(idNuevo)

    const deleteAnon = await clienteAnonimo().from('rutas_publicas_propiedad').delete().eq('ruta', RUTA_DE_PRUEBA)
    expect(deleteAnon.error?.code).toBe('42501')
    expect(deleteAnon.error?.message).toMatch(/permission denied for table/)

    const deleteAdmin = await clienteAdmin().from('rutas_publicas_propiedad').delete().eq('ruta', RUTA_DE_PRUEBA)
    expect(deleteAdmin.error).toBeNull()
    const trasBorrar = await clienteAdmin().from('rutas_publicas_propiedad').select('ruta').eq('ruta', RUTA_DE_PRUEBA)
    expect(trasBorrar.data ?? []).toEqual([])
  })

  it('un usuario autenticado (sin rol especial) tampoco puede escribir en rutas_publicas_propiedad', async () => {
    const cliente = await clienteComo(correoAutenticado, passwordAutenticado)
    const id = randomUUID()

    const insertar = await cliente.from('rutas_publicas_propiedad').insert({ ruta: RUTA_DE_PRUEBA, propiedad_id: id })
    expect(insertar.error?.code).toBe('42501')
    expect(insertar.error?.message).toMatch(/permission denied for table/)

    const actualizar = await cliente
      .from('rutas_publicas_propiedad')
      .update({ propiedad_id: id })
      .eq('ruta', RUTA_DE_PRUEBA)
    expect(actualizar.error?.code).toBe('42501')
    expect(actualizar.error?.message).toMatch(/permission denied for table/)

    const borrar = await cliente.from('rutas_publicas_propiedad').delete().eq('ruta', RUTA_DE_PRUEBA)
    expect(borrar.error?.code).toBe('42501')
    expect(borrar.error?.message).toMatch(/permission denied for table/)

    // Caso positivo: con service_role la misma fila si se puede crear y
    // borrar, asi que lo que falla arriba es el privilegio del rol
    // autenticado y no, por ejemplo, una tabla que ya no existe.
    const insertarAdmin = await clienteAdmin()
      .from('rutas_publicas_propiedad')
      .insert({ ruta: RUTA_DE_PRUEBA, propiedad_id: id })
    expect(insertarAdmin.error).toBeNull()
    const borrarAdmin = await clienteAdmin().from('rutas_publicas_propiedad').delete().eq('ruta', RUTA_DE_PRUEBA)
    expect(borrarAdmin.error).toBeNull()
  })

  it('anon no puede ejecutar registrar_ruta_publica', async () => {
    await base.query('SET ROLE anon')
    try {
      await expect(base.query('SELECT public.registrar_ruta_publica()')).rejects.toMatchObject({
        code: '42501',
        message: expect.stringContaining('permission denied for function'),
      })
    } finally {
      await base.query('RESET ROLE')
    }
  })

  it('un usuario autenticado tampoco puede ejecutar registrar_ruta_publica, y service_role si tiene el permiso', async () => {
    await base.query('SET ROLE authenticated')
    try {
      await expect(base.query('SELECT public.registrar_ruta_publica()')).rejects.toMatchObject({
        code: '42501',
        message: expect.stringContaining('permission denied for function'),
      })
    } finally {
      await base.query('RESET ROLE')
    }

    // Caso positivo. registrar_ruta_publica() es RETURNS trigger: Postgres no
    // deja invocarla directamente fuera de un disparador ni para el dueño de
    // la base, así que "funciona" no puede significar "no da ningún error".
    // Lo que prueba que el permiso SI está concedido es que el error cambia
    // de naturaleza: para anon/authenticated el chequeo de EXECUTE corta la
    // llamada antes de intentar nada (42501, permission denied). Para
    // service_role el chequeo de EXECUTE pasa y el error que queda es el
    // estructural de Postgres por llamarla fuera de un disparador (0A000).
    // Si esta migración desapareciera, los tres roles recibirían en cambio
    // 42883 (la función no existe) y esta aserción -- igual que las dos de
    // arriba -- se pondría roja.
    await base.query('SET ROLE service_role')
    try {
      await expect(base.query('SELECT public.registrar_ruta_publica()')).rejects.toMatchObject({
        code: '0A000',
        message: expect.stringContaining('trigger functions can only be called as triggers'),
      })
    } finally {
      await base.query('RESET ROLE')
    }
  })

  it('el disparador registrar_ruta_publica si funciona de punta a punta para las escrituras de service_role', async () => {
    // Complementa el caso positivo de arriba con la prueba de que la función
    // no solo "tiene permiso": de verdad hace su trabajo cuando quien escribe
    // en propiedades es service_role, que es como la aplicación publica de
    // verdad. Este es el mismo recorrido que tests/rls/rutas-publicas.test.ts
    // ejercita con más detalle; aquí solo hace falta la mínima evidencia de
    // que existe una función, no una tabla vacía, detrás del permiso probado.
    const admin = clienteAdmin()
    const usuario = await crearUsuarioDePrueba({
      correo: `rutas-privilegios-vendedor-${randomUUID()}@prueba.test`,
      password: 'RutasPrivilegiosVendedor2026*',
      rol: 'vendedor',
    })
    let propiedadId = ''
    try {
      const { data: barrio, error: eBarrio } = await admin
        .from('barrios')
        .select('id,slug')
        .eq('activo', true)
        .limit(1)
        .single()
      if (eBarrio) throw eBarrio
      const slug = `rutas-privilegios-${randomUUID()}`
      const ruta = `/${barrio.slug}/${slug}`
      const { data: propiedad, error: eCrear } = await admin
        .from('propiedades')
        .insert({
          vendedor_id: usuario,
          barrio_id: barrio.id,
          slug,
          titulo: 'Casa prueba privilegios de rutas',
          descripcion: '',
          precio: 100000000,
          operacion: 'venta',
          tipo_inmueble: 'casa',
        })
        .select('id')
        .single()
      if (eCrear) throw eCrear
      propiedadId = propiedad.id

      const { error: eImagen } = await admin.from('imagenes_propiedad').insert({
        propiedad_id: propiedadId,
        ruta_storage: `${usuario}/${propiedadId}/privilegios.webp`,
        alt_text: 'Foto prueba privilegios',
        orden: 0,
      })
      if (eImagen) throw eImagen

      const { error: ePublicar } = await admin.from('propiedades').update({ estado: 'publicada' }).eq('id', propiedadId)
      if (ePublicar) throw ePublicar

      const { data: fila, error: eFila } = await admin
        .from('rutas_publicas_propiedad')
        .select('ruta,propiedad_id')
        .eq('ruta', ruta)
        .single()
      expect(eFila).toBeNull()
      expect(fila).toEqual({ ruta, propiedad_id: propiedadId })
    } finally {
      if (propiedadId) {
        await admin.from('propiedades').delete().eq('id', propiedadId)
        await admin.from('rutas_publicas_propiedad').delete().eq('propiedad_id', propiedadId)
        await admin.from('limpieza_almacenamiento').delete().eq('ruta', `${usuario}/${propiedadId}/privilegios.webp`)
      }
      await admin.auth.admin.deleteUser(usuario)
    }
  })
})
