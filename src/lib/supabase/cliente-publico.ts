import { createClient } from '@supabase/supabase-js'

/** Sin cookies ni sesión: un vendedor visita el catálogo con los mismos permisos que un anónimo. */
export function crearClientePublico() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )
}
