import { leerFiltros, parametrosDeFiltros } from '@/lib/catalogo/filtros'

/**
 * Puente del buscador de la portada: el catalogo de un barrio vive en
 * /{barrio}, y un formulario GET no puede poner un campo en la ruta. Esta ruta
 * recibe ?barrio=&operacion=&tipo=&precio_max=&q=, valida y redirige.
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
  // La portada busca por ciudad (/ciudad/{slug}); el puente sigue aceptando
  // barrio para enlaces y busquedas guardadas antiguas.
  const ciudad = parametros.get('ciudad') ?? ''
  const barrio = parametros.get('barrio') ?? ''
  const destino = ciudad
    ? (ciudad.length <= 80 && SLUG.test(ciudad) ? `/ciudad/${ciudad}` : null)
    : (barrio.length <= 80 && SLUG.test(barrio) ? `/${barrio}` : null)
  if (!destino) return redirigir('/')

  // leerFiltros descarta lo que no reconoce: lo que no pasa no llega a la URL.
  // Primer valor de cada clave, como hacia .get(): un parametro repetido no
  // decide nada por su cuenta.
  const crudos: Record<string, string> = {}
  for (const [clave, valor] of parametros) if (!(clave in crudos)) crudos[clave] = valor
  // Sin pagina: una busqueda nueva siempre empieza en la primera.
  const texto = parametrosDeFiltros({ ...leerFiltros(crudos), pagina: undefined }).toString()
  return redirigir(texto ? `${destino}?${texto}` : destino)
}
