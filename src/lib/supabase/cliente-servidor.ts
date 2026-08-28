import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function crearClienteServidor() {
  const almacen = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (cookiesAEstablecer) => {
          try {
            for (const { name, value, options } of cookiesAEstablecer) {
              almacen.set(name, value, options)
            }
          } catch {
            // Llamado desde un Server Component: el middleware ya refresco la sesion.
          }
        },
      },
    },
  )
}
