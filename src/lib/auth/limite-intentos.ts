import 'server-only'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'

export async function loginBloqueado(correo: string, ip: string): Promise<boolean> {
  const { data, error } = await crearClienteAdmin()
    .rpc('login_bloqueado', { p_correo: correo, p_ip: ip })
  // Ante un fallo de infraestructura se falla cerrado: bloquear es mas seguro
  // que dejar pasar intentos ilimitados.
  if (error) return true
  return data === true
}

export async function registrarIntentoLogin(
  correo: string, ip: string, exitoso: boolean,
): Promise<void> {
  await crearClienteAdmin()
    .rpc('registrar_intento_login', { p_correo: correo, p_ip: ip, p_exitoso: exitoso })
}
