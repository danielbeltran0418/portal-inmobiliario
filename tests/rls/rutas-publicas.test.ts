import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { clienteAdmin, clienteAnonimo, crearUsuarioDePrueba } from './ayudantes'
const admin = clienteAdmin()
const anon = clienteAnonimo()
let usuario = ''
let id = ''
let ruta = ''
beforeAll(async () => {
  usuario = await crearUsuarioDePrueba({ correo: `historial-${randomUUID()}@prueba.test`, password: 'HistorialPrueba2026*', rol: 'vendedor' })
  const { data: barrio, error: eb } = await admin.from('barrios').select('id,slug').eq('activo', true).limit(1).single()
  if (eb) throw eb
  const slug = `historial-${randomUUID()}`
  ruta = `/${barrio.slug}/${slug}`
  const { data, error } = await admin.from('propiedades').insert({ vendedor_id: usuario, barrio_id: barrio.id, slug, titulo: 'Casa historial de rutas', descripcion: '', precio: 100000000, operacion: 'venta', tipo_inmueble: 'casa' }).select('id').single()
  if (error) throw error
  id = data.id
})
afterAll(async () => {
  if (id) {
    await admin.from('propiedades').delete().eq('id', id)
    await admin.from('rutas_publicas_propiedad').delete().eq('propiedad_id', id)
    await admin.from('limpieza_almacenamiento').delete().eq('ruta', `${usuario}/${id}/historial.webp`)
  }
  if (usuario) await admin.auth.admin.deleteUser(usuario)
})
it('no registra un borrador y conserva únicamente la URL que llegó a publicarse', async () => {
  const antes = await anon.from('rutas_publicas_propiedad').select('ruta').eq('ruta', ruta)
  expect(antes.error).toBeNull()
  expect(antes.data).toEqual([])
  const { error: ei } = await admin.from('imagenes_propiedad').insert({ propiedad_id: id, ruta_storage: `${usuario}/${id}/historial.webp`, alt_text: 'Foto historial', orden: 0 })
  if (ei) throw ei
  const { error: ep } = await admin.from('propiedades').update({ estado: 'publicada' }).eq('id', id)
  if (ep) throw ep
  const publicada = await anon.from('rutas_publicas_propiedad').select('ruta,propiedad_id').eq('ruta', ruta).single()
  expect(publicada.error).toBeNull()
  expect(publicada.data).toEqual({ ruta, propiedad_id: id })
  const { error: eb } = await admin.from('propiedades').delete().eq('id', id)
  if (eb) throw eb
  const retirada = await anon.from('rutas_publicas_propiedad').select('ruta').eq('ruta', ruta).single()
  expect(retirada.error).toBeNull()
  expect(retirada.data?.ruta).toBe(ruta)
})
