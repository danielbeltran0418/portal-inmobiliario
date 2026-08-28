import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * SALTA RLS POR COMPLETO. Usar solo para operaciones del sistema:
 * escribir auditoria y consultar el limite de intentos de login.
 * Nunca para atender datos que el usuario pidio.
 */
export function crearClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
