import { describe, it, expect, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { clienteAdmin, clienteComo, URL_BASE_DE_DATOS } from './ayudantes'

const CUENTAS = [
  { correo: 'admin@portal.com', password: 'AdminPrueba2026*', rol: 'super_admin' },
  { correo: 'vendedor@portal.com', password: 'VendedorPrueba2026*', rol: 'vendedor' },
  { correo: 'comprador@portal.com', password: 'CompradorPrueba2026*', rol: 'comprador' },
]

const SEED = readFileSync('supabase/seed.sql', 'utf8')

/**
 * Parte el archivo en sentencias, respetando comentarios de linea, cadenas
 * entre comillas simples y bloques con comillas de dolar ($guarda$, $seed$).
 * Un split ingenuo por ';' cortaria dentro de los bloques DO.
 */
export function separarSentencias(sql: string): string[] {
  const sentencias: string[] = []
  let actual = ''
  let i = 0

  while (i < sql.length) {
    const resto = sql.slice(i)

    if (resto.startsWith('--')) {
      const salto = sql.indexOf('\n', i)
      const fin = salto === -1 ? sql.length : salto + 1
      actual += sql.slice(i, fin)
      i = fin
      continue
    }

    if (sql[i] === "'") {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue }
        if (sql[j] === "'") { j += 1; break }
        j += 1
      }
      actual += sql.slice(i, j)
      i = j
      continue
    }

    const apertura = resto.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
    if (apertura) {
      const marca = apertura[0]
      const cierre = sql.indexOf(marca, i + marca.length)
      const fin = cierre === -1 ? sql.length : cierre + marca.length
      actual += sql.slice(i, fin)
      i = fin
      continue
    }

    if (sql[i] === ';') {
      actual += ';'
      if (actual.trim()) sentencias.push(actual.trim())
      actual = ''
      i += 1
      continue
    }

    actual += sql[i]
    i += 1
  }

  if (actual.trim()) sentencias.push(actual.trim())
  return sentencias
}

/**
 * Ejecuta supabase/seed.sql contra la base local reproduciendo el caso
 * PELIGROSO: `psql -f` SIN `-v ON_ERROR_STOP=1` (tambien el editor SQL de
 * Supabase Studio y la mayoria de clientes GUI). Ahi las sentencias se mandan
 * DE UNA EN UNA y el cliente sigue con la siguiente aunque la anterior haya
 * fallado. Por eso el archivo va envuelto en BEGIN/COMMIT: es el unico motivo
 * por el que una excepcion en el bloque DO de la guarda detiene el resto.
 *
 * Cuidado con el atajo que aqui no sirve: mandar el archivo entero en una sola
 * llamada `client.query(texto)`. El protocolo de consulta simple envuelve un
 * texto multi-sentencia en una transaccion implicita, asi que cualquier error
 * revierte todo -- la prueba pasaria igual con el BEGIN/COMMIT quitado y no
 * mediria la atomicidad. Verificado: con ese atajo, borrar BEGIN/COMMIT no
 * rompia la prueba.
 *
 * `entorno` fija el marcador que consulta la guarda.
 */
async function ejecutarSeed(entorno: string | null): Promise<{ fallo: boolean; mensaje: string }> {
  const cliente = new Client({ connectionString: URL_BASE_DE_DATOS })
  await cliente.connect()
  const errores: string[] = []
  try {
    if (entorno !== null) {
      await cliente.query(`SET app.entorno = '${entorno}'`)
    }
    for (const sentencia of separarSentencias(SEED)) {
      try {
        await cliente.query(sentencia)
      } catch (error) {
        // No se corta: asi se comporta un cliente sin ON_ERROR_STOP.
        errores.push((error as Error).message)
      }
    }
    return { fallo: errores.length > 0, mensaje: errores.join(' | ') }
  } finally {
    // Si el archivo dejo una transaccion abierta o abortada, se cierra aqui.
    await cliente.query('ROLLBACK').catch(() => undefined)
    await cliente.end()
  }
}

