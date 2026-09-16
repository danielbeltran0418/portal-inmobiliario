'use client'

import { useState } from 'react'

export interface MensajeUI {
  id: string
  emisor: 'comprador' | 'agente_ia' | 'sistema' | string
  contenido: string
  creado_en: string
}

interface Props {
  conversacionId?: string
  mensajes: MensajeUI[]
  tituloPropiedad?: string | null
  nombreComprador?: string | null
}

export function DrawerConversacionIA({
  mensajes,
  tituloPropiedad,
  nombreComprador,
}: Props) {
  const [abierto, setAbierto] = useState(false)

  if (!mensajes || mensajes.length === 0) {
    return null
  }

  return (
    <div className="mt-3" data-testid="drawer-conversacion-ia">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        data-testid="boton-toggle-conversacion"
        className="text-xs font-medium text-marca hover:underline"
      >
        {abierto ? 'Ocultar conversación con IA' : 'Ver conversación con IA'} ({mensajes.length} turnos)
      </button>

      {abierto && (
        <div
          role="region"
          aria-label="Transcripción de conversación"
          className="mt-3 rounded-lg border border-linea bg-superficie p-4 space-y-3"
          data-testid="panel-transcripcion"
        >
          <div className="flex items-center justify-between border-b border-linea pb-2 text-xs text-tinta-suave">
            <span>Asistente Virtual IA {tituloPropiedad ? '· ' + tituloPropiedad : ''}</span>
            {nombreComprador && <span>Comprador: {nombreComprador}</span>}
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {mensajes.map((m) => {
              const esComprador = m.emisor === 'comprador'
              return (
                <div
                  key={m.id}
                  data-testid={'burbuja-' + m.emisor}
                  className={'flex flex-col ' + (esComprador ? 'items-end' : 'items-start')}
                >
                  <span className="text-[10px] text-tinta-tenue mb-0.5" data-testid="etiqueta-rol">
                    {esComprador ? (nombreComprador ?? 'Comprador') : 'Asistente Virtual'}
                  </span>
                  <div
                    className={'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap max-w-[85%] ' + (
                      esComprador
                        ? 'bg-marca text-white rounded-br-none'
                        : 'bg-fondo border border-linea text-tinta rounded-bl-none'
                    )}
                  >
                    {/* Renderizado directo en JSX: React escapa automáticamente contra XSS */}
                    {m.contenido}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}