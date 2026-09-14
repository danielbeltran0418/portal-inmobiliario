import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteAnonimo, clienteComo, crearUsuarioDePrueba } from './ayudantes'

/**
 * Privilegios y RLS de propiedades_ubicacion (20260914000100), la tabla que
 * reemplaza direccion/latitud/longitud como columnas de `propiedades` (ver el
 * comentario de esa migracion y tests/rls/propiedades.test.ts).
 *
 * A diferencia de leads_contacto (tests/rls/leads.test.ts), donde
 * `authenticated` no tiene NINGUN privilegio y solo entra service_role, aqui
 * `authenticated` SI tiene el GRANT de tabla completo (el dueno lo necesita
 * para leer/escribir la suya) y la proteccion es enteramente RLS por fila.
 * Eso cambia la forma del error esperado: `anon` (sin GRANT alguno, REVOKE
 * ALL) recibe 42501 en cualquier operacion; un `authenticated` ajeno sin fila
 * visible recibe la "trampa de PostgREST" que documenta el brief -- SELECT y
 * UPDATE/DELETE devuelven 0 filas SIN error, e INSERT si devuelve 42501
 * porque el WITH CHECK rechaza la fila explicitamente.
 */
describe('privilegios y RLS de propiedades_ubicacion', () => {
  it('anon no lee ni escribe la ubicacion de ninguna propiedad', async () => {
    const anon = clienteAnonimo()
    const admin = clienteAdmin()

    const vendedorId = await crearUsuarioDePrueba({
      correo: `ubicacion-anon-vendedor-${randomUUID()}@prueba.test`,
      password: 'UbicacionAnonVendedor2026*',
      rol: 'vendedor',
    })
    const { data: propiedad, error: errorPropiedad } = await admin
      .from('propiedades')
      .insert({
        vendedor_id: vendedorId,
        slug: `ubicacion-anon-${randomUUID()}`,
        titulo: 'Casa de prueba de privilegios de ubicacion',
        descripcion: 'Descripcion de prueba',
        operacion: 'venta',
        tipo_inmueble: 'casa',
        precio: 100000,
      })
      .select('id')
      .single()
    if (errorPropiedad) throw errorPropiedad

    const { error: errorUbicacion } = await admin.from('propiedades_ubicacion').insert({
      propiedad_id: propiedad.id, direccion: 'Calle Anonima 1', latitud: 10, longitud: -74,
    })
    if (errorUbicacion) throw errorUbicacion

    const leer = await anon
      .from('propiedades_ubicacion').select('direccion').eq('propiedad_id', propiedad.id)
    expect(leer.error?.code).toBe('42501')
    expect(leer.data ?? []).toHaveLength(0)

    const insertar = await anon
      .from('propiedades_ubicacion').insert({ propiedad_id: randomUUID(), direccion: 'X' })
    expect(insertar.error?.code).toBe('42501')

    const actualizar = await anon
      .from('propiedades_ubicacion').update({ direccion: 'Y' }).eq('propiedad_id', propiedad.id)
    expect(actualizar.error?.code).toBe('42501')

    const borrar = await anon
      .from('propiedades_ubicacion').delete().eq('propiedad_id', propiedad.id)
    expect(borrar.error?.code).toBe('42501')

    // Caso positivo: sin el, las cuatro denegaciones de arriba pasarian igual
    // si la tabla no existiera o el nombre de columna estuviera mal escrito.
    // service_role si puede leer la fila real.
    const { data: comoAdmin, error: errorComoAdmin } = await admin
      .from('propiedades_ubicacion').select('direccion').eq('propiedad_id', propiedad.id).single()
    expect(errorComoAdmin).toBeNull()
    expect(comoAdmin!.direccion).toBe('Calle Anonima 1')
  })

  it('un autenticado ajeno no puede escribir la ubicacion de una propiedad que no es suya', async () => {
    const admin = clienteAdmin()

    const correoDueno = `ubicacion-dueno-${randomUUID()}@prueba.test`
    const passwordDueno = 'UbicacionDueno2026*'
    const duenoId = await crearUsuarioDePrueba({ correo: correoDueno, password: passwordDueno, rol: 'vendedor' })
    const dueno = await clienteComo(correoDueno, passwordDueno)

    const { data: propiedad, error: errorPropiedad } = await admin
      .from('propiedades')
      .insert({
        vendedor_id: duenoId,
        slug: `ubicacion-ajeno-${randomUUID()}`,
        titulo: 'Casa de prueba de escritura ajena',
        descripcion: 'Descripcion de prueba',
        operacion: 'venta',
        tipo_inmueble: 'casa',
        precio: 100000,
      })
      .select('id')
      .single()
    if (errorPropiedad) throw errorPropiedad

    const correoAjeno = `ubicacion-ajeno-${randomUUID()}@prueba.test`
    const passwordAjeno = 'UbicacionAjeno2026*'
    await crearUsuarioDePrueba({ correo: correoAjeno, password: passwordAjeno, rol: 'comprador' })
    const ajeno = await clienteComo(correoAjeno, passwordAjeno)

    // INSERT: el ajeno SI tiene el GRANT de tabla, pero el WITH CHECK de
    // ubicacion_insercion_dueno exige vendedor_id = auth.uid() -- lo rechaza
    // con 42501 explicito, no con una fila filtrada en silencio.
    const insertarAjeno = await ajeno
      .from('propiedades_ubicacion').insert({ propiedad_id: propiedad.id, direccion: 'Direccion Secuestrada' })
    expect(insertarAjeno.error?.code).toBe('42501')

    // Caso positivo, misma operacion: el dueno SI puede crear su fila.
    const insertarDueno = await dueno
      .from('propiedades_ubicacion')
      .insert({ propiedad_id: propiedad.id, direccion: 'Calle Real 1' })
      .select('propiedad_id')
    expect(insertarDueno.error).toBeNull()
    expect(insertarDueno.data).toHaveLength(1)

    // UPDATE de un ajeno sobre una fila que SI existe: la trampa de
    // PostgREST que documenta el brief. RLS filtra por fila y, sin politica
    // aplicable, el UPDATE devuelve 0 filas SIN error -- no 42501 -- por eso
    // hace falta encadenar `.select()` y contar filas, no solo mirar `error`.
    const actualizarAjeno = await ajeno
      .from('propiedades_ubicacion')
      .update({ direccion: 'Secuestrada' })
      .eq('propiedad_id', propiedad.id)
      .select('propiedad_id')
    expect(actualizarAjeno.error).toBeNull()
    expect(actualizarAjeno.data ?? []).toHaveLength(0)

    // Misma trampa para DELETE.
    const borrarAjeno = await ajeno
      .from('propiedades_ubicacion')
      .delete()
      .eq('propiedad_id', propiedad.id)
      .select('propiedad_id')
    expect(borrarAjeno.error).toBeNull()
    expect(borrarAjeno.data ?? []).toHaveLength(0)

    // Caso positivo, misma operacion: el dueno SI puede actualizar su fila.
    const actualizarDueno = await dueno
      .from('propiedades_ubicacion')
      .update({ direccion: 'Calle Real 1 Actualizada' })
      .eq('propiedad_id', propiedad.id)
      .select('direccion')
    expect(actualizarDueno.error).toBeNull()
    expect(actualizarDueno.data).toHaveLength(1)
    expect(actualizarDueno.data![0]!.direccion).toBe('Calle Real 1 Actualizada')

    // Verificacion final contra la base, con admin: la direccion secuestrada
    // nunca se escribio ni se borro la fila del dueno.
    const { data: enLaBase } = await admin
      .from('propiedades_ubicacion').select('direccion').eq('propiedad_id', propiedad.id).single()
    expect(enLaBase!.direccion).toBe('Calle Real 1 Actualizada')
  })

  /**
   * Hallazgo Menor de la revision final de rama: las politicas
   * ubicacion_lectura_super_admin y ubicacion_actualizacion_super_admin
   * (20260914000100) no tenian ninguna prueba -- las dos de arriba solo
   * cubren dueno y ajeno sin rol especial. Sesion REAL de super_admin,
   * cuenta EFIMERA con randomUUID() (nunca la del seed, igual que el resto
   * de este archivo), sobre una propiedad de OTRO vendedor.
   *
   * El control negativo (un vendedor sin relacion alguna con la propiedad,
   * ni dueno ni admin) va en la MISMA prueba: sin el, una politica escrita
   * como `USING (true)` pasaria igual las aserciones del super_admin -- ver
   * el mismo razonamiento en tests/rls/imagenes.test.ts ("moderacion del
   * super_admin").
   */
  it('el super_admin lee y actualiza la ubicacion de una propiedad ajena; un vendedor sin relacion no la lee', async () => {
    const admin = clienteAdmin()

    const correoDueno = `ubicacion-superadmin-dueno-${randomUUID()}@prueba.test`
    const passwordDueno = 'UbicacionSuperadminDueno2026*'
    const duenoId = await crearUsuarioDePrueba({ correo: correoDueno, password: passwordDueno, rol: 'vendedor' })

    const { data: propiedad, error: errorPropiedad } = await admin
      .from('propiedades')
      .insert({
        vendedor_id: duenoId,
        slug: `ubicacion-superadmin-${randomUUID()}`,
        titulo: 'Casa de prueba de moderacion de ubicacion',
        descripcion: 'Descripcion de prueba',
        operacion: 'venta',
        tipo_inmueble: 'casa',
        precio: 100000,
      })
      .select('id')
      .single()
    if (errorPropiedad) throw errorPropiedad

    const { error: errorUbicacion } = await admin.from('propiedades_ubicacion').insert({
      propiedad_id: propiedad.id, direccion: 'Carrera 50 # 80-20', latitud: 11.24, longitud: -74.2,
    })
    if (errorUbicacion) throw errorUbicacion

    const correoAdmin = `ubicacion-superadmin-${randomUUID()}@prueba.test`
    const passwordAdmin = 'UbicacionSuperAdmin2026*'
    await crearUsuarioDePrueba({ correo: correoAdmin, password: passwordAdmin, rol: 'super_admin' })
    const superAdmin = await clienteComo(correoAdmin, passwordAdmin)

    // Lectura: el super_admin ve la fila exacta de una propiedad ajena --
    // 1 fila, direccion exacta.
    const leer = await superAdmin
      .from('propiedades_ubicacion').select('direccion').eq('propiedad_id', propiedad.id)
    expect(leer.error).toBeNull()
    expect(leer.data).toHaveLength(1)
    expect(leer.data![0]!.direccion).toBe('Carrera 50 # 80-20')

    // Actualizacion: el super_admin corrige la ubicacion de esa misma
    // propiedad ajena, contando 1 fila con .select().
    const actualizar = await superAdmin
      .from('propiedades_ubicacion')
      .update({ direccion: 'Carrera 50 # 80-20 Corregida' })
      .eq('propiedad_id', propiedad.id)
      .select('propiedad_id')
    expect(actualizar.error).toBeNull()
    expect(actualizar.data).toHaveLength(1)

    // Verificacion contra la base real, con service_role: el valor que
    // escribio el super_admin de verdad quedo persistido.
    const { data: enLaBase, error: errorEnLaBase } = await admin
      .from('propiedades_ubicacion').select('direccion').eq('propiedad_id', propiedad.id).single()
    expect(errorEnLaBase).toBeNull()
    expect(enLaBase!.direccion).toBe('Carrera 50 # 80-20 Corregida')

    // Control, en la MISMA prueba: un vendedor sin relacion con la
    // propiedad (ni dueno ni super_admin) recibe 0 filas en la misma
    // lectura -- sin error, la trampa de RLS habitual.
    const correoAjeno = `ubicacion-superadmin-ajeno-${randomUUID()}@prueba.test`
    const passwordAjeno = 'UbicacionSuperadminAjeno2026*'
    await crearUsuarioDePrueba({ correo: correoAjeno, password: passwordAjeno, rol: 'vendedor' })
    const ajeno = await clienteComo(correoAjeno, passwordAjeno)

    const leerAjeno = await ajeno
      .from('propiedades_ubicacion').select('direccion').eq('propiedad_id', propiedad.id)
    expect(leerAjeno.error).toBeNull()
    expect(leerAjeno.data ?? []).toHaveLength(0)
  })
})
