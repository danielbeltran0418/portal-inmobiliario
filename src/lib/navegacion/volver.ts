/**
 * Ruta a la que volver tras iniciar sesion, saneada.
 *
 * El parametro `volver` viaja en la URL, asi que lo controla quien mande el
 * enlace. Sin sanear es un redirect abierto: basta con `?volver=https://malo`
 * para que el portal lleve al usuario a un sitio ajeno justo despues de que
 * escriba su contrasena.
 *
 * Se valida por forma y no con `new URL()` porque lo unico aceptable es una
 * ruta interna, y eso se decide mirando como empieza. Ante cualquier duda, la
 * portada: degradar a un destino seguro nunca rompe nada.
 */
export function rutaDeRetorno(valor: string | null): string {
  if (!valor) return '/'
  if (!valor.startsWith('/')) return '/'
  // `//malo.test` es un protocolo relativo: el navegador lo resuelve como
  // https://malo.test. Y la barra invertida la normalizan algunos navegadores
  // a `/`, asi que `/\malo.test` acabaria fuera igual.
  if (valor.startsWith('//') || valor.includes('\\')) return '/'
  return valor
}
