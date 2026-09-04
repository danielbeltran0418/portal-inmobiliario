import { rolDesdeToken, rutaDePanel, type Rol } from '@/lib/auth/roles'
import type { Sesion } from '@/lib/auth/sesion'

export interface Enlace {
  readonly etiqueta: string
  readonly destino: string
}

/**
 * El DESTINO de cada rol no se decide aqui: lo decide rutaDePanel, que lee la
 * tabla RUTAS_PROTEGIDAS de src/lib/auth/roles.ts -- la misma que usa el
 * middleware para dejar pasar o no. Aqui solo se le pone nombre visible.
 *
 * Duplicar la correspondencia rol -> ruta abriria la puerta a que la cabecera
 * ofrezca un enlace que el middleware rechaza.
 */
const ETIQUETA_DE_PANEL: Record<Rol, string> = {
  comprador: 'Mi cuenta',
  vendedor: 'Panel',
  super_admin: 'Control',
}

export const ENLACE_ENTRAR: Enlace = { etiqueta: 'Entrar', destino: '/login' }
export const ENLACE_REGISTRO: Enlace = { etiqueta: 'Crear cuenta', destino: '/registro' }

/**
 * El panel que le corresponde a esta sesion, o null si no hay sesion.
 *
 * hayUsuario manda sobre el token. Un access token en la cookie no es prueba
 * de nada -- la cookie la manda el navegador -- y sin la validacion de
 * getUser() bastaria con pegar un JWT cualquiera para que la cabecera
 * anunciara el panel del super admin. Ese enlace no daria acceso (el
 * middleware y RLS siguen ahi), pero la interfaz estaria mintiendo.
 */
export function enlaceDePanel(sesion: Sesion): Enlace | null {
  if (!sesion.hayUsuario) return null

  // rolDesdeToken cae en 'comprador' ante un token ausente o corrupto: el rol
  // de menos privilegio.
  const rol = rolDesdeToken(sesion.accessToken ?? '')
  return { etiqueta: ETIQUETA_DE_PANEL[rol], destino: rutaDePanel(rol) }
}

export interface EstadoCabecera {
  readonly autenticado: boolean
  readonly enlaces: readonly Enlace[]
}

/**
 * Que enlaces enseña la cabecera. Sin sesion, las dos puertas de entrada; con
 * sesion, el panel del rol (y el boton de cerrar sesion, que no es un enlace
 * sino un formulario y por eso no sale en esta lista).
 */
export function estadoDeCabecera(sesion: Sesion): EstadoCabecera {
  const panel = enlaceDePanel(sesion)

  if (!panel) {
    return { autenticado: false, enlaces: [ENLACE_ENTRAR, ENLACE_REGISTRO] }
  }

  return { autenticado: true, enlaces: [panel] }
}
