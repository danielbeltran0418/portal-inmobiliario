import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

vi.mock('@/app/(auth)/login/acciones', () => ({ iniciarSesion: vi.fn() }))
vi.mock('@/app/(auth)/registro/acciones', () => ({ registrarUsuario: vi.fn() }))

import { MarcoAcceso } from '@/components/acceso/marco-acceso'
import { FormularioLogin } from '@/app/(auth)/login/formulario'
import { FormularioRegistro } from '@/app/(auth)/registro/formulario'

const contar = (html: string, patron: RegExp) => (html.match(patron) ?? []).length

describe('MarcoAcceso (diseño de Figma Make: foto a la izquierda, formulario a la derecha)', () => {
  const html = renderToStaticMarkup(createElement(MarcoAcceso, null, createElement('p', null, 'contenido')))

  it('pinta el contenido en el panel del formulario', () => {
    expect(html).toContain('<p>contenido</p>')
  })

  it('lleva la foto de acceso, decorativa', () => {
    expect(html).toContain('url(/acceso.jpg)')
    expect(html).toMatch(/aria-hidden="true"[^>]*style="[^"]*acceso\.jpg|acceso\.jpg[^>]*aria-hidden="true"/)
  })

  it('no inventa testimonios: el prototipo traia una cita de una compradora ficticia', () => {
    expect(html).not.toMatch(/Valentina|Compradora/)
  })

  it('el logo vuelve a la portada', () => {
    expect(html).toContain('href="/"')
  })
})

describe('formularios de acceso dentro del marco', () => {
  it('login: mismos campos y un solo boton de envio (los E2E dependen de ello)', () => {
    const html = renderToStaticMarkup(createElement(FormularioLogin, { claveTurnstile: null, volver: null }))
    expect(html).toContain('url(/acceso.jpg)')
    expect(html).toMatch(/<h1[^>]*>Iniciar sesión<\/h1>/)
    expect(html).toContain('name="correo"')
    expect(html).toContain('name="password"')
    expect(contar(html, /type="submit"/g)).toBe(1)
    expect(html).toContain('href="/registro"')
  })

  it('registro: mismos campos, el rol con radios visibles y un solo boton de envio', () => {
    const html = renderToStaticMarkup(createElement(FormularioRegistro, { claveTurnstile: null }))
    expect(html).toContain('url(/acceso.jpg)')
    expect(html).toMatch(/<h1[^>]*>Crea tu cuenta<\/h1>/)
    for (const campo of ['nombre', 'correo', 'telefono', 'password']) {
      expect(html).toContain(`name="${campo}"`)
    }
    expect(html).toContain('value="comprador"')
    expect(html).toContain('value="vendedor"')
    expect(html).not.toMatch(/value="vendedor"[^>]*class="[^"]*sr-only/)
    expect(contar(html, /type="submit"/g)).toBe(1)
    expect(html).toContain('href="/login"')
  })
})
