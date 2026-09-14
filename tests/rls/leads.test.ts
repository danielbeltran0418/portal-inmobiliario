import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteAnonimo, clienteComo, crearUsuarioDePrueba } from './ayudantes'

describe('privilegios de leads y leads_contacto', () => {
  it('anon no lee ni escribe ninguna de las dos tablas', async () => {
    const anon = clienteAnonimo()

    const leerLeads = await anon.from('leads').select('id')
    expect(leerLeads.data ?? []).toEqual([])

    const insertar = await anon.from('leads').insert({
      propiedad_id: randomUUID(), comprador_id: randomUUID(),
      vendedor_id: randomUUID(), nombre_mostrado: 'X', mensaje: 'x'.repeat(20),
    })
    expect(insertar.error?.code).toBe('42501')

    const insertarContacto = await anon.from('leads_contacto').insert({
      lead_id: randomUUID(), correo: 'x@y.test', telefono: '3001234567',
    })
    expect(insertarContacto.error?.code).toBe('42501')

    // Caso positivo: service_role si puede leer las dos tablas. Sin esto, las
    // aserciones de arriba pasarian aunque las tablas no existieran.
    const admin = clienteAdmin()
    expect((await admin.from('leads').select('id').limit(1)).error).toBeNull()
    expect((await admin.from('leads_contacto').select('lead_id').limit(1)).error).toBeNull()
  })

  it('authenticated no puede insertar ni actualizar leads_contacto', async () => {
    const correo = `lead-priv-${randomUUID()}@prueba.test`
    await crearUsuarioDePrueba({ correo, password: 'LeadPriv2026*', rol: 'comprador' })
    const cliente = await clienteComo(correo, 'LeadPriv2026*')

    const insertar = await cliente.from('leads_contacto').insert({
      lead_id: randomUUID(), correo: 'x@y.test', telefono: '3001234567',
    })
    expect(insertar.error?.code).toBe('42501')

    const actualizar = await cliente.from('leads_contacto')
      .update({ telefono: '3009999999' }).eq('lead_id', randomUUID())
    expect(actualizar.error?.code).toBe('42501')

    const borrar = await cliente.from('leads_contacto').delete().eq('lead_id', randomUUID())
    expect(borrar.error?.code).toBe('42501')

    // Caso positivo: sin el, las tres denegaciones de arriba pasarian igual si
    // la tabla no existiera o el nombre de columna estuviera mal escrito.
    // Se prueban las tres operaciones -- insert, update, delete -- con
    // service_role sobre una fila real, montada con sus propias FK.
    const admin = clienteAdmin()
    const vendedorId = await crearUsuarioDePrueba({
      correo: `lead-priv-vendedor-${randomUUID()}@prueba.test`,
      password: 'LeadPrivVendedor2026*',
      rol: 'vendedor',
    })
    const compradorId = await crearUsuarioDePrueba({
      correo: `lead-priv-comprador-${randomUUID()}@prueba.test`,
      password: 'LeadPrivComprador2026*',
      rol: 'comprador',
    })

    const { data: propiedad, error: errorPropiedad } = await admin
      .from('propiedades')
      .insert({
        vendedor_id: vendedorId,
        slug: `lead-priv-propiedad-${randomUUID()}`,
        titulo: 'Apartamento de prueba para leads',
        descripcion: 'Descripcion de prueba',
        operacion: 'venta',
        tipo_inmueble: 'apartamento',
        precio: 100000,
      })
      .select('id')
      .single()
    if (errorPropiedad) throw errorPropiedad

    const { data: lead, error: errorLead } = await admin
      .from('leads')
      .insert({
        propiedad_id: propiedad.id,
        comprador_id: compradorId,
        vendedor_id: vendedorId,
        nombre_mostrado: 'Comprador de prueba',
        mensaje: 'x'.repeat(20),
      })
      .select('id')
      .single()
    if (errorLead) throw errorLead

    expect(
      (await admin.from('leads_contacto').insert({
        lead_id: lead.id, correo: 'contacto@prueba.test', telefono: '3001234567',
      })).error,
    ).toBeNull()

    expect(
      (await admin.from('leads_contacto').update({ telefono: '3009999999' }).eq('lead_id', lead.id))
        .error,
    ).toBeNull()

    expect(
      (await admin.from('leads_contacto').delete().eq('lead_id', lead.id)).error,
    ).toBeNull()
  })

  it('authenticated no puede insertar en leads directamente', async () => {
    const correo = `lead-ins-${randomUUID()}@prueba.test`
    await crearUsuarioDePrueba({ correo, password: 'LeadIns2026*', rol: 'comprador' })
    const cliente = await clienteComo(correo, 'LeadIns2026*')

    const insertar = await cliente.from('leads').insert({
      propiedad_id: randomUUID(), comprador_id: randomUUID(),
      vendedor_id: randomUUID(), nombre_mostrado: 'X', mensaje: 'x'.repeat(20),
    })
    expect(insertar.error?.code).toBe('42501')

    // Caso positivo: sin el, la denegacion de arriba pasaria igual si la
    // tabla no existiera. service_role inserta un lead real con sus FK.
    const admin = clienteAdmin()
    const vendedorId = await crearUsuarioDePrueba({
      correo: `lead-ins-vendedor-${randomUUID()}@prueba.test`,
      password: 'LeadInsVendedor2026*',
      rol: 'vendedor',
    })
    const compradorId = await crearUsuarioDePrueba({
      correo: `lead-ins-comprador-${randomUUID()}@prueba.test`,
      password: 'LeadInsComprador2026*',
      rol: 'comprador',
    })

    const { data: propiedad, error: errorPropiedad } = await admin
      .from('propiedades')
      .insert({
        vendedor_id: vendedorId,
        slug: `lead-ins-propiedad-${randomUUID()}`,
        titulo: 'Apartamento de prueba para leads',
        descripcion: 'Descripcion de prueba',
        operacion: 'venta',
        tipo_inmueble: 'apartamento',
        precio: 100000,
      })
      .select('id')
      .single()
    if (errorPropiedad) throw errorPropiedad

    expect(
      (await admin.from('leads').insert({
        propiedad_id: propiedad.id,
        comprador_id: compradorId,
        vendedor_id: vendedorId,
        nombre_mostrado: 'Comprador de prueba',
        mensaje: 'x'.repeat(20),
      })).error,
    ).toBeNull()
  })
})
