const MAILPIT = 'http://127.0.0.1:54324'

/**
 * El CLI de Supabase levanta Mailpit para el correo local.
 * Si tu version del CLI usa Inbucket, el endpoint es
 * /api/v1/mailbox/<buzon> en lugar de /api/v1/messages.
 *
 * Importante: el enlace se extrae por la API JSON de Mailpit, nunca
 * renderizando el mensaje en su interfaz web. Abrirlo en el navegador
 * dispara el prefetch del enlace de verificacion y consume el token de
 * un solo uso -- la confirmacion posterior fallaria con otp_expired
 * aunque la aplicacion este correcta.
 */
export async function ultimoEnlaceDeConfirmacion(destinatario: string): Promise<string> {
  for (let intento = 0; intento < 20; intento++) {
    const lista = await fetch(`${MAILPIT}/api/v1/messages`).then((r) => r.json())
    const mensaje = lista.messages?.find(
      (m: { To: { Address: string }[] }) =>
        m.To?.some((t) => t.Address.toLowerCase() === destinatario.toLowerCase()),
    )

    if (mensaje) {
      const detalle = await fetch(`${MAILPIT}/api/v1/message/${mensaje.ID}`).then((r) => r.json())
      const cuerpo: string = detalle.HTML || detalle.Text || ''
      const encontrado = cuerpo.match(/https?:\/\/[^\s"'<>]*token_hash=[^\s"'<>]+/)
      if (encontrado) return encontrado[0].replace(/&amp;/g, '&')
    }

    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No llego el correo de confirmacion a ${destinatario}`)
}

export async function limpiarBuzon(): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
}
