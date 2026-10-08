import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const accesoAdmin = vi.fn()
const consulta = vi.fn()

const cliente = {
  from: () => {
    const q = { select: () => q, order: () => q, limit: () => consulta() }
    return q
  },
}

vi.mock('@/lib/auth/admin', () => ({ accesoAdmin }))

const { aCsv, filasModeracionCsv } = await import('@/lib/admin/csv')
const { GET } = await import('@/app/(admin)/control/moderacion/exportar/route')

describe('aCsv', () => {
  it('separa con comas, termina en CRLF y escapa comillas, comas y saltos', () => {
    expect(aCsv(['a', 'b'], [['uno', 'dos, tres'], ['di "hola"', 'linea\nnueva']])).toBe(
      'a,b\r\nuno,"dos, tres"\r\n"di ""hola""","linea\nnueva"\r\n',
    )
  })

  it('neutraliza formulas: una celda que empieza por = + - @ no se ejecuta en la hoja', () => {
    const csv = aCsv(['t'], [['=HYPERLINK("x")'], ['+1'], ['-2'], ['@SUM(A1)'], ['\tx']])
    const celdas = csv.split('\r\n').slice(1, -1)
    expect(celdas).toEqual([`"'=HYPERLINK(""x"")"`, `'+1`, `'-2`, `'@SUM(A1)`, `'\tx`])
  })

  it('null y undefined salen como celda vacia; numeros y booleanos tal cual', () => {
    expect(aCsv(['a', 'b', 'c'], [[null, 1500000, true]])).toBe('a,b,c\r\n,1500000,true\r\n')
  })
})

describe('filasModeracionCsv', () => {
  it('aplana barrio y vendedor y no exporta el telefono', () => {
    const { cabecera, filas } = filasModeracionCsv([{
      id: 'p1', titulo: 'Casa', operacion: 'venta', estado: 'publicada', destacada: false,
      precio: 300000000, creado_en: '2026-10-01T10:00:00Z',
      vendedor: { nombre: 'Ana', telefono: '3001234567' }, barrios: { nombre: 'El Prado' },
    }])
    expect(cabecera).not.toContain('telefono')
    expect(filas[0]).toContain('Ana')
    expect(filas[0]).toContain('El Prado')
    expect(filas[0]).not.toContain('3001234567')
  })
})

describe('GET /control/moderacion/exportar', () => {
  beforeEach(() => {
    accesoAdmin.mockReset().mockResolvedValue({ estado: 'ok', cliente, adminId: 'admin' })
    consulta.mockReset().mockResolvedValue({
      data: [{ id: 'p1', titulo: 'Casa', operacion: 'venta', estado: 'publicada', destacada: true, precio: 1, creado_en: '2026-10-01T00:00:00Z', vendedor: null, barrios: null }],
      error: null,
    })
  })

  const pedir = () => GET()

  it('el super admin descarga un CSV con BOM, como adjunto y sin cache', async () => {
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="moderacion-\d{4}-\d{2}-\d{2}\.csv"$/)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const cuerpo = new Uint8Array(await res.arrayBuffer())
    expect([...cuerpo.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(cuerpo)).toContain('Casa')
  })

  it('otro rol recibe 403 y no se consulta nada', async () => {
    accesoAdmin.mockResolvedValue({ estado: 'no_admin' })
    const res = await pedir()
    expect(res.status).toBe(403)
    expect(consulta).not.toHaveBeenCalled()
  })

  it('un super_admin sin segundo factor en la sesion recibe 403 (M2)', async () => {
    accesoAdmin.mockResolvedValue({ estado: 'falta_mfa', cliente, adminId: 'admin' })
    const res = await pedir()
    expect(res.status).toBe(403)
    expect(consulta).not.toHaveBeenCalled()
  })

  it('sin sesion recibe 401', async () => {
    accesoAdmin.mockResolvedValue({ estado: 'sin_sesion' })
    expect((await pedir()).status).toBe(401)
  })

  it('un fallo de la base es un 500, no un CSV vacio que parezca valido', async () => {
    consulta.mockResolvedValue({ data: null, error: { message: 'x' } })
    expect((await pedir()).status).toBe(500)
  })
})
