import { Client } from 'pg'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { config } from 'dotenv'

// .env.local es una comodidad del desarrollador, NO la fuente de verdad. Esta
// en .gitignore y en CI no existe: alli las variables llegan por el entorno del
// job. Cargarlo incondicionalmente hacia que las pruebas dependieran de un
// archivo que el runner nunca tiene.
// override: false -- lo que ya este exportado en el entorno gana sobre el
// archivo, para poder apuntar la suite a otra pila sin editar nada.
if (existsSync('.env.local')) {
  config({ path: '.env.local', override: false, quiet: true })
}

const OBLIGATORIAS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  // Conexion directa a Postgres. La necesita la prueba de la guarda del seed,
  // que ejecuta supabase/seed.sql de verdad: eso no se puede hacer por la API
  // REST.
  'SUPABASE_DB_URL',
] as const

// Fallo ruidoso y con instrucciones. La version anterior usaba `process.env.X!`:
// con la variable ausente, el cliente se construia con `undefined` y la suite
// moria mucho despues con un "Invalid URL" o un 401 que no decia nada del
// verdadero problema.
function entornoDePruebas(): Record<(typeof OBLIGATORIAS)[number], string> {
  const faltantes = OBLIGATORIAS.filter((nombre) => !process.env[nombre])

  if (faltantes.length > 0) {
    throw new Error(
      [
        `Faltan variables de entorno obligatorias: ${faltantes.join(', ')}.`,
        '',
        'Las pruebas corren contra la pila local de Supabase. Para obtenerlas:',
        '  1. npx supabase start',
        '  2. npx supabase status -o env',
        '',
        'En local, copialas a .env.local con estos nombres (ese archivo NO se',
        'commitea; .env.example lista las claves esperadas):',
        '  NEXT_PUBLIC_SUPABASE_URL      <- API_URL',
        '  NEXT_PUBLIC_SUPABASE_ANON_KEY <- ANON_KEY',
        '  SUPABASE_SERVICE_ROLE_KEY     <- SERVICE_ROLE_KEY',
        '  SUPABASE_DB_URL               <- DB_URL',
        '',
        'En CI, exportalas al entorno del job (ver .github/workflows/ci.yml).',
      ].join('\n'),
    )
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL as string,
  }
}

const entorno = entornoDePruebas()
const URL = entorno.NEXT_PUBLIC_SUPABASE_URL
const ANON = entorno.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = entorno.SUPABASE_SERVICE_ROLE_KEY

export const URL_BASE_DE_DATOS = entorno.SUPABASE_DB_URL

export function clienteAnonimo(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false } })
}

export function clienteAdmin(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { persistSession: false } })
}

export async function crearUsuarioDePrueba(opciones: {
  correo: string
  password: string
  rol: 'comprador' | 'vendedor' | 'super_admin'
  nombre?: string
}): Promise<string> {
  const admin = clienteAdmin()
  let usuarioId: string | undefined

  // Creación optimista directa: para correos efímeros con randomUUID()
  // evita consultar y paginar cientos de usuarios por petición.
  const { data, error } = await admin.auth.admin.createUser({
    email: opciones.correo,
    password: opciones.password,
    email_confirm: true,
    user_metadata: { nombre: opciones.nombre ?? 'Usuario Prueba', telefono: '3001234567' },
  })

  if (!error && data?.user?.id) {
    usuarioId = data.user.id
  } else {
    // Si falla (por ejemplo, cuenta fija ya existente de una corrida anterior),
    // buscarla y eliminarla para recrearla limpiamente.
    let pagina = 1
    const paginasVisitadas = new Set<number>()
    while (pagina) {
      if (paginasVisitadas.has(pagina)) break
      paginasVisitadas.add(pagina)
      const { data: listData, error: listError } = await admin.auth.admin.listUsers({ page: pagina, perPage: 50 })
      if (listError) throw listError
      const existente = listData.users.find((u) => u.email === opciones.correo)
      if (existente) {
        const { error: errorBorrado } = await admin.auth.admin.deleteUser(existente.id)
        if (errorBorrado) throw errorBorrado
        break
      }
      if (!listData.nextPage || listData.nextPage <= pagina || listData.users.length === 0) break
      pagina = listData.nextPage
    }

    const reintento = await admin.auth.admin.createUser({
      email: opciones.correo,
      password: opciones.password,
      email_confirm: true,
      user_metadata: { nombre: opciones.nombre ?? 'Usuario Prueba', telefono: '3001234567' },
    })

    if (reintento.error) {
      if (URL_BASE_DE_DATOS?.startsWith('postgres://') || URL_BASE_DE_DATOS?.startsWith('postgresql://')) {
        const db = new Client({ connectionString: URL_BASE_DE_DATOS })
        await db.connect()
        try {
          await db.query('DELETE FROM auth.users WHERE email = $1', [opciones.correo])
        } finally {
          await db.end()
        }
        const fallback = await admin.auth.admin.createUser({
          email: opciones.correo,
          password: opciones.password,
          email_confirm: true,
          user_metadata: { nombre: opciones.nombre ?? 'Usuario Prueba', telefono: '3001234567' },
        })
        if (fallback.error) throw fallback.error
        usuarioId = fallback.data.user.id
      } else {
        throw reintento.error
      }
    } else {
      usuarioId = reintento.data.user.id
    }
  }

  // El rol se fija por SQL directo: la aplicacion nunca lo asigna.
  const { error: errorRol } = await admin
    .from('perfiles')
    .update({ rol: opciones.rol })
    .eq('id', usuarioId)
  if (errorRol) throw errorRol

  return usuarioId
}

export async function clienteComo(correo: string, password: string): Promise<SupabaseClient> {
  const cliente = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await cliente.auth.signInWithPassword({ email: correo, password })
  if (error) throw error
  return cliente
}

// Vendedor EFIMERO, con correo unico por llamada -- NO la cuenta fija del
// seed (vendedor@portal.com). Esa cuenta la borra y recrea seed.test.ts
// dentro de su prueba del guardia de produccion, y vitest corre los
// ficheros de prueba en paralelo por defecto (no hay fileParallelism: false
// ni singleFork en vitest.config.ts): una suite que este a mitad de
// sesionVendedor() mientras seed.test.ts borra esa misma cuenta se
// encuentra con "AuthRetryableFetchError: Database error granting user".
// Reproducido: 1 de cada ~3 corridas de `npm run test:rls` completo caia en
// rojo por esto, sin que el trigger de esta tarea tuviera nada que ver.
// randomUUID() en el correo es lo que elimina la colision, tanto con
// seed.test.ts como entre esta funcion llamada desde varias suites a la vez.
export async function sesionVendedor(): Promise<SupabaseClient> {
  const correo = `vendedor-${randomUUID()}@prueba.test`
  const password = 'VendedorEfimero2026*'
  await crearUsuarioDePrueba({ correo, password, rol: 'vendedor', nombre: 'Vendedor Efimero' })
  return clienteComo(correo, password)
}


/** Inventario completo para fixtures; no confundir la primera página con toda la base. */
export async function listarUsuariosDePrueba() {
  const users: User[] = []
  let page = 1
  const paginasVisitadas = new Set<number>()
  while (page) {
    if (paginasVisitadas.has(page)) break
    paginasVisitadas.add(page)
    const { data, error } = await clienteAdmin().auth.admin.listUsers({ page, perPage: 50 })
    if (error) throw error
    users.push(...data.users)
    if (!data.nextPage || data.nextPage <= page || data.users.length === 0) break
    page = data.nextPage
  }
  return { data: { users }, error: null }
}
