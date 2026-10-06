import { describe, it, expect, vi, beforeEach } from 'vitest'

// CN-009: las cookies de sesion que fija crearClienteServidor (login,
// /confirmar) deben llevar las mismas banderas que las del proxy.
const fijar = vi.fn()
let setAllCapturado: ((c: { name: string; value: string; options: Record<string, unknown> }[]) => void) | undefined

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: fijar }),
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_u: string, _k: string, opciones: { cookies: { setAll: typeof setAllCapturado } }) => {
    setAllCapturado = opciones.cookies.setAll
    return {}
  },
}))

describe('crearClienteServidor: banderas de las cookies de sesion', () => {
  beforeEach(() => {
    fijar.mockClear()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
  })

  it('fuerza httpOnly, sameSite lax y secure en produccion', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { crearClienteServidor } = await import('@/lib/supabase/cliente-servidor')
    await crearClienteServidor()

    setAllCapturado!([{ name: 'sb-access-token', value: 'v', options: { httpOnly: false, maxAge: 60 } }])

    expect(fijar).toHaveBeenCalledWith('sb-access-token', 'v', expect.objectContaining({
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60,
    }))
  })
})
