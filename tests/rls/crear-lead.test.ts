import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteAnonimo, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const MENSAJE = 'Me interesa esta propiedad, quisiera visitarla.'

/**
 * Monta un comprador y DOS vendedores EFIMEROS (randomUUID en el correo,
 * nunca las cuentas fijas del seed -- ver el comentario de sesionVendedor()
 * en ayudantes.ts): `vendedorId` con una propiedad PUBLICADA de verdad (con
 * imagen y precio, que es lo que exigen los triggers
 * propiedades_exigir_imagen y propiedades_exigir_precio de la Task de SP3
 * antes de aceptar estado = 'publicada'), y `otroVendedorId` -- un vendedor
 * DISTINTO -- con un BORRADOR que nunca se publica, para el caso "propiedad
 * no publicada".
 *
 * Los dos vendedores son DISTINTOS a proposito, y no un detalle cosmetico:
 * una version anterior de esta fixtura le daba el borrador al MISMO
 * vendedor de la propiedad publicada, y eso escondio un bug real. Con un
 * solo vendedor, "el vendedor_id que quedo en el lead es el de la propiedad
 * indicada" y "es el de CUALQUIER propiedad de este vendedor" son
 * indistinguibles: una funcion que tomara por error el vendedor de la otra
 * propiedad del mismo vendedor habria dado el mismo resultado, y la prueba
 * de abajo ("deriva el vendedor de la propiedad") habria pasado igual de
 * verde. Con vendedores distintos, equivocarse de propiedad SI cambia el
 * valor observado.
 *
 * Todo se crea con clienteAdmin() (service_role) porque lo unico que le
 * importa a esta suite es el estado final de las filas, no ejercitar la RLS
 * de escritura de `propiedades` -- esa ya la cubre tests/rls/propiedades-*.
 */
async function fixtura() {
  const admin = clienteAdmin()
  const sufijo = randomUUID()
  const password = 'LeadPrueba2026*'
  const compradorCorreo = `lead-comprador-${sufijo}@prueba.test`
  const vendedorCorreo = `lead-vendedor-${sufijo}@prueba.test`
  const otroVendedorCorreo = `lead-otro-vendedor-${sufijo}@prueba.test`

  const compradorId = await crearUsuarioDePrueba({
    correo: compradorCorreo, password, rol: 'comprador',
  })
  const vendedorId = await crearUsuarioDePrueba({
    correo: vendedorCorreo, password, rol: 'vendedor',
  })
  const otroVendedorId = await crearUsuarioDePrueba({
    correo: otroVendedorCorreo, password, rol: 'vendedor',
  })

  const { data: propiedad, error: errorPropiedad } = await admin
    .from('propiedades')
    .insert({
      vendedor_id: vendedorId,
      slug: `lead-prueba-${sufijo}`,
      titulo: 'Apartamento de prueba para leads',
      descripcion: 'Descripcion de prueba, suficiente para el CHECK de longitud.',
      operacion: 'venta',
      tipo_inmueble: 'apartamento',
      precio: 350000000,
    })
    .select('id')
    .single()
  if (errorPropiedad) throw errorPropiedad
  const propiedadId = propiedad.id as string

  const { error: errorImagen } = await admin.from('imagenes_propiedad').insert({
    propiedad_id: propiedadId,
    ruta_storage: `lead-prueba/${sufijo}.webp`,
    alt_text: 'Fachada de prueba para leads',
  })
  if (errorImagen) throw errorImagen

  const { error: errorPublicar } = await admin
    .from('propiedades')
    .update({ estado: 'publicada' })
    .eq('id', propiedadId)
  if (errorPublicar) throw errorPublicar

  // Del OTRO vendedor, no del dueno de la propiedad publicada (ver el
  // comentario de arriba). El borrador nunca se publica.
  const { data: borrador, error: errorBorrador } = await admin
    .from('propiedades')
    .insert({
      vendedor_id: otroVendedorId,
      slug: `lead-prueba-borrador-${sufijo}`,
      titulo: 'Apartamento en borrador para leads',
      descripcion: 'Descripcion de prueba, suficiente para el CHECK de longitud.',
      operacion: 'venta',
      tipo_inmueble: 'apartamento',
      precio: 350000000,
    })
    .select('id')
    .single()
  if (errorBorrador) throw errorBorrador
  const borradorId = borrador.id as string

  return {
    compradorCorreo, vendedorCorreo, otroVendedorCorreo, password,
    compradorId, vendedorId, otroVendedorId, propiedadId, borradorId,
  }
}

