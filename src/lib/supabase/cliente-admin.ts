import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * SALTA RLS POR COMPLETO. Usar solo para operaciones del sistema:
 * escribir auditoria y consultar el limite de intentos de login.
 * Nunca para atender datos que el usuario pidio.
 *
 * Sin las variables, supabase-js lanza "supabaseKey is required", que en el
 * log de Vercel no dice cual falta ni donde configurarla. Pasa en cuanto un
 * entorno (tipicamente Preview) no tiene la clave: login y registro caen.
 */
export function crearClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) {
    throw new Error(
      `Falta ${!url ? 'NEXT_PUBLIC_SUPABASE_URL' : 'SUPABASE_SERVICE_ROLE_KEY'} en este entorno ` +
      '(en Vercel: Settings -> Environment Variables, marcada para Production y Preview).',
    )
  }
  return createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } })
}
