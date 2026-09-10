/**
 * Prueba de viabilidad, NO configura la CSP de produccion.
 * Requiere un build y Chromium de Playwright. Usa el HTML estatico real de
 * _global-error porque el catalogo aun no esta separado del layout dinamico.
 * Los hashes solo se calculan sobre ese artefacto local de confianza.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from '@playwright/test'

const htmlOriginal = await readFile('.next/server/app/_global-error.html', 'utf8')
const navegador = await chromium.launch()
let servidor
try {
  const lector = await navegador.newPage()
  const scripts = await lector.evaluate((html) =>
    Array.from(new DOMParser().parseFromString(html, 'text/html')
      .querySelectorAll('script:not([src])'))
      .filter((s) => !s.type || s.type === 'text/javascript')
      .map((s) => s.textContent), htmlOriginal)
  await lector.close()
  assert.ok(scripts.length > 0, 'No hay scripts inline que verificar')
  const hashes = scripts.map((s) =>
    "'sha256-" + createHash('sha256').update(s).digest('base64') + "'")
  let modo = 'self'
  servidor = createServer(async (peticion, respuesta) => {
    try {
      const ruta = new URL(peticion.url, 'http://localhost').pathname
      if (ruta.startsWith('/_next/static/')) {
        const base = path.resolve('.next/static')
        const fichero = path.resolve(base, decodeURIComponent(ruta.slice('/_next/static/'.length)))
        if (!fichero.startsWith(base + path.sep)) {
          respuesta.writeHead(404).end()
          return
        }
        respuesta.setHeader('Content-Type', fichero.endsWith('.js') ? 'application/javascript'
          : fichero.endsWith('.css') ? 'text/css' : 'application/octet-stream')
        respuesta.end(await readFile(fichero))
        return
      }
      let html = htmlOriginal
      if (modo === 'mutado') {
        html = html.replace(scripts[0], scripts[0] + ';window.__cspMutacion=true;')
      }
      html = html.replace('</body>', '<script>window.__cspAtaque=true</script></body>')
      respuesta.setHeader('Content-Type', 'text/html; charset=utf-8')
      respuesta.setHeader('Content-Security-Policy',
        "default-src 'self'; script-src 'self' " +
        (modo === 'self' ? '' : hashes.join(' ')) +
        "; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'")
      respuesta.end(html)
    } catch {
      respuesta.writeHead(404).end()
    }
  })
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve))
  for (modo of ['self', 'hashes', 'mutado']) {
    const pagina = await navegador.newPage()
    await pagina.addInitScript(() => {
      window.__violaciones = []
      document.addEventListener('securitypolicyviolation', (e) => {
        if (e.effectiveDirective === 'script-src-elem') {
          window.__violaciones.push(e.blockedURI)
        }
      })
    })
    await pagina.goto('http://127.0.0.1:' + servidor.address().port, { waitUntil: 'networkidle' })
    const resultado = await pagina.evaluate(() => ({
      ataque: !!window.__cspAtaque,
      mutacion: !!window.__cspMutacion,
      violaciones: window.__violaciones,
    }))
    assert.equal(resultado.ataque, false, 'Se ejecuto el script inyectado')
    assert.equal(resultado.mutacion, false, 'Se ejecuto un script alterado')
    // No usar __next_f como prueba: los bundles externos tambien lo inicializan.
    const esperadas = modo === 'self' ? scripts.length + 1 : modo === 'hashes' ? 1 : 2
    assert.equal(resultado.violaciones.length, esperadas,
      'Numero inesperado de scripts bloqueados en modo ' + modo)
    assert.ok(resultado.violaciones.every((uri) => uri === 'inline'))
    console.log(JSON.stringify({ modo, scriptsInline: scripts.length,
      scriptsBloqueados: resultado.violaciones.length, ataqueEjecutado: resultado.ataque }))
    await pagina.close()
  }
  console.log('Viabilidad CSP con hashes verificada; no acredita hidratacion del catalogo ni ISR.')
} finally {
  await navegador.close()
  if (servidor?.listening) await new Promise((resolve) => servidor.close(resolve))
}
