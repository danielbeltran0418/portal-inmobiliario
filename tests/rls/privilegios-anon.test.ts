import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'
import { clienteAnonimo, URL_BASE_DE_DATOS } from './ayudantes'

/**
 * Privilegios de tabla del rol `anon`.
 *
 * Supabase concede de fabrica el CRUD completo a anon sobre toda tabla nueva
 * del esquema public. Sobre las seis tablas de SP0 eso no era explotable hoy
 * -- RLS deniega por defecto y PostgREST no expone TRUNCATE -- pero TRUNCATE y
 * MAINTAIN quedan FUERA del alcance de RLS por diseno de PostgreSQL, asi que
 * ahi no hay segunda capa. Y el riesgo de composicion es real: una politica
 * `FOR ALL TO anon` anadida en el SP1 creyendo que solo abre lectura abriria
 * escritura anonima sobre todo lo publicado.
 *
 * La prueba enumera las tablas EN TIEMPO DE EJECUCION, no contra una lista
 * fija de seis. Una lista fija habria seguido en verde el dia que el SP1
 * anadiera una tabla con los privilegios de fabrica intactos, que es
 * exactamente el escenario contra el que se escribe esto.
 *
 * Se consulta pg_class.relacl y no information_schema.role_table_grants: la
 * vista del estandar SQL no reporta MAINTAIN (privilegio propio de PostgreSQL
 * 17), que es justo el que se le habia pasado a la revision anterior.
 */

const ESCRITURA = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
  'MAINTAIN',
] as const

let base: Client

async function tablasDePublic(): Promise<string[]> {
  const { rows } = await base.query<{ relname: string }>(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  `)
  return rows.map((f) => f.relname)
}

async function privilegiosDeAnon(tabla: string): Promise<string[]> {
  const { rows } = await base.query<{ privilegio: string; concedido: boolean }>(
    `
    SELECT p AS privilegio,
           has_table_privilege('anon', format('public.%I', $1::text)::regclass, p) AS concedido
    FROM unnest($2::text[]) AS p
  `,
    [tabla, [...ESCRITURA]],
  )
  return rows.filter((f) => f.concedido).map((f) => f.privilegio)
}

describe('privilegios de tabla del rol anon', () => {
  beforeAll(async () => {
    base = new Client({ connectionString: URL_BASE_DE_DATOS })
    await base.connect()
  })

  afterAll(async () => {
    await base.end()
  })

  it('el barrido encuentra las seis tablas de SP0', async () => {
    // Autocomprobacion. Sin ella, un filtro mal escrito devolveria una lista
    // vacia y el `for` de la prueba siguiente no ejecutaria ni una asercion:
    // verde sin haber mirado nada. Es un `toContain` y no un `toEqual` a
    // proposito -- el SP1 va a anadir tablas y esta prueba no debe estorbar.
    const tablas = await tablasDePublic()
    expect(tablas).toEqual(
      expect.arrayContaining([
        'barrios',
        'imagenes_propiedad',
        'intentos_login',
        'perfiles',
        'propiedades',
        'registro_auditoria',
      ]),
    )
  })

  it('anon no tiene ningun privilegio de escritura sobre ninguna tabla de public', async () => {
    const tablas = await tablasDePublic()
    const sobrantes: string[] = []

    for (const tabla of tablas) {
      const concedidos = await privilegiosDeAnon(tabla)
      if (concedidos.length > 0) {
        sobrantes.push(`${tabla}: ${concedidos.join(', ')}`)
      }
    }

    expect(sobrantes).toEqual([])
  })

  it('los privilegios por defecto no reintroducen la escritura en tablas nuevas', async () => {
    // El REVOKE sobre ALL TABLES solo alcanza a las que existen al aplicarlo.
    // Sin el ALTER DEFAULT PRIVILEGES, la primera tabla del SP1 nace otra vez
    // con el CRUD completo para anon. Se comprueba creando una de verdad:
    // leer pg_default_acl diria como esta configurado, no que efecto tiene.
    await base.query('CREATE TABLE public.sonda_privilegios (id int PRIMARY KEY)')
    try {
      const concedidos = await privilegiosDeAnon('sonda_privilegios')
      expect(concedidos).toEqual([])
    } finally {
      await base.query('DROP TABLE public.sonda_privilegios')
    }
  })

  it('la lectura publica del catalogo sigue funcionando', async () => {
    // Caso positivo. Sin el, todas las aserciones de arriba pasarian igual si
    // el REVOKE se hubiera llevado por delante los GRANT SELECT de columna de
    // 20260831000300 y anon hubiera dejado de leer nada en absoluto.
    const { error } = await clienteAnonimo()
      .from('propiedades')
      .select('id, slug, titulo, precio, estado')
      .limit(1)
    expect(error).toBeNull()
  })

  it('anon sigue sin poder leer direccion, latitud ni longitud', async () => {
    // La otra mitad del caso positivo: el REVOKE de escritura no debe haber
    // aflojado la restriccion de columnas que ya existia.
    const { error } = await clienteAnonimo().from('propiedades').select('direccion').limit(1)
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })
})
