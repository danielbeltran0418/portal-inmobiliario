export interface PropiedadParaCompletitud {
  descripcion: string | null
  barrio_id: string | null
  precio: number | null
  numeroDeImagenes: number
}

const DESCRIPCION_MINIMA = 40

/**
 * Lo que le falta a una propiedad para poder publicarse, en texto para el
 * vendedor. Vacio = lista.
 *
 * "Al menos una foto" y "El precio" son los DOS unicos requisitos que la
 * base impone de verdad (triggers propiedades_exigir_imagen y
 * propiedades_exigir_precio). El barrio y la descripcion son solo guia del
 * panel: se eligio publicacion directa, no moderacion, y una propiedad SI
 * puede publicarse sin ellos. Correccion del hallazgo Importante de la
 * revision final de rama: este comentario decia que solo la foto estaba
 * garantizada por la base -- quedo desactualizado en cuanto
 * 20260907000100 anadio el trigger de precio, sin que nadie lo tocara.
 * Ver puedePublicar() para la funcion que SI debe usarse para decidir si un
 * boton de publicar se deshabilita -- esta lista completa es solo para
 * mostrar, nunca para bloquear.
 */
export function faltantesParaPublicar(p: PropiedadParaCompletitud): string[] {
  const faltan: string[] = []
  if (p.numeroDeImagenes < 1) faltan.push('Al menos una foto')
  if (!p.barrio_id) faltan.push('El barrio')
  if (!p.precio || p.precio <= 0) faltan.push('El precio')
  if ((p.descripcion ?? '').trim().length < DESCRIPCION_MINIMA) {
    faltan.push(`Una descripcion de al menos ${DESCRIPCION_MINIMA} caracteres`)
  }
  return faltan
}

/**
 * Hallazgo Importante de la revision final de rama: [id]/page.tsx
 * deshabilitaba el boton "Publicar" con `faltantesParaPublicar(...).length >
 * 0`, que ademas de foto y precio tambien exige barrio y una descripcion de
 * al menos 40 caracteres -- dos requisitos que la base NO impone (son solo
 * guia, ver el comentario de arriba). Consecuencia real: una propiedad con
 * foto y precio pero sin barrio la publicaba la base sin problema (y
 * cambiarEstado, mas abajo en acciones.ts, tambien la dejaba pasar), pero el
 * boton del panel quedaba deshabilitado PARA SIEMPRE -- ningun vendedor
 * podia publicarla desde la pantalla, aunque ya cumpliera todo lo que hace
 * falta.
 *
 * DECISION DEL CONTROLADOR: manda la base. El boton se condiciona solo a las
 * DOS reglas que la base impone -- foto y precio --, nunca a barrio ni
 * descripcion. faltantesParaPublicar() se sigue usando tal cual para
 * PINTAR la lista completa de sugerencias (barrio y descripcion incluidos):
 * eso no cambia, solo deja de decidir si el boton se puede pulsar.
 */
export function puedePublicar(p: PropiedadParaCompletitud): boolean {
  return p.numeroDeImagenes >= 1 && p.precio !== null && p.precio > 0
}
