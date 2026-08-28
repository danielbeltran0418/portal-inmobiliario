import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAnonimo, clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const A = { correo: 'img-vendedor-a@prueba.test', password: 'ClaveDePrueba123!' }
const B = { correo: 'img-vendedor-b@prueba.test', password: 'ClaveDePrueba123!' }
let idPublicada = ''
let idBorrador = ''

describe('imagenes de propiedad', () => {
  beforeAll(async () => {
    const idA = await crearUsuarioDePrueba({ ...A, rol: 'vendedor' })
    await crearUsuarioDePrueba({ ...B, rol: 'vendedor' })
    const admin = clienteAdmin()
    const { data: barrio } = await admin.from('barrios').select('id').eq('slug', 'riomar').single()
    const base = {
      vendedor_id: idA, barrio_id: barrio!.id, operacion: 'arriendo',
      tipo_inmueble: 'casa', precio: 2500000, descripcion: 'x',
    }
    const { data: p } = await admin.from('propiedades')
      .insert({ ...base, slug: 'casa-riomar-imagenes', titulo: 'Casa con imagenes', estado: 'publicada' })
      .select('id').single()
    idPublicada = p!.id
    const { data: b } = await admin.from('propiedades')
      .insert({ ...base, slug: 'casa-riomar-borrador', titulo: 'Casa en borrador', estado: 'borrador' })
      .select('id').single()
    idBorrador = b!.id
  })

  it('rechaza una imagen sin alt_text', async () => {
    const { error } = await clienteAdmin().from('imagenes_propiedad')
      .insert({ propiedad_id: idPublicada, ruta_storage: 'x/1.webp', orden: 1 })
    // alt_text ausente -> la columna recibe NULL -> viola NOT NULL antes de
    // llegar al CHECK (un CHECK con NULL se evalua como "no violado").
    expect(error?.code).toBe('23502')
  })

  it('rechaza una imagen con alt_text demasiado corto', async () => {
    const { error } = await clienteAdmin().from('imagenes_propiedad')
      .insert({ propiedad_id: idPublicada, ruta_storage: 'x/1b.webp', alt_text: 'hi', orden: 1 })
    // alt_text presente pero de 2 caracteres -> NOT NULL se cumple, pero
    // el CHECK length(TRIM(alt_text)) >= 5 falla.
    expect(error?.code).toBe('23514')
  })

  it('acepta una imagen con alt_text', async () => {
    const { error } = await clienteAdmin().from('imagenes_propiedad')
      .insert({ propiedad_id: idPublicada, ruta_storage: 'x/2.webp', alt_text: 'Fachada de la casa en Riomar', orden: 1 })
    expect(error).toBeNull()
  })

  it('el anonimo ve las imagenes de una propiedad publicada', async () => {
    // Control positivo: pin exacto del conteo (solo la imagen aceptada arriba
    // debe existir para esta propiedad en este punto de la suite).
    const { data } = await clienteAnonimo().from('imagenes_propiedad').select('id').eq('propiedad_id', idPublicada)
    expect(data).toHaveLength(1)
  })

  it('el anonimo NO ve las imagenes de un borrador', async () => {
    await clienteAdmin().from('imagenes_propiedad')
      .insert({ propiedad_id: idBorrador, ruta_storage: 'x/3.webp', alt_text: 'Interior', orden: 1 })
    const { data } = await clienteAnonimo().from('imagenes_propiedad').select('id').eq('propiedad_id', idBorrador)
    expect(data).toHaveLength(0)
  })

  it('el vendedor B no puede anadir imagenes a la propiedad del vendedor A', async () => {
    const cliente = await clienteComo(B.correo, B.password)
    const { error } = await cliente.from('imagenes_propiedad')
      .insert({ propiedad_id: idPublicada, ruta_storage: 'x/4.webp', alt_text: 'Intruso', orden: 9 })
    expect(error?.code).toBe('42501')
  })
})
