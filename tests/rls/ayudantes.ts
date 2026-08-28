import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

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
  await admin.auth.admin.listUsers().then(({ data }) => {
    const existente = data?.users.find((u) => u.email === opciones.correo)
    return existente ? admin.auth.admin.deleteUser(existente.id) : null
  })

  const { data, error } = await admin.auth.admin.createUser({
    email: opciones.correo,
    password: opciones.password,
    email_confirm: true,
    user_metadata: { nombre: opciones.nombre ?? 'Usuario Prueba', telefono: '3001234567' },
  })
  if (error) throw error

  // El rol se fija por SQL directo: la aplicacion nunca lo asigna.
  const { error: errorRol } = await admin
    .from('perfiles')
    .update({ rol: opciones.rol })
    .eq('id', data.user.id)
  if (errorRol) throw errorRol

  return data.user.id
}

export async function clienteComo(correo: string, password: string): Promise<SupabaseClient> {
  const cliente = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await cliente.auth.signInWithPassword({ email: correo, password })
  if (error) throw error
  return cliente
}
