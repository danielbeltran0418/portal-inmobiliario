import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), fetch: vi.fn() }))
vi.mock('@/lib/supabase/cliente-admin', () => ({ crearClienteAdmin: () => ({ rpc: mocks.rpc }) }))
import { POST } from '@/app/api/pagos/wompi/route'
const referencia = '00000000-0000-4000-8000-000000000001'
function evento() {
  return { event: 'transaction.updated', environment: 'test', timestamp: 1700000000,
    data: { transaction: { id: 'tx-123', reference: referencia, amount_in_cents: 3500000, currency: 'COP', status: 'APPROVED' } },
    signature: { properties: ['transaction.id','transaction.status','transaction.amount_in_cents'], checksum: createHash('sha256').update('tx-123APPROVED35000001700000000test_events_secreto').digest('hex') } }
}
const peticion = (valor: unknown) => new Request('https://portal.test/api/pagos/wompi', { method: 'POST', body: JSON.stringify(valor) })
beforeEach(() => {
  vi.unstubAllEnvs(); vi.clearAllMocks()
  vi.stubEnv('WOMPI_ENABLED','true'); vi.stubEnv('WOMPI_ENVIRONMENT','test')
  vi.stubEnv('WOMPI_PUBLIC_KEY','pub_test_clave'); vi.stubEnv('WOMPI_INTEGRITY_SECRET','test_integrity_secreto'); vi.stubEnv('WOMPI_EVENTS_SECRET','test_events_secreto')
  vi.stubGlobal('fetch',mocks.fetch)
  mocks.rpc.mockResolvedValue({ data: true, error: null })
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ data: evento().data.transaction })))
})
describe('webhook: no concede planes usando datos del navegador', () => {
  it('confirma únicamente la referencia que devuelve el API', async () => {
    const valor = evento(); valor.data.transaction.reference = '00000000-0000-4000-8000-000000000002'
    expect((await POST(peticion(valor))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('confirmar_orden_plan',expect.objectContaining({ p_id: referencia, p_estado: 'APPROVED' }))
  })
  it('rechaza monto manipulado antes de llamar al proveedor', async () => {
    const valor = evento(); valor.data.transaction.amount_in_cents++
    expect((await POST(peticion(valor))).status).toBe(401)
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('no mezcla producción con sandbox', async () => {
    const valor = evento(); valor.environment = 'prod'
    expect((await POST(peticion(valor))).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('falla cerrado cuando no hay proveedor o el API está caído', async () => {
    vi.stubEnv('WOMPI_ENABLED','false')
    expect((await POST(peticion(evento()))).status).toBe(503)
    vi.stubEnv('WOMPI_ENABLED','true'); mocks.fetch.mockRejectedValue(new Error('timeout'))
    expect((await POST(peticion(evento()))).status).toBe(502); expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('limita el cuerpo por bytes y no acepta JSON inválido', async () => {
    expect((await POST(new Request('https://portal.test', { method:'POST', body:'x'.repeat(32769) }))).status).toBe(413)
    expect((await POST(new Request('https://portal.test', { method:'POST', body:'{' }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})