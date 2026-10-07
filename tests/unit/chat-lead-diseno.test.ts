import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

vi.mock('@/app/(comprador)/mi-cuenta/solicitudes/acciones-ia', () => ({ enviarMensajeComprador: vi.fn() }))
const { ChatLeadIA } = await import('@/components/mi-cuenta/chat-lead-ia')

const MENSAJES = [
  { id: 'm1', emisor: 'agente_ia', contenido: 'Hola, ¿en qué te ayudo?', creado_en: '2026-10-01T10:00:00Z' },
  { id: 'm2', emisor: 'comprador', contenido: '¿Permite mascotas?', creado_en: '2026-10-01T10:01:00Z' },
]

const pintar = (abiertoInicial: boolean) =>
  renderToStaticMarkup(
    createElement(ChatLeadIA, { conversacionId: 'c1', mensajesIniciales: MENSAJES, abiertoInicial }),
  )

describe('ChatLeadIA (diseño de Figma Make)', () => {
  it('cerrado: solo el boton para abrirlo, con su testid', () => {
    const html = pintar(false)
    expect(html).toContain('data-testid="boton-toggle-chat"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('data-testid="historial-mensajes"')
  })

  it('abierto: cabecera del asistente, historial accesible y burbujas por emisor', () => {
    const html = pintar(true)
    expect(html).toContain('Asistente IA')
    expect(html).toMatch(/data-testid="historial-mensajes"/)
    expect(html).toMatch(/aria-label="Historial de mensajes"/)
    expect(html).toContain('data-testid="mensaje-agente_ia"')
    expect(html).toContain('data-testid="mensaje-comprador"')
  })

  it('el historial anuncia los mensajes nuevos a los lectores de pantalla', () => {
    expect(pintar(true)).toMatch(/role="log"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="log"/)
  })

  it('el envio es un boton de icono con nombre accesible y sus testids', () => {
    const html = pintar(true)
    expect(html).toContain('data-testid="input-mensaje-chat"')
    expect(html).toMatch(/<button[^>]*data-testid="boton-enviar-chat"[^>]*>[\s\S]*?<span class="sr-only">Enviar<\/span>/)
  })
})
