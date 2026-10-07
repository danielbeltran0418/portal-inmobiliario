'use client'

import { useState, useTransition } from 'react'
import { SendHorizontal, Sparkles } from 'lucide-react'
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
  /** Abre el chat ya desplegado (la pagina dedicada del chat). */
  abiertoInicial?: boolean
}

export function ChatLeadIA({
  conversacionId,
  mensajesIniciales,
  franjaPropuesta,
  abiertoInicial = false,
}: Props) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>(mensajesIniciales)
  const [texto, setTexto] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(abiertoInicial)

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
    <div className="mt-4" data-testid="chat-lead-ia">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        data-testid="boton-toggle-chat"
        className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-marca/40 px-3 text-sm font-semibold text-marca transition-colors hover:bg-marca-suave"
      >
        <Sparkles aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
        <span>{abierto ? 'Ocultar chat con el asistente' : 'Consultar dudas con el asistente virtual'}</span>
        <span className="rounded-full bg-marca-suave px-2 py-0.5 text-xs text-marca">
          {mensajes.length} msgs
        </span>
      </button>

      {abierto && (
        <div className="mt-3 flex flex-col overflow-hidden rounded-2xl border border-linea bg-superficie" data-testid="cuerpo-chat">
          <div className="flex items-center gap-3 border-b border-linea px-5 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-marca">
              <Sparkles aria-hidden="true" className="h-4 w-4 text-marca-contraste" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-tinta">Asistente IA</p>
              <p className="text-xs text-tinta-suave">Responde dudas y propone horarios de visita</p>
            </div>
            {franjaPropuesta && (
              <span className="rounded-full bg-aviso-suave px-2.5 py-1 text-xs font-medium text-aviso" data-testid="badge-propuesta">
                Cita propuesta en proceso
              </span>
            )}
          </div>

          <div
            tabIndex={0}
            role="log"
            aria-live="polite"
            aria-label="Historial de mensajes"
            className="max-h-80 space-y-4 overflow-y-auto p-5"
            data-testid="historial-mensajes"
          >
            {mensajes.map((m) => {
              const esComprador = m.emisor === 'comprador'
              return (
                <div
                  key={m.id}
                  data-testid={'mensaje-' + m.emisor}
                  className={'flex ' + (esComprador ? 'justify-end' : 'items-end justify-start gap-2')}
                >
                  {!esComprador && (
                    <span aria-hidden="true" className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-marca">
                      <Sparkles className="h-3 w-3 text-marca-contraste" strokeWidth={2} />
                    </span>
                  )}
                  <div
                    className={'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ' + (
                      esComprador
                        ? 'rounded-br-sm bg-marca text-marca-contraste'
                        : 'rounded-bl-sm border border-linea bg-fondo text-tinta'
                    )}
                  >
                    <span className="sr-only">{esComprador ? 'Tú: ' : 'Asistente: '}</span>
                    {m.contenido}
                  </div>
                </div>
              )
            })}
            {isPending && (
              <p role="status" className="text-xs text-tinta-tenue" data-testid="asistente-escribiendo">
                Asistente escribiendo…
              </p>
            )}
          </div>

          {error && (
            <div className="px-5 pb-2 text-xs text-peligro" role="alert" data-testid="error-chat">
              {error}
            </div>
          )}

          {limiteAlcanzado ? (
            <p className="border-t border-linea px-5 py-3 text-xs text-tinta-suave" data-testid="limite-turnos-alcanzado">
              Has alcanzado el límite de 10 mensajes para esta consulta. Tu vendedor se pondrá en contacto pronto.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-linea px-4 py-3">
              <input
                type="text"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escribe tu pregunta o solicita un horario de visita..."
                maxLength={500}
                disabled={isPending}
                aria-label="Escribe tu mensaje"
                data-testid="input-mensaje-chat"
                className="min-w-0 flex-1 rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta placeholder:text-tinta-tenue focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
              />
              <button
                type="submit"
                disabled={isPending || !texto.trim()}
                data-testid="boton-enviar-chat"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-marca text-marca-contraste transition-colors hover:bg-marca-fuerte disabled:cursor-not-allowed disabled:opacity-40"
              >
                <SendHorizontal aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                <span className="sr-only">Enviar</span>
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
