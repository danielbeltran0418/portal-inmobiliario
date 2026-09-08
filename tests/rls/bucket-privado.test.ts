import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAnonimo, clienteAdmin } from './ayudantes'

const BUCKET = 'propiedades'
const RUTA = 'pruebas-bucket/imagen-de-borrador.webp'

describe('el bucket de propiedades es privado', () => {
  beforeAll(async () => {
    const admin = clienteAdmin()
    await admin.storage.from(BUCKET).remove([RUTA])
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(RUTA, new Uint8Array([1, 2, 3, 4]), { contentType: 'image/webp', upsert: true })
    expect(error).toBeNull()
  })

  // No se comprueba la bandera `public` de storage.buckets directamente porque
  // esa tabla no se expone por PostgREST. Se comprueba por su EFECTO, que es lo
  // que de verdad importa: la URL publica no sirve y la firmada si.

  it('la URL publica NO sirve el archivo', async () => {
    const { data } = clienteAnonimo().storage.from(BUCKET).getPublicUrl(RUTA)
    const respuesta = await fetch(data.publicUrl)
    expect(respuesta.ok).toBe(false)
    expect(respuesta.status).toBe(400)
  })

  it('CASO POSITIVO: la URL firmada SI sirve el archivo', async () => {
    const { data, error } = await clienteAdmin()
      .storage.from(BUCKET).createSignedUrl(RUTA, 60)
    expect(error).toBeNull()

    const respuesta = await fetch(data!.signedUrl)
    expect(respuesta.ok).toBe(true)
    expect((await respuesta.arrayBuffer()).byteLength).toBe(4)
  })
})
