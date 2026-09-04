import { describe, it, expect, afterAll } from 'vitest'
import { clienteAnonimo, clienteAdmin } from './ayudantes'

/**
 * La politica de contrasena la aplica GoTrue, no el formulario.
 *
 * src/lib/validacion/esquemas.ts pide 12 caracteres, pero ese esquema solo
 * corre en la accion del formulario. `supabase.auth.signUp` es una llamada
 * publica a /auth/v1/signup: un POST con curl, el SDK desde una consola del
 * navegador o un flujo de cambio de contrasena que no pase por el formulario
 * se saltan Zod por completo. Con minimum_password_length = 6 en
 * supabase/config.toml, GoTrue aceptaba seis caracteres por cualquiera de esas
 * vias.
 *
 * Estas pruebas NO tocan Zod a proposito: van directas a la API de auth, que
 * es donde la regla tiene que estar.
 */

const DOMINIO = 'politica-clave.prueba.test'
const creados: string[] = []

// 11 y 12 caracteres exactos: el limite y el limite menos uno. Probar con 6 y
// con 20 no distinguiria un minimo de 12 de uno de 8.
const ONCE = 'Abcdefgh12!'
const DOCE = 'Abcdefgh12!x'

function correoUnico(etiqueta: string): string {
  return `${etiqueta}-${Date.now()}@${DOMINIO}`
}

describe('politica de contrasena de GoTrue', () => {
  afterAll(async () => {
    const admin = clienteAdmin()
    const { data } = await admin.auth.admin.listUsers()
    for (const usuario of data?.users ?? []) {
      if (usuario.email?.endsWith(DOMINIO)) {
        await admin.auth.admin.deleteUser(usuario.id)
      }
    }
  })

  it('longitudes de prueba correctas', () => {
    // Autocomprobacion barata: si alguien edita las constantes de arriba y
    // deja las dos por encima del minimo, las pruebas siguientes pasarian sin
    // medir el limite.
    expect(ONCE).toHaveLength(11)
    expect(DOCE).toHaveLength(12)
  })

  it('signUp con 11 caracteres lo rechaza GoTrue, no solo Zod', async () => {
    const { data, error } = await clienteAnonimo().auth.signUp({
      email: correoUnico('once'),
      password: ONCE,
    })

    expect(error).not.toBeNull()
    // El codigo concreto de GoTrue para contrasena debil. Asertarlo, y no solo
    // "hubo error", distingue el rechazo por politica de un rechazo por
    // cualquier otro motivo -- correo invalido, rate limit, servicio caido --
    // que dejaria la prueba verde sin que la politica existiera.
    expect(error!.code).toBe('weak_password')
    expect(error!.message).toMatch(/6 characters|12 characters|at least/i)
    expect(data.user).toBeNull()
  })

  it('signUp con 12 caracteres si es aceptado', async () => {
    // Caso positivo obligatorio. Sin el, un GoTrue caido o un rate limit
    // harian pasar la prueba de arriba sin demostrar nada sobre el minimo.
    const correo = correoUnico('doce')
    const { data, error } = await clienteAnonimo().auth.signUp({
      email: correo,
      password: DOCE,
    })

    expect(error).toBeNull()
    expect(data.user).not.toBeNull()
    creados.push(correo)
  })

  it('las tres credenciales del seed cumplen el minimo', async () => {
    // El seed inserta en auth.users con crypt() directamente, asi que se salta
    // la validacion de GoTrue y un `db reset` no se romperia aunque quedaran
    // cortas: el fallo aparecerian mucho despues, el dia que alguien intentara
    // cambiar una de esas contrasenas por la via normal. Se comprueba aqui.
    const DEL_SEED = ['AdminPrueba2026*', 'VendedorPrueba2026*', 'CompradorPrueba2026*']
    for (const clave of DEL_SEED) {
      expect(clave.length, `la contrasena del seed "${clave}" quedo por debajo del minimo`)
        .toBeGreaterThanOrEqual(12)
    }
  })
})
