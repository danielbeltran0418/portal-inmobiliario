import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAnonimo, clienteComo, crearUsuarioDePrueba } from './ayudantes'

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

  it('un vendedor NO puede crear barrios', async () => {
    const cliente = await clienteComo(VENDEDOR.correo, VENDEDOR.password)
    const { error } = await cliente.from('barrios')
      .insert({ nombre: 'Inventado', slug: 'inventado', ciudad: 'Barranquilla' })
    expect(error).not.toBeNull()
  })
})
