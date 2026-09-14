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
  // El URL Standard de WHATWG obliga a los navegadores a ELIMINAR tabulador,
  // salto de linea y retorno de carro de una URL antes de resolverla -- y a
  // recortar el resto de controles C0 y el espacio de los extremos. Esto
  // significa que la cadena que este modulo valida y la cadena que el
  // navegador termina resolviendo pueden ser DISTINTAS: "/\t/malo.test" pasa
  // "empieza por /", "no empieza por //" y "sin contrabarra" tal cual, pero
  // el navegador lo resuelve como "//malo.test" -- protocolo relativo, fuera
  // del dominio.
  //
  // Por eso se RECHAZA en vez de limpiar. Si se limpiara el caracter de
  // control, volveria a haber dos cadenas -- la validada (limpia) y la que en
  // realidad viaja como `valor` -- y ese hueco es exactamente el fallo que
  // este chequeo cierra. Lo validado y lo usado tienen que ser la misma
  // cadena. Una ruta interna legitima no lleva espacios ni caracteres de
  // control, asi que cualquier aparicion, en cualquier posicion, es motivo de
  // rechazo. El rango cubre todos los controles C0 (\x00-\x1F) mas el espacio
  // (\x20).
  if (/[\x00-\x20]/.test(valor)) return '/'
  if (!valor.startsWith('/')) return '/'
  // `//malo.test` es un protocolo relativo: el navegador lo resuelve como
  // https://malo.test. Y la barra invertida la normalizan algunos navegadores
  // a `/`, asi que `/\malo.test` acabaria fuera igual.
  if (valor.startsWith('//') || valor.includes('\\')) return '/'
  return valor
}
