import { randomUUID } from 'node:crypto'

export const MENSAJE_GENERICO =
  'No pudimos completar la operacion. Intenta de nuevo en un momento.'

export const MENSAJE_CREDENCIALES = 'Correo o contrasena incorrectos.'

/**
 * Captcha no superado. Es el unico mensaje del formulario que pide una accion
 * concreta al usuario, y a proposito: si dijera lo mismo que MENSAJE_GENERICO,
 * quien tiene el token caducado no sabria que lo que le falta es rehacer el
 * desafio. No dice por que fallo -- token ausente, repetido, o siteverify
 * caido: eso solo le serviria a quien esta probando como saltarselo.
 */
export const MENSAJE_CAPTCHA =
  'No pudimos verificar que eres una persona. Vuelve a intentarlo.'

/**
 * Contrasena correcta, correo sin verificar. No abre enumeracion: Supabase
 * solo devuelve email_not_confirmed despues de validar la contrasena, asi que
 * quien lo ve ya demostro conocerla. Con el generico, el usuario recien
 * registrado no tenia forma de saber que le faltaba abrir el correo.
 */
export const MENSAJE_CORREO_SIN_VERIFICAR =
  'Tu correo todavia no esta verificado. Abre el enlace que te enviamos al registrarte.'

/**
 * /confirmar no pudo abrir sesion con el enlace. Puede que el correo SI haya
 * quedado verificado (el enlace de la plantilla por defecto verifica en
 * Supabase antes de llegar aqui, y solo falla el canje del codigo si se abre
 * en otro navegador), por eso se invita a probar el login antes que nada.
 */
export const MENSAJE_VERIFICACION_FALLIDA =
  'No pudimos abrir tu sesion con ese enlace. Si ya lo habias abierto, o lo abriste en otro ' +
  'navegador, intenta iniciar sesion; si el enlace caduco, registrate de nuevo.'

export const MENSAJE_REGISTRO_BLOQUEADO =
  'Se han creado demasiadas cuentas desde esta conexion. Intenta de nuevo en una hora.'

/**
 * Sin IP de confianza el registro se rechaza, y el mensaje dice que es de
 * configuracion y no del usuario: quien lo lea no puede hacer nada por su
 * cuenta, y quien opere el despliegue tiene que enterarse. La alternativa era
 * dejar pasar el alta sin limite, que es el agujero silencioso que
 * src/lib/http/ip-cliente.ts existe para evitar.
 */
export const MENSAJE_SIN_IP_CONFIABLE =
  'El registro no esta disponible en este momento por un problema de configuracion del servidor.'

/**
 * Fallo parcial de actualizarPropiedad() (acciones.ts): el UPDATE de
 * `propiedades` ya tuvo exito (precio, habitaciones, etc. quedaron
 * guardados) y es el upsert POSTERIOR sobre `propiedades_ubicacion` el que
 * fallo. MENSAJE_GENERICO habria sido deshonesto aqui -- decia "no pudimos
 * completar la operacion" cuando en realidad la mayor parte SI se guardo --
 * y el vendedor no tenia forma de saber que debia reintentar solo la
 * direccion, no todo el formulario.
 */
export const MENSAJE_UBICACION_NO_GUARDADA =
  'Guardamos los demas datos, pero no la direccion. Vuelve a intentarlo.'

export const MENSAJE_SIN_FOTOS =
  'Para publicar necesitas subir al menos una foto de la propiedad.'

export const MENSAJE_SIN_PRECIO =
  'Para publicar necesitas fijar un precio para la propiedad.'

/**
 * Red de seguridad para 23514 (check_violation) cuando NINGUNA de las dos
 * causas conocidas puede identificarse por el codigo solo.
 *
 * Hay DOS triggers que lanzan 23514 sobre `propiedades` -- propiedades_exigir_imagen
 * (20260904000300) y propiedades_exigir_precio (20260907000100) -- y ambos lo
 * hacen con el mismo ERRCODE. Postgres no da forma de distinguirlos desde el
 * codigo de error solo, y la regla de este modulo prohibe mirar el texto del
 * error para decidir el mensaje. La via elegida es evitar la ambiguedad ANTES
 * de llegar aqui: cambiarEstado() (acciones.ts) comprueba ambos requisitos
 * contra la fila real y devuelve MENSAJE_SIN_FOTOS o MENSAJE_SIN_PRECIO segun
 * corresponda, sin pasar por mapearError. Este mensaje combinado solo se
 * alcanza en el hueco entre esa comprobacion y el UPDATE (otra pestaña borra
 * la ultima foto o vacia el precio a mitad de la carrera) o si algun camino
 * futuro llega a 'publicada' sin pasar por cambiarEstado. Sin saber cual de
 * los dos disparo, el mensaje cubre ambos en vez de adivinar uno.
 */
export const MENSAJE_REQUISITOS_PUBLICACION =
  'Para publicar, la propiedad necesita al menos una foto y un precio.'

// Las cuatro causas de crear_lead() se distinguen ANTES de llegar a
// mapearError(): el RPC levanta mensajes distintos a proposito y el server
// action los traduce (Task 7). No se añade ninguna rama nueva aqui: la regla
// del modulo -- el mensaje nunca se construye a partir del error original --
// sigue intacta.
export const MENSAJE_LEAD_DUPLICADO = 'Ya contactaste sobre esta propiedad.'
export const MENSAJE_LEAD_NO_PUBLICADA = 'Esta propiedad ya no esta disponible.'
export const MENSAJE_LEAD_PROPIA = 'No puedes contactar sobre tu propia propiedad.'
export const MENSAJE_LEAD_YA_RESPONDIDO = 'Este lead ya fue respondido.'