describe('crear_lead: el unico camino de escritura de un lead', () => {
  it('crea el lead y su contacto, y deriva el vendedor de la propiedad', async () => {
    const { compradorCorreo, password, propiedadId, vendedorId } = await fixtura()
    const cliente = await clienteComo(compradorCorreo, password)

    const { data: leadId, error } = await cliente.rpc('crear_lead', {
      p_propiedad_id: propiedadId,
      p_telefono: '3001234567',
      p_mensaje: MENSAJE,
    })
    expect(error).toBeNull()
    expect(leadId).toBeTruthy()

    const admin = clienteAdmin()
    const { data: lead } = await admin.from('leads')
      .select('vendedor_id,estado,nombre_mostrado').eq('id', leadId).single()
    // Derivado de la propiedad, no de lo que mando el cliente -- que no pudo
    // mandar nada: la funcion no acepta vendedor_id como parametro.
    expect(lead?.vendedor_id).toBe(vendedorId)
    expect(lead?.estado).toBe('nuevo')

    const { data: contacto } = await admin.from('leads_contacto')
      .select('correo,telefono').eq('lead_id', leadId).single()
    expect(contacto?.telefono).toBe('3001234567')
    expect(contacto?.correo).toBe(compradorCorreo)
  })

  it('rechaza el lead sobre una propiedad que no esta publicada', async () => {
    const { compradorCorreo, password, propiedadId, borradorId } = await fixtura()
    const cliente = await clienteComo(compradorCorreo, password)
    const { error } = await cliente.rpc('crear_lead', {
      p_propiedad_id: borradorId, p_telefono: '3001234567',
      p_mensaje: MENSAJE,
    })
    // Codigo propio (LD002), distinguible del de "a si mismo" (LD003): dos
    // comprobaciones que compartieran codigo no se podrian mapear sin leer
    // el mensaje, que es texto de interfaz y no un contrato estable.
    expect(error?.code).toBe('LD002')
    expect(error?.message).toMatch(/no esta publicada/i)

    // Caso positivo en la misma prueba: el mismo comprador, sobre la
    // propiedad PUBLICADA de la misma fixtura, si puede crear el lead. Sin
    // esto, la denegacion de arriba pasaria igual si crear_lead rechazara
    // TODO intento, publicada o no.
    const { data: leadId, error: errorPositivo } = await cliente.rpc('crear_lead', {
      p_propiedad_id: propiedadId, p_telefono: '3001234567',
      p_mensaje: MENSAJE,
    })
    expect(errorPositivo).toBeNull()
    expect(leadId).toBeTruthy()
  })

  it('rechaza que un vendedor se deje un lead en su propia propiedad', async () => {
    const { vendedorCorreo, compradorCorreo, password, propiedadId } = await fixtura()
    const cliente = await clienteComo(vendedorCorreo, password)
    const { error } = await cliente.rpc('crear_lead', {
      p_propiedad_id: propiedadId, p_telefono: '3001234567',
      p_mensaje: MENSAJE,
    })
    // Codigo propio (LD003), distinguible del de "no publicada" (LD002).
    expect(error?.code).toBe('LD003')
    expect(error?.message).toMatch(/tu propia propiedad/i)

    // Caso positivo: un comprador DISTINTO del vendedor SI puede crear el
    // lead sobre esa misma propiedad. Sin esto, la denegacion de arriba
    // pasaria igual si crear_lead rechazara cualquier intento sobre ella.
    const compradorCliente = await clienteComo(compradorCorreo, password)
    const { data: leadId, error: errorPositivo } = await compradorCliente.rpc('crear_lead', {
      p_propiedad_id: propiedadId, p_telefono: '3001234567',
      p_mensaje: MENSAJE,
    })
    expect(errorPositivo).toBeNull()
    expect(leadId).toBeTruthy()
  })

  it('anon no puede invocar crear_lead', async () => {
    const { propiedadId, compradorCorreo, password } = await fixtura()
    const { error } = await clienteAnonimo().rpc('crear_lead', {
      p_propiedad_id: propiedadId, p_telefono: '3001234567',
      p_mensaje: MENSAJE,
    })
    expect(error?.code).toBe('42501')

    // Caso positivo: authenticated, el rol al que SI se le concedio EXECUTE,
    // invoca la misma funcion sobre la misma propiedad sin problema. Sin
    // esto, "anon no puede" seria igual de cierto si la funcion no existiera.
    const cliente = await clienteComo(compradorCorreo, password)
    const { data: leadId, error: errorPositivo } = await cliente.rpc('crear_lead', {
      p_propiedad_id: propiedadId, p_telefono: '3001234567',
      p_mensaje: MENSAJE,
    })
    expect(errorPositivo).toBeNull()
    expect(leadId).toBeTruthy()
  })

  it('rechaza el lead duplicado del mismo comprador sobre la misma propiedad', async () => {
    const { compradorCorreo, password, propiedadId, compradorId } = await fixtura()
    const cliente = await clienteComo(compradorCorreo, password)

    const primero = await cliente.rpc('crear_lead', {
      p_propiedad_id: propiedadId, p_telefono: '3001234567',
      p_mensaje: MENSAJE,
    })
    expect(primero.error).toBeNull()
    expect(primero.data).toBeTruthy()

    const segundo = await cliente.rpc('crear_lead', {
      p_propiedad_id: propiedadId, p_telefono: '3009999999',
      p_mensaje: 'Otra vez, quisiera saber un poco mas.',
    })
    // 23505 = unique_violation, de leads_uno_por_comprador_y_propiedad
    // (Task 3). crear_lead no la comprueba aparte: la base ya la hace
    // cumplir, y duplicarla en la funcion seria una segunda fuente de verdad.
    expect(segundo.error?.code).toBe('23505')

    // Caso positivo en la misma prueba: sigue habiendo exactamente UN lead
    // de este comprador sobre esta propiedad -- el primero, que si se creo.
    // Sin esto, "el segundo fallo" seria igual de cierto si el primero
    // tambien hubiera fallado.
    const admin = clienteAdmin()
    const { data: leads } = await admin.from('leads')
      .select('id').eq('propiedad_id', propiedadId).eq('comprador_id', compradorId)
    expect(leads ?? []).toHaveLength(1)
    expect(leads?.[0]?.id).toBe(primero.data)
  })

  it('registra el evento lead_capturado en registro_auditoria', async () => {
    const { compradorCorreo, password, propiedadId, vendedorId, compradorId } = await fixtura()
    const cliente = await clienteComo(compradorCorreo, password)

    const { data: leadId, error } = await cliente.rpc('crear_lead', {
      p_propiedad_id: propiedadId, p_telefono: '3001234567',
      p_mensaje: MENSAJE,
    })
    expect(error).toBeNull()

    const admin = clienteAdmin()
    const { data: evento, error: errorEvento } = await admin.from('registro_auditoria')
      .select('actor_id,accion,entidad,entidad_id,metadatos')
      .eq('entidad', 'lead').eq('entidad_id', leadId).single()
    expect(errorEvento).toBeNull()

    expect(evento?.actor_id).toBe(compradorId)
    expect(evento?.accion).toBe('lead_capturado')
    expect(evento?.metadatos?.propiedad_id).toBe(propiedadId)
    expect(evento?.metadatos?.vendedor_id).toBe(vendedorId)
  })
})
