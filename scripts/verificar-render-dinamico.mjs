#!/usr/bin/env node
/**
 * Guarda del criterio de aceptacion 8, sobre la SALIDA REAL DEL BUILD.
 *
 * ---------------------------------------------------------------------------
 * Por que existe
 * ---------------------------------------------------------------------------
 * El nonce de la CSP se genera por peticion en src/middleware.ts. Un HTML
 * escrito durante `next build` no puede llevarlo: sus <script> salen sin nonce
 * y, como la politica lleva 'strict-dynamic' (que hace que el navegador ignore
 * 'self'), quedan bloqueados y la pagina no hidrata. Eso ya se envio una vez en
 * esta rama.
 *
 * Hoy lo evita `export const dynamic = "force-dynamic"` en src/app/layout.tsx.
 * Las tres redes que habia no cubren su perdida:
 *   - tests/unit/render-dinamico.test.ts mira el layout RAIZ. Un segmento hijo
 *     que declare su propia configuracion no lo toca, y la prueba sigue verde.
 *   - la suite e2e corre contra `npm run dev`, donde todo es dinamico por
 *     definicion y el fallo no se manifiesta.
 *   - `npm run build` no afirma nada: prerenderizar es su trabajo normal.
 *
 * Esta guarda cierra el hueco desde el otro lado: no comprueba COMO esta
 * configurado el render, sino QUE PRODUJO el build. Sea cual sea el mecanismo
 * por el que una pagina acabe prerenderizada -- configuracion de segmento,
 * PPR, un cambio de version de Next, `output: 'export'` -- si aparece un HTML
 * de pagina en la salida, aqui se cae.
 *
 * ---------------------------------------------------------------------------
 * Por que no es un grep sobre la tabla de rutas
 * ---------------------------------------------------------------------------
 * La tabla que imprime `next build` es texto de presentacion: marcadores
 * unicode (`f` de dinamica, `o` de estatica, `*` de SSG) alineados con
 * caracteres de dibujo de arbol, sin contrato de estabilidad entre versiones.
 * Un grep sobre eso se rompe en silencio -- y una guarda que se rompe en
 * silencio es peor que ninguna, porque da por cubierto lo que ya no mira.
 *
 * Se usan en su lugar las dos salidas estructuradas del build:
 *   1. .next/prerender-manifest.json -> lo que el build DECLARA prerenderizado.
 *   2. los .html bajo .next/server/app -> lo que el build ESCRIBIO de verdad.
 * Las dos, no una: la primera es la intencion declarada y la segunda el
 * artefacto que `next start` sirve tal cual.
 *
 * ---------------------------------------------------------------------------
 * Autocomprobacion
 * ---------------------------------------------------------------------------
 * El modo de fallo que de verdad importa en una guarda es que pase por no
 * estar mirando nada. Por eso aborta si falta el directorio del build, si
 * falta el manifiesto, o si el barrido no encuentra NI UN SOLO .html: la linea
 * base conocida de este proyecto es exactamente uno (_global-error.html), asi
 * que cero significa que la ruta de barrido quedo obsoleta, no que todo este
 * bien.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'

const RAIZ_BUILD = '.next'
const DIRECTORIO_APP = join(RAIZ_BUILD, 'server', 'app')
const MANIFIESTO = join(RAIZ_BUILD, 'prerender-manifest.json')

/**
 * Lo unico que puede estar prerenderizado, y por que.
 *
 * No se permite por categoria (p. ej. "todos los route handlers") sino por
 * ruta exacta: cualquier prerenderizado nuevo, de pagina o de handler, tiene
 * que pasar por editar esta lista, que es donde queda registrada la decision.
 */
const PERMITIDOS = new Map([
  [
    '/_global-error',
    'Pagina de error global de Next. Se prerenderiza fuera del arbol del ' +
    'layout raiz, asi que force-dynamic no la alcanza. Sus scripts salen sin ' +
    'nonce y no hidratarian bajo la CSP: degradacion conocida y aceptada, ' +
    'impacto bajo (es la pantalla de ultimo recurso, sin interactividad).',
  ],
  [
    '/favicon.ico',
    'Recurso estatico servido por un route handler. No es HTML: no lleva ' +
    'scripts y el nonce no le aplica.',
  ],
])

const HTML_PERMITIDOS = new Set(['_global-error.html'])

const problemas = []

function abortar(mensaje) {
  console.error(`::error::${mensaje}`)
  process.exit(1)
}

