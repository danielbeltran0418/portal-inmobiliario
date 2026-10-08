import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'
import { consultar } from './ayudantes-citas'

// Hallazgos CN-005, CN-014 y CN-017 de la auditoria de seguridad.
const COMPRADOR = { correo: `roles-comprador-${randomUUID()}@prueba.test`, password: 'ClaveDePrueba123!' }
const VENDEDOR = { correo: `roles-vendedor-${randomUUID()}@prueba.test`, password: 'ClaveDePrueba123!' }

const admin = clienteAdmin()
let comprador: SupabaseClient
let vendedor: SupabaseClient
let idComprador = ''
let idVendedor = ''
let barrioId = ''

function datosPropiedad(duenoId: string, extra: Record<string, unknown> = {}) {
  return {
    vendedor_id: duenoId,
    barrio_id: barrioId,
    slug: `roles-${randomUUID().slice(0, 8)}`,
    titulo: 'Propiedad de prueba de roles',
    descripcion: 'Descripcion suficiente para la prueba.',
    operacion: 'venta',
    tipo_inmueble: 'casa',
    ...extra,
  }
}

async function propiedadDe(duenoId: string, estado: 'borrador' | 'publicada'): Promise<string> {
  const { data, error } = await admin.from('propiedades')
    .insert(datosPropiedad(duenoId, { precio: 100000000, estado: 'borrador' })).select('id').single()
  if (error) throw error
  if (estado === 'publicada') {
    await admin.from('imagenes_propiedad').insert({
      propiedad_id: data!.id, ruta_storage: `fixtures/${randomUUID()}.webp`, alt_text: 'Imagen prestada para publicar',
    })
    const { error: e } = await admin.from('propiedades').update({ estado }).eq('id', data!.id)
    if (e) throw e
  }
  return data!.id as string
}

beforeAll(async () => {
  idComprador = await crearUsuarioDePrueba({ ...COMPRADOR, rol: 'comprador' })
  idVendedor = await crearUsuarioDePrueba({ ...VENDEDOR, rol: 'vendedor' })
  comprador = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
  vendedor = await clienteComo(VENDEDOR.correo, VENDEDOR.password)
  const { data } = await admin.from('barrios').select('id').eq('slug', 'riomar').single()
  barrioId = data!.id
})

describe('CN-005: solo un vendedor crea anuncios', () => {
  it('un comprador no puede insertar una propiedad', async () => {
    const { error } = await comprador.from('propiedades').insert(datosPropiedad(idComprador))
    expect(error?.code).toBe('42501')
  })

  it('un vendedor si puede (control positivo)', async () => {
    const { error } = await vendedor.from('propiedades').insert(datosPropiedad(idVendedor))
    expect(error).toBeNull()
  })
})

describe('CN-005: solo un vendedor sube archivos al bucket de propiedades', () => {
  const contenido = () => Buffer.from('contenido de prueba para storage')

  it('un comprador no puede subir a su propia carpeta', async () => {
    const { error } = await comprador.storage.from('propiedades')
      .upload(`${idComprador}/${randomUUID()}.webp`, contenido(), { contentType: 'image/webp' })
    expect(error).not.toBeNull()
  })

  // L2 (20261014000200): tampoco el vendedor sube directo; solo el servidor,
  // despues de pasar la foto por sharp (sin EXIF ni GPS).
  it('un vendedor tampoco puede subir directo a su carpeta', async () => {
    const { error } = await vendedor.storage.from('propiedades')
      .upload(`${idVendedor}/${randomUUID()}.webp`, contenido(), { contentType: 'image/webp' })
    expect(error?.message).toMatch(/row-level security/i)
  })

  it('el servidor (service_role) si sube a la carpeta del vendedor (control positivo)', async () => {
    const { error } = await clienteAdmin().storage.from('propiedades')
      .upload(`${idVendedor}/${randomUUID()}.webp`, contenido(), { contentType: 'image/webp' })
    expect(error).toBeNull()
  })
})

describe('CN-014: favoritos, busquedas guardadas y telefono', () => {
  it('no se puede marcar como favorita una propiedad no publicada', async () => {
    const borrador = await propiedadDe(idVendedor, 'borrador')
    const { error } = await comprador.from('favoritos').insert({ usuario_id: idComprador, propiedad_id: borrador })
    expect(error?.code).toBe('42501')
  })

  it('se puede marcar como favorita una propiedad publicada (control positivo)', async () => {
    const publicada = await propiedadDe(idVendedor, 'publicada')
    const { error } = await comprador.from('favoritos').insert({ usuario_id: idComprador, propiedad_id: publicada })
    expect(error).toBeNull()
  })

  it('el comprador no puede reescribir token_baja ni ultima_notificacion_en de su busqueda', async () => {
    const { data: busqueda, error: e } = await comprador.from('busquedas_guardadas')
      .insert({ usuario_id: idComprador, nombre: 'Mi busqueda', filtros: {} }).select('id').single()
    expect(e).toBeNull()

    for (const cambio of [{ token_baja: randomUUID() }, { ultima_notificacion_en: '2000-01-01T00:00:00Z' }]) {
      const { error } = await comprador.from('busquedas_guardadas').update(cambio).eq('id', busqueda!.id)
      expect(error?.code, JSON.stringify(cambio)).toBe('42501')
    }
    const { error: ok } = await comprador.from('busquedas_guardadas')
      .update({ nombre: 'Nombre nuevo', notificaciones_activas: false }).eq('id', busqueda!.id)
    expect(ok).toBeNull()
  })

  it('crear_lead rechaza un telefono desmesurado', async () => {
    const publicada = await propiedadDe(idVendedor, 'publicada')
    const { error } = await comprador.rpc('crear_lead', {
      p_propiedad_id: publicada, p_telefono: '3'.repeat(200), p_mensaje: 'Mensaje de prueba suficientemente largo.',
    })
    expect(error?.code).toBe('23514')
  })
})

describe('CN-017: privilegios sobrantes de authenticated', () => {
  it('no conserva TRUNCATE, REFERENCES, TRIGGER ni MAINTAIN en las tablas de public', async () => {
    const filas = await consultar<{ tabla: string; privilegio: string }>(
      `SELECT table_name AS tabla, privilege_type AS privilegio
         FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee IN ('anon', 'authenticated')
          AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')`,
    )
    expect(filas).toEqual([])
  })
})
