/**
 * GA4 se integra en el SP1. Su dominio ya esta contemplado aqui para que
 * anadir la etiqueta no obligue a reabrir la CSP con prisa.
 */
const ORIGENES_SCRIPT = ['https://www.googletagmanager.com']
const ORIGENES_CONEXION = [
  'https://*.supabase.co',
  'https://www.google-analytics.com',
  'https://challenges.cloudflare.com',
]

// Sin Buffer: este modulo lo importa el middleware, que corre en el runtime
// Edge, donde Buffer no existe. crypto.getRandomValues y btoa si estan.
export function generarNonce(): string {
  const aleatorio = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...aleatorio))
}

export function construirCabeceras(nonce: string): Record<string, string> {
  // React usa eval() en DESARROLLO para reconstruir pilas de llamada y otras
  // ayudas de depuracion. Sin 'unsafe-eval' el navegador lo bloquea y la
  // consola se llena en cada carga de "eval() is not supported in this
  // environment" -- ruido que tapa las violaciones de CSP que si importan.
  //
  // En PRODUCCION React no lo usa nunca, y alli 'unsafe-eval' seria un agujero
  // de verdad: reabre la ejecucion de cadenas como codigo, que es justo lo que
  // cierran el nonce y 'strict-dynamic'. Por eso va condicionado, y hay una
  // prueba unitaria que fija que en produccion NO aparece.
  const evalDeDesarrollo = process.env.NODE_ENV !== 'production' ? ` 'unsafe-eval'` : ''

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${evalDeDesarrollo} ${ORIGENES_SCRIPT.join(' ')}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://*.supabase.co`,
    `font-src 'self'`,
    `connect-src 'self' ${ORIGENES_CONEXION.join(' ')}`,
    `frame-src https://challenges.cloudflare.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ')

  return {
    'Content-Security-Policy': csp,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=()',
  }
}
