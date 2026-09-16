'use client'

import { useState, useTransition } from 'react'
import { enviarMensajeComprador } from '@/app/(comprador)/mi-cuenta/solicitudes/acciones-ia'

export interface MensajeChat {
  id: string
  emisor: 'comprador' | 'agente_ia' | 'sistema' | string
  contenido: string
  creado_en: string
}

interface Props {
  conversacionId: string
  mensajesIniciales: MensajeChat[]
  estadoConversacion?: string
  franjaPropuesta?: string | null
}

export function ChatLeadIA({
  conversacionId,
  mensajesIniciales,
  estadoConversacion,
  franjaPropuesta,
}: Props) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>(mensajesIniciales)
  const [texto, setTexto] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)

  const limiteAlcanzado = mensajes.filter((m) => m.emisor === 'comprador').length >= 10

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim() || isPending || limiteAlcanzado) return

    const mensajeUsuario = texto.trim()
    setTexto('')
    setError(null)

    // Agregado optimista
    const optimista: MensajeChat = {
      id: 'opt-' + Date.now(),
      emisor: 'comprador',
      contenido: mensajeUsuario,
      creado_en: new Date().toISOString(),
    }
    setMensajes((prev) => [...prev, optimista])

    startTransition(async () => {
      const res = await enviarMensajeComprador(conversacionId, mensajeUsuario)
      if (res.ok && res.respuesta) {
        setMensajes((prev) => [
          ...prev,
          {
            id: 'resp-' + Date.now(),
            emisor: 'agente_ia',
            contenido: res.respuesta!,
            creado_en: new Date().toISOString(),
          },
        ])
      } else if (!res.ok) {
        setError(res.error ?? 'Error enviando mensaje')
      }
    })
  }

  return (
    <div className="mt-3" data-testid="chat-lead-ia">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        data-testid="boton-toggle-chat"
        className="text-xs font-medium text-marca hover:underline inline-flex items-center gap-1"
      >
        <span>{abierto ? 'Ocultar chat con el asistente' : 'Consultar dudas con el asistente virtual'}</span>
        <span className="rounded-full bg-marca/10 px-1.5 py-0.5 text-[10px] text-marca">
          {mensajes.length} msgs
        </span>
      </button>

      {abierto && (
        <div className="mt-3 rounded-lg border border-linea bg-superficie p-4" data-testid="cuerpo-chat">
          <div className="mb-3 flex items-center justify-between border-b border-linea pb-2 text-xs text-tinta-suave">
            <span>Asistente Virtual IA</span>
            {franjaPropuesta && (
              <span className="text-amber-600 font-medium" data-testid="badge-propuesta">
                Cita propuesta en proceso
              </span>
            )}
          </div>

          <div
            tabIndex={0}
            aria-label="Historial de mensajes"
            className="max-h-64 space-y-2 overflow-y-auto pr-1"
            data-testid="historial-mensajes"
          >
            {mensajes.map((m) => {
              const esComprador = m.emisor === 'comprador'
              return (
                <div
                  key={m.id}
                  data-testid={'mensaje-' + m.emisor}
                  className={'flex flex-col ' + (esComprador ? 'items-end' : 'items-start')}
                >
                  <span className="text-[10px] text-tinta-tenue mb-0.5">
                    {esComprador ? 'Tú' : 'Asistente'}
                  </span>
                  <div
                    className={'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap max-w-[85%] ' + (
                      esComprador
                        ? 'bg-marca text-white rounded-br-none'
                        : 'bg-fondo border border-linea text-tinta rounded-bl-none'
                    )}
                  >
                    {m.contenido}
                  </div>
                </div>
              )
            })}
            {isPending && (
              <div className="flex items-center gap-1.5 text-xs text-tinta-tenue" data-testid="asistente-escribiendo">
                <span className="animate-pulse">Asistente escribiendo...</span>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-2 text-xs text-rose-600" role="alert" data-testid="error-chat">
              {error}
            </div>
          )}

          {limiteAlcanzado ? (
            <p className="mt-3 text-xs text-tinta-suave italic border-t border-linea pt-2" data-testid="limite-turnos-alcanzado">
              Has alcanzado el límite de 10 mensajes para esta consulta. Tu vendedor se pondrá en contacto pronto.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-3 flex gap-2 border-t border-linea pt-2">
              <input
                type="text"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escribe tu pregunta o solicita un horario de visita..."
                maxLength={500}
                disabled={isPending}
                aria-label="Escribe tu mensaje"
                data-testid="input-mensaje-chat"
                className="flex-1 rounded-md border border-linea bg-fondo px-3 py-1.5 text-sm text-tinta focus:border-marca focus:outline-none"
              />
              <button
                type="submit"
                disabled={isPending || !texto.trim()}
                data-testid="boton-enviar-chat"
                className="rounded-md bg-marca px-3 py-1.5 text-xs font-semibold text-white hover:bg-marca-fuerte disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
