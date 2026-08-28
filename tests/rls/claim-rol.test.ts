import { describe, it, expect, beforeAll } from 'vitest'
import { clienteComo, crearUsuarioDePrueba } from './ayudantes'

const VENDEDOR = { correo: 'claim-vendedor@prueba.test', password: 'ClaveDePrueba123!' }
const COMPRADOR = { correo: 'claim-comprador@prueba.test', password: 'ClaveDePrueba123!' }

function leerClaims(accessToken: string): Record<string, unknown> {
  const cuerpo = accessToken.split('.')[1]
  return JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'))
}

describe('rol dentro del access token', () => {
  beforeAll(async () => {
    await crearUsuarioDePrueba({ ...VENDEDOR, rol: 'vendedor' })
    await crearUsuarioDePrueba({ ...COMPRADOR, rol: 'comprador' })
  })

  it('el token incluye app_metadata.rol con el rol real', async () => {
    const cliente = await clienteComo(VENDEDOR.correo, VENDEDOR.password)
    const { data } = await cliente.auth.getSession()
    const claims = leerClaims(data.session!.access_token) as {
      app_metadata?: { rol?: string }
    }
    expect(claims.app_metadata?.rol).toBe('vendedor')
  })

  it('el token de un comprador NO lleva el rol de otro usuario', async () => {
    // Control positivo del caso anterior: prueba que el hook lee el rol real
    // de cada usuario, no que devuelve siempre 'vendedor' de forma fija.
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { data } = await cliente.auth.getSession()
    const claims = leerClaims(data.session!.access_token) as {
      app_metadata?: { rol?: string }
    }
    expect(claims.app_metadata?.rol).toBe('comprador')
  })
})
