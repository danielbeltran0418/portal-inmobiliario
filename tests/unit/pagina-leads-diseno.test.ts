import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('server-only', () => ({}))
const leads = vi.fn()
vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'v1' } } }) } }),
}))
vi.mock('next/navigation', () => ({ redirect: (r: string) => { throw new Error(`REDIRECT:${r}`) } }))
vi.mock('@/lib/leads/consultas', () => ({ listarLeadsDelVendedor: () => leads() }))
vi.mock('@/lib/ia/consultas', () => ({ listarConversacionesVendedor: async () => ({}) }))
vi.mock('@/app/(vendedor)/panel/leads/acciones', () => ({ aceptarLead: vi.fn(), descartarLead: vi.fn() }))

const { default: PaginaLeads } = await import('@/app/(vendedor)/panel/leads/page')

const NUEVO = {
  id: 'l1', nombre_mostrado: 'Valentina Ospina', mensaje: '¿Se puede visitar el sábado?', estado: 'nuevo',
  creado_en: '2026-09-24T15:00:00Z', propiedades: { titulo: 'Apartamento en Alto Prado', slug: 'apto' },
  leads_contacto: null,
}
const ACEPTADO = {
  ...NUEVO, id: 'l2', estado: 'aceptado', nombre_mostrado: 'Andrés Mena',
  leads_contacto: { correo: 'andres@correo.test', telefono: '3001234567' },
}

beforeEach(() => leads.mockResolvedValue([NUEVO, ACEPTADO]))

describe('bandeja de leads (diseño de Figma Make)', () => {
  it('titulo y cuantas solicitudes estan pendientes', async () => {
    const html = renderToStaticMarkup(await PaginaLeads())
    expect(html).toMatch(/<h1[^>]*>Bandeja de leads<\/h1>/)
    expect(html).toContain('1 solicitud pendiente')
  })

  it('cada lead lleva las iniciales del comprador y la propiedad', async () => {
    const html = renderToStaticMarkup(await PaginaLeads())
    expect(html).toContain('>VO<')
    expect(html).toContain('Apartamento en Alto Prado')
  })

  it('un lead nuevo oculta el contacto y ofrece aceptar y revelarlo', async () => {
    const html = renderToStaticMarkup(await PaginaLeads())
    expect(html).toContain('Contacto visible al aceptar')
    expect(html).toMatch(/<button[^>]*value="aceptar"[^>]*>Aceptar y revelar contacto<\/button>/)
    expect(html).toMatch(/<button[^>]*value="descartar"[^>]*>Descartar<\/button>/)
  })

  it('un lead aceptado muestra correo y telefono', async () => {
    const html = renderToStaticMarkup(await PaginaLeads())
    expect(html).toContain('andres@correo.test')
    expect(html).toContain('3001234567')
  })
})
