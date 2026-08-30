import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { clienteAdmin, clienteComo } from './ayudantes'

const CUENTAS = [
  { correo: 'admin@portal.com', password: 'AdminPrueba2026*', rol: 'super_admin' },
  { correo: 'vendedor@portal.com', password: 'VendedorPrueba2026*', rol: 'vendedor' },
  { correo: 'comprador@portal.com', password: 'CompradorPrueba2026*', rol: 'comprador' },
]

describe('seed de desarrollo', () => {
  it('el archivo aborta si el entorno es de produccion', () => {
    const sql = readFileSync('supabase/seed.sql', 'utf8')
    expect(sql).toContain('RAISE EXCEPTION')
    expect(sql).toContain('produccion')
  })

  for (const cuenta of CUENTAS) {
    it(`la cuenta ${cuenta.correo} existe con rol ${cuenta.rol}`, async () => {
      const cliente = await clienteComo(cuenta.correo, cuenta.password)
      const { data: sesion } = await cliente.auth.getUser()
      expect(sesion.user).not.toBeNull()

      const { data } = await clienteAdmin()
        .from('perfiles').select('rol').eq('id', sesion.user!.id).single()
      expect(data!.rol).toBe(cuenta.rol)
    })
  }

  it('las tres cuentas tienen el correo ya confirmado', async () => {
    const { data } = await clienteAdmin().auth.admin.listUsers()
    for (const cuenta of CUENTAS) {
      const u = data!.users.find((x) => x.email === cuenta.correo)
      expect(u?.email_confirmed_at).toBeTruthy()
    }
  })
})
