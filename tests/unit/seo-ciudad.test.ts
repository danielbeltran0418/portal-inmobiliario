import { afterEach, describe, expect, it, vi } from 'vitest'
import { datosFicha, metadatosBarrio, metadatosFicha } from '@/lib/catalogo/seo'

afterEach(() => vi.unstubAllEnvs())

const ficha = {
  titulo: 'Casa luminosa',
  slug: 'casa-a123',
  descripcion: 'Una casa',
  precio: 100000000,
  operacion: 'venta',
  imagenes_propiedad: [{ id: 'foto-1', alt_text: 'Fachada', orden: 0 }],
}

describe('SEO con alcance nacional: la ciudad sale del barrio, no esta fija', () => {
  it('usa la ciudad del barrio en titulos y datos estructurados', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
    const barrio = { nombre: 'El Poblado', slug: 'el-poblado', ciudad: 'Medellín' }
    expect(metadatosBarrio(barrio).title).toBe('Propiedades en El Poblado, Medellín')
    expect(metadatosFicha(ficha, barrio).title).toBe('Casa luminosa · El Poblado, Medellín')
    const lugar = datosFicha(ficha, barrio).contentLocation
    expect(lugar.name).toBe('El Poblado, Medellín')
    expect(lugar.address.addressLocality).toBe('Medellín')
    expect(lugar.address.addressCountry).toBe('CO')
  })

  it('sin ciudad conocida no inventa una: ni Barranquilla ni Atlantico', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
    const barrio = { nombre: 'El Prado', slug: 'el-prado' }
    const textos = JSON.stringify([metadatosBarrio(barrio), metadatosFicha(ficha, barrio), datosFicha(ficha, barrio)])
    expect(textos).not.toMatch(/Barranquilla|Atlántico/)
    expect(metadatosBarrio(barrio).title).toBe('Propiedades en El Prado')
    expect(datosFicha(ficha, barrio).contentLocation.address).toEqual({ '@type': 'PostalAddress', addressCountry: 'CO' })
  })
})