async function correosExistentes(): Promise<string[]> {
  const { data, error } = await clienteAdmin().auth.admin.listUsers()
  if (error) throw error
  return data.users
    .map((u) => u.email ?? '')
    .filter((correo) => CUENTAS.some((c) => c.correo === correo))
}

describe('seed de desarrollo', () => {
  // Las pruebas de abajo borran las tres cuentas para poder observar si el
  // seed las crea o no. Se dejan repuestas pase lo que pase.
  afterAll(async () => {
    const resultado = await ejecutarSeed(null)
    expect(resultado.fallo, `no se pudo reponer el seed: ${resultado.mensaje}`).toBe(false)
  })

  /**
   * Esta es la prueba que protege el riesgo numero uno del spec: que el seed,
   * con contrasenas publicas y un super_admin entre ellas, llegue a
   * produccion.
   *
   * La version anterior buscaba las cadenas 'RAISE EXCEPTION' y 'produccion'
   * DENTRO del archivo. Las dos aparecen tambien en el comentario de cabecera,
   * asi que si alguien borraba la guarda y dejaba el comentario, la prueba
   * seguia en verde. No probaba nada.
   *
   * Esta ejecuta el archivo de verdad contra la base, con el entorno marcado
   * como produccion, y mira que pasa.
   */
  // Si el separador partiera mal el archivo, la prueba de abajo mediria otra
  // cosa sin avisar: por ejemplo, un corte dentro de $seed$ haria fallar
  // sentencias por sintaxis y "no se creo ninguna cuenta" saldria verde por el
  // motivo equivocado.
  it('el separador de sentencias respeta los bloques con comillas de dolar', () => {
    const sentencias = separarSentencias(SEED)
    expect(sentencias.filter((s) => s.includes('$guarda$'))).toHaveLength(1)
    expect(sentencias.filter((s) => s.includes('$seed$'))).toHaveLength(1)
    expect(sentencias.some((s) => s.endsWith('BEGIN;'))).toBe(true)
    expect(sentencias.some((s) => s.trim() === 'COMMIT;')).toBe(true)
    // BEGIN, DO guarda, DO seed, COMMIT.
    expect(sentencias).toHaveLength(4)
  })

  it('con el entorno marcado como produccion el seed aborta y no crea ninguna cuenta', async () => {
    const admin = clienteAdmin()
    const { data: previos } = await admin.auth.admin.listUsers()
    for (const usuario of previos!.users) {
      if (CUENTAS.some((c) => c.correo === usuario.email)) {
        await admin.auth.admin.deleteUser(usuario.id)
      }
    }
    // Punto de partida verificado: las tres cuentas NO existen. Sin esto, la
    // asercion de "no se creo ninguna" no distinguiria un seed abortado de un
    // seed que simplemente reescribio cuentas que ya estaban.
    expect(await correosExistentes()).toHaveLength(0)

    const resultado = await ejecutarSeed('production')

    expect(resultado.fallo, 'el seed NO fallo con app.entorno = production').toBe(true)
    expect(resultado.mensaje).toContain('El seed de desarrollo no se ejecuta en produccion')

    // Lo que de verdad importa: ninguna cuenta llego a existir. El archivo va
    // en una sola transaccion, asi que la excepcion de la guarda la deja
    // abortada y el segundo bloque DO no inserta nada.
    expect(await correosExistentes()).toHaveLength(0)

    // Caso positivo en el MISMO test: sin el marcador de produccion, el mismo
    // archivo, por la misma via, SI crea las tres cuentas. Sin esto, la prueba
    // pasaria aunque seed.sql estuviera vacio, fuera sintacticamente invalido
    // o fallara por cualquier otro motivo.
    const conEntornoLocal = await ejecutarSeed('local')
    expect(conEntornoLocal.fallo, conEntornoLocal.mensaje).toBe(false)
    expect((await correosExistentes()).sort()).toEqual(CUENTAS.map((c) => c.correo).sort())
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
