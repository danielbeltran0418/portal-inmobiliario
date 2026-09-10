import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { clienteAdmin, crearUsuarioDePrueba } from './ayudantes'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { listarPropiedadesPublicas } from '@/lib/catalogo/consultas'

const admin = clienteAdmin()
let usuario: string
let barrio: string
const ids: string[] = []
beforeAll(async () => {
  usuario = await crearUsuarioDePrueba({ correo: `catalogo-${randomUUID()}@prueba.test`, password: 'CatalogoPrueba2026*', rol: 'vendedor' })
  const { data: barrios, error: errorBarrios } = await admin.from('barrios').select('id').eq('activo', true).limit(1)
  if (errorBarrios || !barrios?.length) throw new Error('Se necesita un barrio activo')
  barrio = barrios[0].id
  for (let i = 0; i < 3; i++) {
    const { data, error } = await admin.from('propiedades').insert({
      vendedor_id: usuario, barrio_id: barrio, slug: `catalogo-${randomUUID()}`, titulo: 'Casa de prueba del catalogo',
      descripcion: 'Descripción pública de prueba', operacion: 'venta', tipo_inmueble: 'casa', precio: 12345678.91,
      direccion: 'DIRECCION PRIVADA DE PRUEBA', latitud: 10.999, longitud: -74.999,
    }).select('id').single()
    if (error) throw error
    ids.push(data.id)
    const { error: imagenError } = await admin.from('imagenes_propiedad').insert({ propiedad_id: data.id, ruta_storage: `${usuario}/${data.id}/prueba.webp`, alt_text: 'Casa de prueba', orden: 0 })
    if (imagenError) throw imagenError
    if (i !== 1) {
      const { error: publicarError } = await admin.from('propiedades').update({ estado: 'publicada' }).eq('id', data.id)
      if (publicarError) throw publicarError
    }
    if (i === 2) {
      const { error: borrarError } = await admin.from('imagenes_propiedad').delete().eq('propiedad_id', data.id)
      if (borrarError) throw borrarError
    }
  }
})
afterAll(async () => {
  if (ids.length) {
    await admin.from('propiedades').delete().in('id', ids)
    // Solo rutas de este fixture; nunca drenar ni limpiar datos de otras suites.
    for (const id of ids) await admin.from('limpieza_almacenamiento').delete().eq('ruta', `${usuario}/${id}/prueba.webp`)
  }
  if (usuario) await admin.auth.admin.deleteUser(usuario)
})
it('muestra la publicada con foto, excluye borrador y publicada sin foto, sin datos privados', async () => {
  const resultado = await listarPropiedadesPublicas(crearClientePublico(), barrio, { pagina: 1, precioMin: 12345678.91, precioMax: 12345678.91 })
  const visibles = resultado.propiedades.map(p => p.id)
  expect(visibles).toContain(ids[0])
  expect(visibles).not.toContain(ids[1])
  expect(visibles).not.toContain(ids[2])
  const propiedad = resultado.propiedades.find(p => p.id === ids[0])!
  expect(propiedad.imagenes_propiedad).toHaveLength(1)
  expect(JSON.stringify(propiedad)).not.toMatch(/direccion|latitud|longitud|DIRECCION PRIVADA|ruta_storage/)
})
it('los filtros acotan datos reales, con control positivo', async () => {
  const db = crearClientePublico()
  const positivo = await listarPropiedadesPublicas(db, barrio, { pagina: 1, precioMin: 12345678.91, precioMax: 12345678.91, operacion: 'venta' })
  expect(positivo.propiedades.map(p => p.id)).toContain(ids[0])
  const negativo = await listarPropiedadesPublicas(db, barrio, { pagina: 1, precioMin: 12345678.91, precioMax: 12345678.91, operacion: 'arriendo' })
  expect(negativo.propiedades.map(p => p.id)).not.toContain(ids[0])
})

vi.mock('@/lib/supabase/cliente-admin', () => ({ crearClienteAdmin: () => clienteAdmin() }))
it('la ruta pública firma y descarga, pero deja de firmar al pausar', async () => {
  const { GET } = await import('@/app/imagen/[id]/route')
  const ruta = `${usuario}/${ids[0]}/prueba.webp`
  const contenido = Buffer.from('archivo de prueba de descarga')
  const { error: subirError } = await admin.storage.from('propiedades').upload(ruta, contenido, { contentType: 'image/webp' })
  if (subirError) throw subirError
  try {
    const { data: imagen, error } = await admin.from('imagenes_propiedad').select('id').eq('propiedad_id', ids[0]).single()
    if (error) throw error
    const contexto = { params: Promise.resolve({ id: imagen.id }) }
    const respuesta = await GET(new Request('http://localhost/imagen/prueba'), contexto)
    expect(respuesta.status).toBe(307)
    const descarga = await fetch(respuesta.headers.get('location')!)
    expect(descarga.status).toBe(200)
    expect(Buffer.from(await descarga.arrayBuffer())).toEqual(contenido)
    const { error: pausaError } = await admin.from('propiedades').update({ estado: 'pausada' }).eq('id', ids[0])
    if (pausaError) throw pausaError
    expect((await GET(new Request('http://localhost/imagen/prueba'), contexto)).status).toBe(404)
  } finally {
    await admin.storage.from('propiedades').remove([ruta])
  }
})
