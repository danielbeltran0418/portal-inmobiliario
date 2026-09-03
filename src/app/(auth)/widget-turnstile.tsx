'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    turnstile?: { reset: (contenedor?: string | HTMLElement) => void }
  }
}

/**
 * Caja donde Turnstile pinta el desafio, o nada si el captcha no esta
 * configurado. El script que la rellena lo carga GuionTurnstile; api.js busca
 * por si solo los elementos con la clase `cf-turnstile` y le inyecta al
 * formulario un campo oculto `cf-turnstile-response` con el token.
 *
 * ---------------------------------------------------------------------------
 * Por que hay un reinicio
 * ---------------------------------------------------------------------------
 * Un token de Turnstile es de un solo uso: siteverify rechaza el segundo canje
 * con `timeout-or-duplicate`. Sin reiniciar el widget, el usuario que se
 * equivoca de contrasena una vez encontraria el segundo intento rechazado por
 * el captcha -- con un mensaje que no explica nada -- y ya no podria entrar sin
 * recargar la pagina a mano.
 *
 * `reiniciarCon` recibe el estado que devuelve el server action: cambia de
 * identidad en cada envio, y ese cambio es la senal para pedir un token nuevo.
 */
export function WidgetTurnstile({
  clave,
  reiniciarCon,
}: {
  clave: string | null
  reiniciarCon: unknown
}) {
  useEffect(() => {
    if (clave) window.turnstile?.reset()
  }, [clave, reiniciarCon])

  if (!clave) return null

  // data-refresh-expired: un token caduca a los cinco minutos. Sin esto, el
  // formulario que lleva un rato abierto se envia con un token muerto.
  return <div className="cf-turnstile" data-sitekey={clave} data-refresh-expired="auto" />
}
