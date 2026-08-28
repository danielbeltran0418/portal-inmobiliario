import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAdmin, clienteAnonimo, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const VENDEDOR = { correo: 'rls-vendedor-barrios@prueba.test', password: 'ClaveDePrueba123!' }

describe('RLS de barrios', () => {
  beforeAll(async () => {
    await crearUsuarioDePrueba({ ...VENDEDOR, rol: 'vendedor' })
  })

  it('cualquiera lee los barrios sin autenticarse', async () => {
    const { data, error } = await clienteAnonimo().from('barrios').select('slug')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
  })

  it('incluye Villa Carolina y El Paraiso', async () => {
    const { data } = await clienteAnonimo().from('barrios').select('slug')
    const slugs = data!.map((b) => b.slug)
    expect(slugs).toContain('villa-carolina')
    expect(slugs).toContain('el-paraiso')
  })

  it('los slugs son limpios: minusculas, sin numeros ni guiones bajos', async () => {
    const { data } = await clienteAnonimo().from('barrios').select('slug')
    for (const b of data!) expect(b.slug).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })

  it('el CHECK de la base rechaza slugs con numero, guion bajo o mayuscula', async () => {
    const admin = clienteAdmin()
    const invalidos = ['villa-2', 'villa_carolina', 'Villa-Carolina']

    for (const slug of invalidos) {
      const { error } = await admin
        .from('barrios')
        .insert({ nombre: 'Invalido', slug, ciudad: 'Barranquilla' })

      if (!error) {
        // No deberia insertarse nunca; si el CHECK fallara, limpiar antes de fallar la prueba.
        await admin.from('barrios').delete().eq('slug', slug)
      }

      expect(error).not.toBeNull()
      expect(error?.code).toBe('23514')
    }
  })

  it('un vendedor NO puede crear barrios', async () => {
    const cliente = await clienteComo(VENDEDOR.correo, VENDEDOR.password)
    const { error } = await cliente.from('barrios')
      .insert({ nombre: 'Inventado', slug: 'inventado', ciudad: 'Barranquilla' })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})