const CODIGOS_DE_CREDENCIALES = new Set([
  'invalid_credentials',
  'user_not_found',
  'invalid_grant',
])

export interface ErrorPresentable {
  mensaje: string
  idCorrelacion: string
}

/**
 * Traduce cualquier error interno a un mensaje seguro.
 * El detalle completo se registra aparte, en registro_auditoria.
 *
 * Regla: el mensaje devuelto NUNCA se construye a partir del error original.
 */
export function mapearError(error: unknown): ErrorPresentable {
  const idCorrelacion = randomUUID()
  const codigo =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  if (CODIGOS_DE_CREDENCIALES.has(codigo)) {
    return { mensaje: MENSAJE_CREDENCIALES, idCorrelacion }
  }

  // 23514 = check_violation. Dos triggers de `propiedades` lo lanzan (ver el
  // comentario de MENSAJE_REQUISITOS_PUBLICACION arriba): esta rama es una
  // red de seguridad, no el camino normal. cambiarEstado() distingue las dos
  // causas ANTES de intentar el UPDATE y no depende de este mapeo para eso.
  if (codigo === 'email_not_confirmed') {
    return { mensaje: MENSAJE_CORREO_SIN_VERIFICAR, idCorrelacion }
  }

  if (codigo === '23514') {
    return { mensaje: MENSAJE_REQUISITOS_PUBLICACION, idCorrelacion }
  }

  return { mensaje: MENSAJE_GENERICO, idCorrelacion }
}

// SP5, visitas. Un mensaje por SQLSTATE propio de las funciones de citas
// (supabase/migrations/20260915000400 a 000600). Se traducen por error.code,
// nunca por error.message: el mensaje de Postgres es texto interno y cambia.
export const MENSAJE_VISITA_SOLICITUD_INEXISTENTE = 'No encontramos esa solicitud.'
export const MENSAJE_VISITA_NO_PARTICIPA = 'No puedes gestionar esta visita.'
export const MENSAJE_VISITA_LEAD_NO_ACEPTADO =
  'Solo puedes reservar cuando el vendedor haya aceptado tu solicitud.'
// VS004 agrupa varias causas a proposito (franja fuera de horario, bloqueada,
// fuera de horizonte, ocupada): a quien tantea como saltarse las reglas no le
// conviene saber cual.
export const MENSAJE_VISITA_FRANJA_NO_DISPONIBLE = 'Esa franja ya no est\u00e1 disponible. Elige otra.'
export const MENSAJE_VISITA_YA_RESERVADA = 'Ya tienes una visita reservada para esta propiedad.'
export const MENSAJE_VISITA_INEXISTENTE = 'No encontramos esa visita.'
export const MENSAJE_VISITA_YA_CANCELADA = 'Esta visita ya estaba cancelada.'
export const MENSAJE_VISITA_YA_EMPEZO = 'No se puede cambiar una visita que ya empez\u00f3.'
// 20260926000100: 3 faltas (cancelar o mover con menos de 8 horas) en 30 dias
// bloquean las citas 7 dias. No se dice hasta cuando: la pagina lo muestra
// aparte a quien esta bloqueado (mi_bloqueo_citas).
export const MENSAJE_VISITA_COMPRADOR_BLOQUEADO =
  'Tienes las reservas bloqueadas por cancelar o mover visitas con menos de 8 horas de antelaci\u00f3n.'
export const MENSAJE_VISITA_VENDEDOR_BLOQUEADO =
  'Este propietario no est\u00e1 recibiendo visitas en este momento.'

// Borrar una fila de disponibilidad que devuelve CERO filas: no existe o no es
// del vendedor. PostgREST no da error en ese caso; la accion lo detecta
// contando filas y no lo reporta como exito.
export const MENSAJE_HORARIO_NO_ENCONTRADO = 'Esa franja del horario ya no existe.'
export const MENSAJE_BLOQUEO_NO_ENCONTRADO = 'Esa fecha bloqueada ya no existe.'

// Map y no un objeto literal: con un objeto, un code 'constructor' o
// 'toString' encontraria una propiedad heredada del prototipo.
const MENSAJES_DE_CITA: ReadonlyMap<string, string> = new Map([
  ['VS001', MENSAJE_VISITA_SOLICITUD_INEXISTENTE],
  ['VS002', MENSAJE_VISITA_NO_PARTICIPA],
  ['VS003', MENSAJE_VISITA_LEAD_NO_ACEPTADO],
  ['VS004', MENSAJE_VISITA_FRANJA_NO_DISPONIBLE],
  ['VS005', MENSAJE_VISITA_YA_RESERVADA],
  ['VS006', MENSAJE_VISITA_INEXISTENTE],
  ['VS007', MENSAJE_VISITA_YA_CANCELADA],
  ['VS008', MENSAJE_VISITA_YA_EMPEZO],
  ['VS009', MENSAJE_VISITA_COMPRADOR_BLOQUEADO],
  ['VS010', MENSAJE_VISITA_VENDEDOR_BLOQUEADO],
])

/**
 * Traduce el error de un RPC de citas a un mensaje para el usuario. Mira SOLO
 * `code`; cualquier otro error, incluido un 42501 o un 23P01 sin traducir, cae
 * en el generico sin dejar ver el detalle.
 */
export function mensajeDeErrorCita(error: unknown): string {
  const codigo =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  return MENSAJES_DE_CITA.get(codigo) ?? MENSAJE_GENERICO
}
