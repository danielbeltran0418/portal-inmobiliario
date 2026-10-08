import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

// Hallazgos CN-001 y CN-002 (la parte de moderacion la cubre
// guarda-moderacion.test.ts) de la auditoria de seguridad: lo que un vendedor
// puede escribir DIRECTO contra PostgREST con su propio JWT, sin pasar por las
// acciones del servidor. Cada prueba ataca la API como lo haria un cliente
// hostil, no como lo hace la interfaz.
const VENDEDOR = { correo: `endurecimiento-vendedor-${randomUUID()}@prueba.test`, password: 'ClaveDePrueba123!' }
const OTRO = { correo: `endurecimiento-otro-${randomUUID()}@prueba.test`, password: 'ClaveDePrueba123!' }

let vendedor: SupabaseClient
let idVendedor = ''
let idOtro = ''
let barrioId = ''

const admin = clienteAdmin()

async function crearPropiedad(duenoId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin
    .from('propiedades')
    .insert({
      vendedor_id: duenoId,
      barrio_id: barrioId,
      slug: `endurecimiento-${randomUUID().slice(0, 8)}`,
      titulo: 'Propiedad de prueba de endurecimiento',
      descripcion: 'Descripcion suficiente para la prueba.',
      operacion: 'venta',
      tipo_inmueble: 'casa',
      precio: 100000000,
      estado: 'borrador',
      ...extra,
    })
    .select('id')
    .single()
  if (error) throw error
  return data!.id as string
}

beforeAll(async () => {
  idVendedor = await crearUsuarioDePrueba({ ...VENDEDOR, rol: 'vendedor' })
  idOtro = await crearUsuarioDePrueba({ ...OTRO, rol: 'vendedor' })
  vendedor = await clienteComo(VENDEDOR.correo, VENDEDOR.password)
  const { data: barrio } = await admin.from('barrios').select('id').eq('slug', 'riomar').single()
  barrioId = barrio!.id
})

describe('CN-001: ruta_storage de una imagen debe vivir en la carpeta del dueno', () => {
  it('rechaza apuntar a la foto de otro vendedor', async () => {
    const propia = await crearPropiedad(idVendedor)
    const ajena = await crearPropiedad(idOtro)

    const { error } = await vendedor.from('imagenes_propiedad').insert({
      propiedad_id: propia,
      ruta_storage: `${idOtro}/${ajena}/foto-de-la-victima.webp`,
      alt_text: 'Intento de apuntar a un archivo ajeno',
    })

    expect(error?.code).toBe('42501')
  })

  it('acepta una ruta dentro de <vendedor>/<propiedad>/ (control positivo)', async () => {
    const propia = await crearPropiedad(idVendedor)

    const { error } = await vendedor.from('imagenes_propiedad').insert({
      propiedad_id: propia,
      ruta_storage: `${idVendedor}/${propia}/${randomUUID()}.webp`,
      alt_text: 'Foto propia en su carpeta',
    })

    expect(error).toBeNull()
  })

  it('rechaza reescribir ruta_storage de una imagen existente hacia un archivo ajeno', async () => {
    const propia = await crearPropiedad(idVendedor)
    const ajena = await crearPropiedad(idOtro)
    const { data: imagen, error: errorAlta } = await vendedor
      .from('imagenes_propiedad')
      .insert({
        propiedad_id: propia,
        ruta_storage: `${idVendedor}/${propia}/${randomUUID()}.webp`,
        alt_text: 'Foto propia en su carpeta',
      })
      .select('id')
      .single()
    expect(errorAlta).toBeNull()

    const { error } = await vendedor
      .from('imagenes_propiedad')
      .update({ ruta_storage: `${idOtro}/${ajena}/foto-de-la-victima.webp` })
      .eq('id', imagen!.id)

    expect(error).not.toBeNull()
  })

  it('sigue permitiendo cambiar alt_text y orden de su propia imagen', async () => {
    const propia = await crearPropiedad(idVendedor)
    const { data: imagen } = await vendedor
      .from('imagenes_propiedad')
      .insert({
        propiedad_id: propia,
        ruta_storage: `${idVendedor}/${propia}/${randomUUID()}.webp`,
        alt_text: 'Texto original',
      })
      .select('id')
      .single()

    const { error } = await vendedor
      .from('imagenes_propiedad')
      .update({ alt_text: 'Texto nuevo' })
      .eq('id', imagen!.id)

    expect(error).toBeNull()
  })
})

describe('CN-002: columnas de propiedades reservadas al sistema', () => {
  it.each([
    ['destacada', { destacada: true }],
    ['destacada_hasta', { destacada_hasta: '2099-01-01T00:00:00Z' }],
    ['slug', { slug: 'slug-secuestrado' }],
    ['creado_en', { creado_en: '2099-01-01T00:00:00Z' }],
    ['vendedor_id', { vendedor_id: '00000000-0000-0000-0000-000000000000' }],
  ])('el vendedor no puede escribir %s', async (_columna, cambio) => {
    const id = await crearPropiedad(idVendedor)

    const { error } = await vendedor.from('propiedades').update(cambio).eq('id', id)

    expect(error?.code).toBe('42501')
  })

  it('el vendedor sigue pudiendo editar los datos del anuncio (control positivo)', async () => {
    const id = await crearPropiedad(idVendedor)

    const { error } = await vendedor
      .from('propiedades')
      .update({ titulo: 'Titulo editado por su dueno', precio: 120000000, moneda: 'COP' })
      .eq('id', id)

    expect(error).toBeNull()
  })
})

describe('CN-002: tampoco al crear el anuncio', () => {
  it.each([
    ['creado_en', { creado_en: '2099-01-01T00:00:00Z' }],
    ['destacada', { destacada: true }],
  ])('el vendedor no puede fijar %s en el INSERT', async (_columna, extra) => {
    const { error } = await vendedor.from('propiedades').insert({
      vendedor_id: idVendedor,
      barrio_id: barrioId,
      slug: `endurecimiento-${randomUUID().slice(0, 8)}`,
      titulo: 'Propiedad de prueba de endurecimiento',
      descripcion: 'Descripcion suficiente para la prueba.',
      operacion: 'venta',
      tipo_inmueble: 'casa',
      precio: 100000000,
      ...extra,
    })

    expect(error?.code).toBe('42501')
  })

  it('el vendedor sigue pudiendo crear un borrador normal (control positivo)', async () => {
    const { error } = await vendedor.from('propiedades').insert({
      vendedor_id: idVendedor,
      barrio_id: barrioId,
      slug: `endurecimiento-${randomUUID().slice(0, 8)}`,
      titulo: 'Propiedad de prueba de endurecimiento',
      descripcion: 'Descripcion suficiente para la prueba.',
      operacion: 'venta',
      tipo_inmueble: 'casa',
    })

    expect(error).toBeNull()
  })
})
