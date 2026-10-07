import { describe, expect, it } from 'vitest'
import { GET } from '@/app/buscar/route'

const pedir = (consulta: string) => GET(new Request(`http://localhost/buscar${consulta}`))

describe('/buscar: puente del buscador de la portada hacia el catalogo de un barrio', () => {
  it('redirige al barrio con los filtros validos', async () => {
    const r = await pedir('?barrio=el-prado&operacion=venta&tipo=casa&precio_max=500000000')
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe('/el-prado?operacion=venta&tipo=casa&precio_max=500000000')
  })

  it('conserva el texto libre ya saneado', async () => {
    const r = await pedir('?barrio=el-prado&q=' + encodeURIComponent('casa (patio)'))
    expect(r.headers.get('location')).toBe('/el-prado?q=casa+patio')
  })

  it('sin filtros va al catalogo base del barrio', async () => {
    const r = await pedir('?barrio=riomar')
    expect(r.headers.get('location')).toBe('/riomar')
  })

  it('descarta filtros que no pasan la validacion del catalogo', async () => {
    const r = await pedir('?barrio=riomar&operacion=trueque&tipo=castillo&precio_max=abc')
    expect(r.headers.get('location')).toBe('/riomar')
  })

  it.each([
    ['sin barrio', ''],
    ['barrio vacio', '?barrio='],
    ['salto de ruta', '?barrio=../panel'],
    ['host externo', '?barrio=//evil.example'],
    ['esquema', '?barrio=https://evil.example'],
    ['mayusculas y espacios', '?barrio=El Prado'],
    ['barra', '?barrio=a/b'],
  ])('un barrio invalido (%s) vuelve a la portada, nunca a otra ruta', async (_caso, consulta) => {
    const r = await pedir(consulta)
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe('/')
  })

  it('la redireccion es relativa: no depende de la cabecera Host', async () => {
    const r = await pedir('?barrio=el-prado')
    expect(r.headers.get('location')?.startsWith('/')).toBe(true)
    expect(r.headers.get('location')).not.toMatch(/^\/\//)
  })
})

it('[campos colombianos] /buscar conserva estrato y habitaciones validos', async () => {
  const r = await GET(new Request('http://localhost/buscar?barrio=riomar&estrato_min=3&habitaciones_min=2&estrato_max=9'))
  expect(r.headers.get('location')).toBe('/riomar?estrato_min=3&habitaciones_min=2')
})

it('[ciudades] con ciudad redirige al catalogo de la ciudad con sus filtros', async () => {
  const r = await GET(new Request('http://localhost/buscar?ciudad=bogota&operacion=arriendo&q=patio'))
  expect(r.headers.get('location')).toBe('/ciudad/bogota?operacion=arriendo&q=patio')
})

it('[ciudades] una ciudad invalida vuelve a la portada', async () => {
  for (const c of ['../panel', '//evil.example', 'Bogotá']) {
    const r = await GET(new Request(`http://localhost/buscar?ciudad=${encodeURIComponent(c)}`))
    expect(r.headers.get('location')).toBe('/')
  }
})