// --- Autocomprobacion: que haya algo que mirar --------------------------------

if (!existsSync(DIRECTORIO_APP)) {
  abortar(
    `No existe ${DIRECTORIO_APP}. O no se ejecuto \`npm run build\` antes de ` +
    `esta guarda, o Next cambio la ruta de su salida. En ambos casos la ` +
    `guarda NO esta comprobando nada y no puede darse por superada.`,
  )
}

if (!existsSync(MANIFIESTO)) {
  abortar(
    `No existe ${MANIFIESTO}. Next lo escribe en todo build; su ausencia ` +
    `significa que la guarda perdio una de sus dos fuentes.`,
  )
}

// --- Fuente 1: lo que el build declara ---------------------------------------

let manifiesto
try {
  manifiesto = JSON.parse(readFileSync(MANIFIESTO, 'utf8'))
} catch (error) {
  abortar(`No se pudo leer ${MANIFIESTO}: ${error.message}`)
}

const declaradas = Object.keys(manifiesto.routes ?? {})
for (const ruta of declaradas) {
  if (!PERMITIDOS.has(ruta)) {
    problemas.push(
      `prerender-manifest.json declara "${ruta}" como prerenderizada.`,
    )
  }
}

const dinamicasPrerenderizadas = Object.keys(manifiesto.dynamicRoutes ?? {})
for (const ruta of dinamicasPrerenderizadas) {
  problemas.push(
    `prerender-manifest.json declara la ruta dinamica "${ruta}" con ` +
    `prerenderizado (generateStaticParams).`,
  )
}

// --- Fuente 2: lo que el build escribio --------------------------------------

function htmlBajo(directorio) {
  const encontrados = []
  for (const entrada of readdirSync(directorio)) {
    const ruta = join(directorio, entrada)
    if (statSync(ruta).isDirectory()) {
      encontrados.push(...htmlBajo(ruta))
    } else if (entrada.endsWith('.html')) {
      encontrados.push(ruta)
    }
  }
  return encontrados
}

const html = htmlBajo(DIRECTORIO_APP)

if (html.length === 0) {
  abortar(
    `El barrido de ${DIRECTORIO_APP} no encontro NINGUN .html. La linea base ` +
    `conocida de este proyecto es exactamente uno (_global-error.html), asi ` +
    `que cero no significa "todo dinamico": significa que el barrido dejo de ` +
    `mirar donde escribe Next. Revisar esta guarda antes de seguir.`,
  )
}

for (const ruta of html) {
  const relativa = relative(DIRECTORIO_APP, ruta).split(sep).join(posix.sep)
  if (!HTML_PERMITIDOS.has(relativa)) {
    problemas.push(
      `el build escribio ${ruta}: \`next start\` serviria ese HTML tal cual, ` +
      `con sus <script> sin nonce.`,
    )
  }
}

// --- Veredicto ---------------------------------------------------------------

if (problemas.length > 0) {
  console.error('')
  console.error('Hay paginas prerenderizadas en la salida del build.')
  console.error('')
  for (const problema of problemas) {
    console.error(`  - ${problema}`)
  }
  console.error('')
  console.error(
    'Una pagina prerenderizada no puede llevar el nonce de la CSP, que se ' +
    'genera por peticion en src/middleware.ts. Como la politica incluye ' +
    "'strict-dynamic', el navegador ignora 'self' y bloquea esos scripts: la " +
    'pagina se sirve pero no hidrata.',
  )
  console.error('')
  console.error('Salidas posibles, en orden de preferencia:')
  console.error(
    '  1. Quitar la configuracion de segmento que provoca el prerenderizado ' +
    '(force-static, revalidate, generateStaticParams) y comprobar que ' +
    'src/app/layout.tsx sigue declarando force-dynamic.',
  )
  console.error(
    '  2. Si la ruta DEBE cachearse (el catalogo publico del SP1 es el caso ' +
    'previsto), la salida no es debilitar esta guarda: es que ' +
    'construirCabeceras emita una politica propia sin nonce ni ' +
    "'strict-dynamic' para esa ruta, y bajar force-dynamic a los segmentos " +
    'que si reciben nonce. Eso es diseno del SP1, y entonces esa ruta se ' +
    'anade a PERMITIDOS con su motivo escrito.',
  )
  console.error('')
  process.exit(1)
}

console.log(
  `Render dinamico verificado: ninguna pagina prerenderizada fuera de la ` +
  `lista permitida (${[...PERMITIDOS.keys()].join(', ')}).`,
)
