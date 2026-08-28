import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const COMPRADOR = { correo: 'aud-comprador@prueba.test', password: 'ClaveDePrueba123!' }
const ADMIN = { correo: 'aud-admin@prueba.test', password: 'ClaveDePrueba123!' }
// Etiqueta unica por corrida: el conteo exacto no puede depender de cuantas
// filas ya existan en la tabla (la suite puede correrse varias veces sin
// `db reset` entre medio, y algun dia habra escritores reales de auditoria).
// Filtrando por esta etiqueta, la prueba solo mira la fila que ESTA corrida
// inserto, sin importar que mas haya en la tabla.
const ACCION_DE_ESTA_CORRIDA = `prueba-${Date.now()}`

describe('RLS de registro_auditoria', () => {
  beforeAll(async () => {
    await crearUsuarioDePrueba({ ...COMPRADOR, rol: 'comprador' })
    await crearUsuarioDePrueba({ ...ADMIN, rol: 'super_admin' })
    await clienteAdmin().from('registro_auditoria').insert({
      accion: ACCION_DE_ESTA_CORRIDA, entidad: 'sistema', metadatos: { detalle: 'evento de prueba' },
    })
  })

  it('el comprador NO lee el registro de auditoria', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { data } = await cliente.from('registro_auditoria')
      .select('id').eq('accion', ACCION_DE_ESTA_CORRIDA)
    expect(data ?? []).toHaveLength(0)
  })

  it('el super admin SI lee el registro', async () => {
    // Control positivo del caso anterior: prueba que la fila existe y que
    // solo esta oculta para el comprador, no que este ausente para todos.
    // Conteo exacto sobre la fila de ESTA corrida (identificada por
    // ACCION_DE_ESTA_CORRIDA), no sobre el total de la tabla: asi la
    // aserción sigue siendo precisa aunque la suite corra dos veces
    // seguidas sin `db reset`, o aunque otra fuente ya haya escrito en
    // registro_auditoria antes de este describe.
    const cliente = await clienteComo(ADMIN.correo, ADMIN.password)
    const { data } = await cliente.from('registro_auditoria')
      .select('id').eq('accion', ACCION_DE_ESTA_CORRIDA)
    expect(data).toHaveLength(1)
  })

  it('el comprador NO puede escribir en el registro', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { error } = await cliente.from('registro_auditoria')
      .insert({ accion: 'falsificada', entidad: 'sistema' })
    expect(error).not.toBeNull()
    // No hay GRANT de INSERT para authenticated: el rechazo ocurre a nivel
    // de privilegio de tabla, antes de evaluar RLS. SQLSTATE 42501
    // (insufficient_privilege), igual que en propiedades/barrios/imagenes.
    expect(error?.code).toBe('42501')
  })
})
