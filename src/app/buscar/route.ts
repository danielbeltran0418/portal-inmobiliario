import { leerFiltros } from '@/lib/catalogo/filtros'

/**
 * Puente del buscador de la portada: el catalogo de un barrio vive en
 * /{barrio}, y un formulario GET no puede poner un campo en la ruta. Esta ruta
 * recibe ?barrio=&operacion=&tipo=&precio_max=, valida y redirige.
 *
 * La redireccion es RELATIVA y el barrio solo puede ser un slug (letras
 * minusculas, digitos y guiones): nada que venga del cliente puede producir una
 * URL externa, ni una ruta distinta de /{slug}. Ante cualquier duda, a la
 * portada. Que el barrio exista lo decide la pagina del catalogo (404).
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function redirigir(ruta: string): Response {
  return new Response(null, { status: 303, headers: { Location: ruta } })
}

export function GET(peticion: Request): Response {
  const parametros = new URL(peticion.url).searchParams
  const barrio = parametros.get('barrio') ?? ''
  if (barrio.length > 80 || !SLUG.test(barrio)) return redirigir('/')

  // leerFiltros descarta lo que no reconoce: lo que no pasa no llega a la URL.
  const filtros = leerFiltros({
    operacion: parametros.get('operacion') ?? undefined,
    tipo: parametros.get('tipo') ?? undefined,
    precio_min: parametros.get('precio_min') ?? undefined,
    precio_max: parametros.get('precio_max') ?? undefined,
  })

  const consulta = new URLSearchParams()
  if (filtros.operacion) consulta.set('operacion', filtros.operacion)
  if (filtros.tipo) consulta.set('tipo', filtros.tipo)
  if (filtros.precioMin !== undefined) consulta.set('precio_min', String(filtros.precioMin))
  if (filtros.precioMax !== undefined) consulta.set('precio_max', String(filtros.precioMax))

  const texto = consulta.toString()
  return redirigir(texto ? `/${barrio}?${texto}` : `/${barrio}`)
}
